import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { buildBackfillPlan } from './backfill-evidence.js'
import type { LegacyNutritionRecord, LegacySourceReference } from './backfill-evidence.js'
import { createSupabaseClient, rootPath } from '../audit/utils.js'
import { dosingPriorityScore } from '../audit/trust.js'

interface MenuRow {
  id: string
  name: string
  category: string | null
  restaurant: { park: { location: string | null } | null } | null
  nutritional_data: Array<{
    carbs: number | null
    source: string | null
    source_detail: string | null
    confidence_score: number | null
  }>
}

interface SourceRow {
  id: string
  menu_item_id: string
  source_name: string
  source_url: string
}

async function fetchMenuRows(): Promise<MenuRow[]> {
  const supabase = createSupabaseClient()
  const rows: MenuRow[] = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('menu_items')
      .select(`id, name, category,
        restaurant:restaurants(park:parks(location)),
        nutritional_data(carbs, source, source_detail, confidence_score)`)
      .order('id')
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...(data as unknown as MenuRow[]))
    if (data.length < pageSize) break
  }
  return rows
}

async function fetchLegacySources(): Promise<Map<string, LegacySourceReference[]>> {
  const supabase = createSupabaseClient()
  const byItem = new Map<string, LegacySourceReference[]>()
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('nutrition_sources')
      .select('id, menu_item_id, source_name, source_url')
      .order('id')
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const source of data as SourceRow[]) {
      const references = byItem.get(source.menu_item_id) ?? []
      references.push({ id: source.id, sourceName: source.source_name, sourceUrl: source.source_url })
      byItem.set(source.menu_item_id, references)
    }
    if (data.length < pageSize) break
  }
  return byItem
}

async function main() {
  if (process.argv.includes('--apply') || process.argv.includes('--apply-evidence')) {
    throw new Error('Backfill apply mode is locked until the dry-run plan is explicitly approved')
  }

  const [menuRows, sourcesByItem] = await Promise.all([fetchMenuRows(), fetchLegacySources()])
  const records: LegacyNutritionRecord[] = menuRows.map(row => {
    const nutrition = row.nutritional_data?.[0]
    return {
      menuItemId: row.id,
      itemName: row.name,
      source: nutrition?.source ?? null,
      sourceDetail: nutrition?.source_detail ?? null,
      carbs: nutrition?.carbs ?? null,
      confidence: nutrition?.confidence_score ?? null,
      serving: { quantity: null, unit: null, description: null },
      exactItemMatch: false,
      exactServingMatch: false,
      legacySources: sourcesByItem.get(row.id) ?? [],
    }
  })
  const plan = buildBackfillPlan(records)
  const priorityByItem = new Map(menuRows.map(row => {
    const carbs = row.nutritional_data?.[0]?.carbs ?? null
    return [row.id, dosingPriorityScore(row.category, row.restaurant?.park?.location ?? null, carbs)]
  }))
  const reviewQueue = [...plan.entries]
    .sort((first, second) =>
      (priorityByItem.get(second.menuItemId) ?? 0) - (priorityByItem.get(first.menuItemId) ?? 0)
      || first.menuItemId.localeCompare(second.menuItemId),
    )
    .slice(0, 500)
  const fullPlanHash = createHash('sha256').update(JSON.stringify(plan)).digest('hex')
  const output = {
    generatedAt: new Date().toISOString(),
    mode: 'dry-run',
    ...plan.summary,
    fullPlanHash,
    canonicalChanges: plan.canonicalChanges,
    reviewQueue,
  }
  const outputPath = rootPath('audit', 'fidelity-backfill-plan.json')
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')

  console.log(`Records classified: ${plan.summary.total}`)
  console.log(`Tier A candidates:  ${plan.summary.tiers.A}`)
  console.log(`Tier C estimates:   ${plan.summary.tiers.C}`)
  console.log(`Tier D/unreviewed:  ${plan.summary.tiers.D}`)
  console.log(`Quarantined:        ${plan.summary.quarantined}`)
  console.log(`Canonical changes:  ${plan.summary.canonicalChangeCount}`)
  console.log(`Plan:               ${outputPath}`)
}

main().catch(error => {
  console.error('Evidence backfill planning failed:', error)
  process.exit(1)
})
