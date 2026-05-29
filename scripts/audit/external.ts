import { writeFileSync } from 'fs'
import { pathToFileURL } from 'url'
import type { AuditFinding, AuditPassResult } from './types.js'
import { THRESHOLDS } from './thresholds.js'
import { averageIgnoringNulls, createSupabaseClient, rootPath } from './utils.js'

// ---- Scraper Health ----

interface ScraperStatus {
  name: string
  status: 'operational' | 'blocked_cloudflare' | 'degraded' | 'unknown'
  note: string
}

const KNOWN_SCRAPERS: ScraperStatus[] = [
  {
    name: 'AllEars (allears.net)',
    status: 'blocked_cloudflare',
    note: 'Blocked by Cloudflare bot detection since late 2025. DFB scraper used as fallback for photos.',
  },
  {
    name: 'Universal (universalorlando.com)',
    status: 'operational',
    note: 'Official JSON endpoints (K2 + GDS CMS). Covers USF, IOA, Volcano Bay, CityWalk, Epic Universe.',
  },
  {
    name: 'Dollywood (dollywood.com)',
    status: 'operational',
    note: 'Puppeteer scraper. 32 restaurants across 10 lands. No prices published.',
  },
  {
    name: 'Kings Island (sixflags.com/kingsisland)',
    status: 'operational',
    note: 'Algolia API interception via Next.js. KNOWN_MENUS dictionary for 38 restaurants.',
  },
]

function checkScraperHealth(): AuditFinding[] {
  const findings: AuditFinding[] = []

  for (const scraper of KNOWN_SCRAPERS) {
    if (scraper.status !== 'operational') {
      findings.push({
        item: '',
        restaurant: '',
        park: scraper.name,
        checkName: 'scraper_health',
        severity: 'LOW',
        message: `Scraper status: ${scraper.status}. ${scraper.note}`,
        currentValue: scraper.status,
        suggestedValue: 'operational',
        autoFixable: false,
      })
    }
  }

  return findings
}

// ---- Stale Data Detection ----

export interface StaleRow {
  id: string
  confidence_score: number | null
  created_at?: string | null
  updated_at?: string | null
  source_detail?: string | null
  menu_item: {
    name: string
    restaurant: {
      name: string
      park: { name: string }
    }
  }
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000))
}

