import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { calculateFidelityReport } from './fidelity.js'
import type {
  FidelityCertification,
  FidelityEvidence,
  FidelityItem,
  PreviousCertifiedValue,
} from './fidelity.js'
import { createSupabaseClient, fetchAllItems, rootPath } from './utils.js'

interface ExtendedMenuRow {
  id: string
  name: string
  category: string | null
  description: string | null
  restaurant: { park: { location: string | null } | null } | null
  nutritional_data: Array<{
    carbs: number | null
    serving_quantity: number | null
    serving_unit: string | null
    serving_description: string | null
    active_certification_id: string | null
  }>
}

interface CertificationRow {
  id: string
  menu_item_id: string
  tier: FidelityCertification['tier']
  status: FidelityCertification['status']
  canonical_carbs: number | null
  serving_quantity: number | null
  serving_unit: string | null
  serving_description: string | null
  reviewed_at: string
  expires_at: string | null
  nutrition_certification_evidence: Array<{
    nutrition_source: {
      id: string
      source_type: FidelityEvidence['sourceType']
      upstream_source_key: string | null
      reported_carbs: number
      normalized_carbs: number | null
      serving_quantity: number | null
      serving_unit: string | null
      serving_description: string | null
      exact_item_match: boolean
      exact_serving_match: boolean
      source_url: string
    } | null
  }>
}

function isMissingFidelitySchema(message: string): boolean {
  return /active_certification_id|nutrition_certifications|serving_quantity|schema cache/i.test(message)
}

function previousValues(): Record<string, PreviousCertifiedValue> {
  const path = rootPath('audit', 'fidelity-results.json')
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      certifiedValues?: Record<string, PreviousCertifiedValue>
    }
    return parsed.certifiedValues ?? {}
  } catch {
    return {}
  }
}

function multiServing(name: string, description: string | null): boolean {
  return /\b(dozen|whole|family|serves?\s+\d|sharing|sampler|flight|bucket|platter)\b/i.test(`${name} ${description ?? ''}`)
}

function configurable(name: string, description: string | null): boolean {
  return /\b(build your own|choose your|customi[sz]|choice of|create your own)\b/i.test(`${name} ${description ?? ''}`)
}

async function fetchExtendedRows(): Promise<ExtendedMenuRow[] | null> {
  const supabase = createSupabaseClient()
  const rows: ExtendedMenuRow[] = []
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('menu_items')
      .select(`id, name, category, description,
        restaurant:restaurants(park:parks(location)),
        nutritional_data(carbs, serving_quantity, serving_unit, serving_description, active_certification_id)`)
      .range(from, from + pageSize - 1)
    if (error) {
      if (isMissingFidelitySchema(error.message)) return null
      throw error
    }
    if (!data || data.length === 0) break
    rows.push(...(data as unknown as ExtendedMenuRow[]))
    if (data.length < pageSize) break
  }

  return rows
}

async function fetchCertificationMap(): Promise<Map<string, FidelityCertification>> {
  const supabase = createSupabaseClient()
  const map = new Map<string, FidelityCertification>()
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('nutrition_certifications')
      .select(`id, menu_item_id, tier, status, canonical_carbs,
        serving_quantity, serving_unit, serving_description, reviewed_at, expires_at,
        nutrition_certification_evidence(
          nutrition_source:nutrition_sources(
            id, source_type, upstream_source_key, reported_carbs, normalized_carbs,
            serving_quantity, serving_unit, serving_description,
            exact_item_match, exact_serving_match, source_url
          )
        )`)
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break

    for (const raw of data as unknown as CertificationRow[]) {
      const evidence = raw.nutrition_certification_evidence.flatMap((link): FidelityEvidence[] => {
        const source = link.nutrition_source
        if (!source || source.reported_carbs == null || source.source_type == null) return []
        return [{
          id: source.id,
          sourceType: source.source_type,
          upstreamSourceKey: source.upstream_source_key,
          carbs: source.normalized_carbs ?? source.reported_carbs,
          serving: {
            quantity: source.serving_quantity,
            unit: source.serving_unit,
            description: source.serving_description,
          },
          exactItemMatch: source.exact_item_match === true,
          exactServingMatch: source.exact_serving_match === true,
          // Link monitoring is added in the monitoring task. Until then this
          // means provenance is addressable, not that an HTTP check just ran.
          retrievable: source.source_url.trim().length > 0,
        }]
      })

      map.set(raw.id, {
        id: raw.id,
        tier: raw.tier,
        status: raw.status,
        canonicalCarbs: raw.canonical_carbs,
        serving: {
          quantity: raw.serving_quantity,
          unit: raw.serving_unit,
          description: raw.serving_description,
        },
        reviewedAt: raw.reviewed_at,
        expiresAt: raw.expires_at,
        evidence,
      })
    }
    if (data.length < pageSize) break
  }

  return map
}

async function fallbackItems(): Promise<FidelityItem[]> {
  const rows = await fetchAllItems(createSupabaseClient())
  return rows.map(row => {
    const nutrition = row.nutritional_data?.[0]
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      parkLocation: null,
      carbs: nutrition?.carbs ?? null,
      serving: { quantity: null, unit: null, description: null },
      certification: null,
      isMultiServing: multiServing(row.name, row.description),
      isConfigurable: configurable(row.name, row.description),
      hasFixedConfiguration: false,
    }
  })
}

async function main() {
  const now = new Date()
  const extendedRows = await fetchExtendedRows()
  const schemaReady = extendedRows !== null
  const certificationMap = schemaReady ? await fetchCertificationMap() : new Map<string, FidelityCertification>()
  const items = extendedRows == null
    ? await fallbackItems()
    : extendedRows.map((row): FidelityItem => {
        const nutrition = row.nutritional_data?.[0]
        const isMultiServing = multiServing(row.name, row.description)
        const isConfigurable = configurable(row.name, row.description)
        return {
          id: row.id,
          name: row.name,
          category: row.category,
          parkLocation: row.restaurant?.park?.location ?? null,
          carbs: nutrition?.carbs ?? null,
          serving: {
            quantity: nutrition?.serving_quantity ?? null,
            unit: nutrition?.serving_unit ?? null,
            description: nutrition?.serving_description ?? null,
          },
          certification: nutrition?.active_certification_id
            ? certificationMap.get(nutrition.active_certification_id) ?? null
            : null,
          isMultiServing,
          isConfigurable,
          hasFixedConfiguration: !isMultiServing && !isConfigurable,
        }
      })

  const report = calculateFidelityReport(items, now, previousValues())
  const certifiedValues = Object.fromEntries(items.flatMap(item => item.certification
    ? [[item.id, { certificationId: item.certification.id, carbs: item.carbs }]]
    : []))
  const output = {
    schemaReady,
    shadowMode: true,
    ...report,
    reviewQueue: report.reviewQueue.slice(0, 500),
    certifiedValues,
  }
  const outputPath = rootPath('audit', 'fidelity-results.json')
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')

  console.log(`Fidelity schema:       ${schemaReady ? 'ready' : 'not deployed (shadow fallback)'}`)
  console.log(`Dosing-grade carbs:    ${report.metrics.dosingGradeCount}/${report.metrics.totalItems} (${report.metrics.dosingGradePct}%)`)
  console.log(`Serving basis present: ${report.metrics.explicitServingCount}/${report.metrics.totalItems}`)
  console.log(`HIGH findings:         ${report.findings.filter(entry => entry.severity === 'HIGH').length}`)
  console.log(`Report:                ${outputPath}`)
}

main().catch(error => {
  console.error('Fidelity audit failed:', error)
  process.exit(1)
})
