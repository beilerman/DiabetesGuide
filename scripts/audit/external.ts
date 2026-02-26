import { writeFileSync } from 'fs'
import type { AuditFinding, AuditPassResult } from './types.js'
import { THRESHOLDS } from './thresholds.js'
import { createSupabaseClient, rootPath } from './utils.js'

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

interface StaleRow {
  id: string
  confidence_score: number
  menu_item: {
    name: string
    restaurant: {
      name: string
      park: { name: string }
    }
  }
}

async function checkStaleData(): Promise<AuditFinding[]> {
  const supabase = createSupabaseClient()
  const findings: AuditFinding[] = []

  const { data, error } = await supabase
    .from('nutritional_data')
    .select(
      'id, confidence_score, menu_item:menu_items(name, restaurant:restaurants(name, park:parks(name)))'
    )
    .lt('confidence_score', THRESHOLDS.STALE_CONFIDENCE_MAX)
    .not('confidence_score', 'is', null)
    .limit(2000)

  if (error) {
    console.error('Stale data query error:', error.message)
    return findings
  }

  if (!data || data.length === 0) return findings

  const rows = data as unknown as StaleRow[]

  // Group by park
  const parkGroups = new Map<string, StaleRow[]>()
  for (const row of rows) {
    const parkName = row.menu_item?.restaurant?.park?.name ?? 'Unknown Park'
    if (!parkGroups.has(parkName)) {
      parkGroups.set(parkName, [])
    }
    parkGroups.get(parkName)!.push(row)
  }

  // Flag parks with 10+ low-confidence items
  for (const [parkName, parkRows] of parkGroups) {
    if (parkRows.length >= 10) {
      const avgConfidence =
        parkRows.reduce((sum, r) => sum + (r.confidence_score ?? 0), 0) / parkRows.length

      const sampleItems = parkRows
        .slice(0, 3)
        .map((r) => r.menu_item?.name ?? 'Unknown')
        .join(', ')

      findings.push({
        item: '',
        restaurant: '',
        park: parkName,
        checkName: 'stale_data',
        severity: 'LOW',
        message: `${parkRows.length} items with confidence < ${THRESHOLDS.STALE_CONFIDENCE_MAX} (avg ${avgConfidence.toFixed(1)}). Samples: ${sampleItems}`,
        currentValue: String(parkRows.length),
        suggestedValue: `< 10 low-confidence items`,
        autoFixable: false,
      })
    }
  }

  return findings
}

// ---- CLI Entry Point ----

async function main() {
  console.log('Running external checks...\n')

  console.log('1. Checking scraper health...')
  const scraperFindings = checkScraperHealth()
  console.log(`   ${scraperFindings.length} finding(s)`)

  console.log('2. Checking for stale data...')
  const staleFindings = await checkStaleData()
  console.log(`   ${staleFindings.length} finding(s)`)

  const result: AuditPassResult = {
    pass: 'external',
    findings: [...scraperFindings, ...staleFindings],
    autoFixes: [],
    stats: {
      scraperChecks: KNOWN_SCRAPERS.length,
      scraperIssues: scraperFindings.length,
      staleParks: staleFindings.length,
    },
  }

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

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