function rowFreshnessDate(row: StaleRow): Date | null {
  const value = row.updated_at || row.created_at
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function buildStaleDataFindings(
  rows: StaleRow[],
  now = new Date(),
): AuditFinding[] {
  const findings: AuditFinding[] = []

  const staleByPark = new Map<string, StaleRow[]>()
  const lowConfidenceByPark = new Map<string, StaleRow[]>()

  for (const row of rows) {
    const parkName = row.menu_item?.restaurant?.park?.name ?? 'Unknown Park'
    const freshDate = rowFreshnessDate(row)
    if (freshDate && daysBetween(now, freshDate) > THRESHOLDS.STALE_DATA_DAYS) {
      if (!staleByPark.has(parkName)) staleByPark.set(parkName, [])
      staleByPark.get(parkName)!.push(row)
    } else if (
      row.confidence_score !== null &&
      row.confidence_score < THRESHOLDS.STALE_CONFIDENCE_MAX
    ) {
      if (!lowConfidenceByPark.has(parkName)) lowConfidenceByPark.set(parkName, [])
      lowConfidenceByPark.get(parkName)!.push(row)
    }
  }

  for (const [parkName, parkRows] of staleByPark) {
    const sampleItems = parkRows
      .slice(0, 3)
      .map((r) => r.menu_item?.name ?? 'Unknown')
      .join(', ')

    findings.push({
      item: '',
      restaurant: '',
      park: parkName,
      checkName: 'stale_data',
      severity: 'MEDIUM',
      message: `${parkRows.length} item(s) have source timestamps older than ${THRESHOLDS.STALE_DATA_DAYS} days. Samples: ${sampleItems}`,
      currentValue: String(parkRows.length),
      suggestedValue: `updated within ${THRESHOLDS.STALE_DATA_DAYS} days`,
      autoFixable: false,
    })
  }

  for (const [parkName, parkRows] of lowConfidenceByPark) {
    if (parkRows.length >= 10) {
      // Average across the bucket. Rows here were already filtered to non-null
      // confidence_score above, but averaging with `?? 0` would silently zero
      // any future null leak and drag the bucket average down. Skip nulls.
      const avgConfidence = averageIgnoringNulls(parkRows.map((r) => r.confidence_score))
      const avgLabel = avgConfidence == null ? 'n/a' : avgConfidence.toFixed(1)

      const sampleItems = parkRows
        .slice(0, 3)
        .map((r) => r.menu_item?.name ?? 'Unknown')
        .join(', ')

      findings.push({
        item: '',
        restaurant: '',
        park: parkName,
        checkName: 'low_confidence_source',
        severity: 'LOW',
        message: `${parkRows.length} items with confidence < ${THRESHOLDS.STALE_CONFIDENCE_MAX} (avg ${avgLabel}). Samples: ${sampleItems}`,
        currentValue: String(parkRows.length),
        suggestedValue: `< 10 low-confidence items`,
        autoFixable: false,
      })
    }
  }

  return findings
}

async function checkStaleData(): Promise<AuditFinding[]> {
  const supabase = createSupabaseClient()
  const rows = await fetchStaleRows(supabase)

  return buildStaleDataFindings(rows)
}

function isMissingFreshnessColumn(message: string): boolean {
  return /column .*nutritional_data\.(updated_at|source_detail).* does not exist/i.test(message)
}

// Shape returned by the current selection (post-migration: includes updated_at + source_detail).
interface CurrentSelectRow {
  id: string
  confidence_score: number | null
  created_at: string | null
  updated_at: string | null
  source_detail: string | null
  menu_item: {
    name: string | null
    restaurant: { name: string | null; park: { name: string | null } | null } | null
  } | null
}

// Shape returned by the legacy fallback (pre-migration: no updated_at/source_detail).
interface LegacySelectRow {
  id: string
  confidence_score: number | null
  created_at: string | null
  menu_item: {
    name: string | null
    restaurant: { name: string | null; park: { name: string | null } | null } | null
  } | null
}

async function runStaleSelect<T>(
  supabase: ReturnType<typeof createSupabaseClient>,
  selection: string,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const result = await supabase
    .from('nutritional_data')
    .select(selection)
    .limit(2000)
  return result as unknown as { data: T[] | null; error: { message: string } | null }
}

export async function fetchStaleRows(
  supabase: ReturnType<typeof createSupabaseClient>,
): Promise<StaleRow[]> {
  const currentSelection =
    'id, confidence_score, created_at, updated_at, source_detail, menu_item:menu_items(name, restaurant:restaurants(name, park:parks(name)))'
  const legacySelection =
    'id, confidence_score, created_at, menu_item:menu_items(name, restaurant:restaurants(name, park:parks(name)))'

  const currentResult = await runStaleSelect<CurrentSelectRow>(supabase, currentSelection)
  if (!currentResult.error) {
    return (currentResult.data ?? []) as unknown as StaleRow[]
  }

  if (isMissingFreshnessColumn(currentResult.error.message)) {
    const legacyResult = await runStaleSelect<LegacySelectRow>(supabase, legacySelection)
    if (!legacyResult.error) {
      return (legacyResult.data ?? []) as unknown as StaleRow[]
    }
    console.error('Stale data query error (legacy):', legacyResult.error.message)
    return []
  }

  console.error('Stale data query error:', currentResult.error.message)
  return []
}

// ---- CLI Entry Point ----

export async function runExternalChecks(): Promise<AuditPassResult> {
  console.log('Running external checks...\n')

  console.log('1. Checking scraper health...')
  const scraperFindings = checkScraperHealth()
  console.log(`   ${scraperFindings.length} finding(s)`)

  console.log('2. Checking for stale data...')
  const staleFindings = await checkStaleData()
  console.log(`   ${staleFindings.length} finding(s)`)

  return {
    pass: 'external',
    findings: [...scraperFindings, ...staleFindings],
    autoFixes: [],
    stats: {
      scraperChecks: KNOWN_SCRAPERS.length,
      scraperIssues: scraperFindings.length,
      staleParks: staleFindings.length,
    },
  }
}

async function main() {
  const result = await runExternalChecks()

  const highCount = result.findings.filter((f) => f.severity === 'HIGH').length
  const medCount = result.findings.filter((f) => f.severity === 'MEDIUM').length
  const lowCount = result.findings.filter((f) => f.severity === 'LOW').length

  console.log('\n--- External Check Results ---')
  console.log(`Scrapers checked: ${result.stats.scraperChecks}`)
  console.log(`Scraper issues:   ${result.stats.scraperIssues}`)
  console.log(`Stale parks:      ${result.stats.staleParks}`)
  console.log(
    `Findings: ${result.findings.length} (HIGH: ${highCount}, MEDIUM: ${medCount}, LOW: ${lowCount})`
  )

  const outPath = rootPath('audit', 'external-results.json')
  writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n', 'utf-8')
  console.log(`\nResults written to ${outPath}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
