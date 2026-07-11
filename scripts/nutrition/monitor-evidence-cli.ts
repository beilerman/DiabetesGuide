import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import * as cheerio from 'cheerio'
import {
  buildExpiryQueue,
  evidenceBlastRadius,
  evaluateEvidenceCheck,
} from './monitor-evidence.js'
import type {
  CertificationExpiryTarget,
  EvidenceCheckResult,
  EvidenceMonitorTarget,
  EvidenceObservation,
} from './monitor-evidence.js'
import { createSupabaseClient, rootPath } from '../audit/utils.js'
import { dosingPriorityScore } from '../audit/trust.js'

interface SourceRow {
  id: string
  menu_item_id: string
  source_url: string
  content_hash: string | null
  upstream_source_key: string | null
  reported_item_name: string | null
  serving_description: string | null
}

interface CertificationRow {
  id: string
  menu_item_id: string
  expires_at: string
  menu_item: {
    category: string | null
    restaurant: { park: { location: string | null } | null } | null
    nutritional_data: Array<{ carbs: number | null }>
  } | null
}

interface EvidenceCheckRow {
  nutrition_source_id: string
  content_hash: string | null
}

function missingSchema(message: string): boolean {
  return /content_hash|upstream_source_key|nutrition_evidence_checks|nutrition_certifications|schema cache/i.test(message)
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase()
}

async function retrieve(target: EvidenceMonitorTarget): Promise<EvidenceObservation> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(target.sourceUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'DiabetesGuide-EvidenceMonitor/1.0' },
    })
    const contentType = response.headers.get('content-type') ?? ''
    const buffer = Buffer.from(await response.arrayBuffer())
    let hashInput = buffer
    let searchableText: string | null = null

    if (/html|text/i.test(contentType)) {
      const html = buffer.toString('utf8')
      const $ = cheerio.load(html)
      $('script, style, noscript, svg').remove()
      searchableText = normalizedText($.root().text())
      hashInput = Buffer.from(searchableText, 'utf8')
    }

    const contentHash = createHash('sha256').update(hashInput).digest('hex')
    const itemName = target.reportedItemName
      ? searchableText?.includes(normalizedText(target.reportedItemName)) ? target.reportedItemName : null
      : null
    const serving = target.servingDescription
      ? searchableText?.includes(normalizedText(target.servingDescription)) ? target.servingDescription : null
      : null

    return {
      ok: response.ok,
      httpStatus: response.status,
      resolvedUrl: response.url || target.sourceUrl,
      contentHash,
      reportedItemName: searchableText == null ? target.reportedItemName : itemName,
      servingDescription: searchableText == null ? target.servingDescription : serving,
    }
  } catch {
    return {
      ok: false,
      httpStatus: null,
      resolvedUrl: target.sourceUrl,
      contentHash: null,
      reportedItemName: null,
      servingDescription: null,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchTargets(): Promise<EvidenceMonitorTarget[] | null> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from('nutrition_sources')
    .select('id, menu_item_id, source_url, content_hash, upstream_source_key, reported_item_name, serving_description')
    .not('source_url', 'eq', '')
    .order('id')
  if (error) {
    if (missingSchema(error.message)) return null
    throw error
  }
  const { data: checkData, error: checkError } = await supabase
    .from('nutrition_evidence_checks')
    .select('nutrition_source_id, content_hash, checked_at')
    .not('content_hash', 'is', null)
    .order('checked_at', { ascending: false })
    .limit(5000)
  if (checkError) throw checkError
  const latestHash = new Map<string, string>()
  for (const check of checkData as EvidenceCheckRow[]) {
    if (check.content_hash && !latestHash.has(check.nutrition_source_id)) {
      latestHash.set(check.nutrition_source_id, check.content_hash)
    }
  }
  return (data as SourceRow[]).map(source => ({
    id: source.id,
    menuItemId: source.menu_item_id,
    sourceUrl: source.source_url,
    contentHash: source.content_hash ?? latestHash.get(source.id) ?? null,
    upstreamSourceKey: source.upstream_source_key,
    reportedItemName: source.reported_item_name,
    servingDescription: source.serving_description,
  }))
}

async function fetchExpiryTargets(): Promise<CertificationExpiryTarget[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from('nutrition_certifications')
    .select(`id, menu_item_id, expires_at,
      menu_item:menu_items(category,
        restaurant:restaurants(park:parks(location)),
        nutritional_data(carbs)
      )`)
    .eq('status', 'approved')
    .in('tier', ['A', 'B'])
  if (error) throw error
  return (data as unknown as CertificationRow[]).flatMap(row => {
    if (!row.expires_at) return []
    return [{
      certificationId: row.id,
      menuItemId: row.menu_item_id,
      expiresAt: row.expires_at,
      priority: dosingPriorityScore(
        row.menu_item?.category ?? null,
        row.menu_item?.restaurant?.park?.location ?? null,
        row.menu_item?.nutritional_data?.[0]?.carbs ?? null,
      ),
    }]
  })
}

async function main() {
  const applyChecks = process.argv.includes('--apply-checks')
  const limitArg = process.argv.find(argument => argument.startsWith('--limit='))
  const parsedLimit = Number(limitArg?.split('=')[1] ?? 250)
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 250
  const targets = await fetchTargets()
  const outputPath = rootPath('audit', 'evidence-monitor-results.json')

  if (targets == null) {
    const output = { generatedAt: new Date().toISOString(), schemaReady: false, checks: [], expiryQueue: [] }
    writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
    console.log('Evidence monitor: fidelity schema not deployed; no checks run.')
    return
  }

  const checks: EvidenceCheckResult[] = []
  for (let offset = 0; offset < Math.min(targets.length, limit); offset += 5) {
    const batch = targets.slice(offset, offset + 5)
    checks.push(...await Promise.all(batch.map(async target =>
      evaluateEvidenceCheck(target, await retrieve(target)))))
  }

  if (applyChecks && checks.length > 0) {
    const rows = checks.map(check => ({
      nutrition_source_id: check.sourceId,
      status: check.status,
      http_status: check.observation.httpStatus,
      resolved_url: check.observation.resolvedUrl,
      content_hash: check.observation.contentHash,
      observed_item_name: check.observation.reportedItemName,
      observed_serving_description: check.observation.servingDescription,
      reasons: check.reasons,
    }))
    const { error } = await createSupabaseClient().from('nutrition_evidence_checks').insert(rows)
    if (error) throw error
  }

  const expiryQueue = buildExpiryQueue(await fetchExpiryTargets(), new Date())
  const changedChecks = checks.filter(check => check.reviewRequired)
  const blastRadius = Object.fromEntries(changedChecks.map(check => [
    check.sourceId,
    evidenceBlastRadius(targets, check.sourceId),
  ]))
  const output = {
    generatedAt: new Date().toISOString(),
    schemaReady: true,
    mode: applyChecks ? 'apply-checks' : 'dry-run',
    checked: checks.length,
    reviewRequired: changedChecks.length,
    checks,
    blastRadius,
    expiryQueue,
  }
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')

  console.log(`Evidence checked: ${checks.length}`)
  console.log(`Review required: ${changedChecks.length}`)
  console.log(`Expiry/sample queue: ${expiryQueue.length}`)
  console.log(`Report: ${outputPath}`)
}

main().catch(error => {
  console.error('Evidence monitoring failed:', error)
  process.exit(1)
})
