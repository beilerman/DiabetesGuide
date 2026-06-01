import { writeFileSync, existsSync, readdirSync, readFileSync, statSync } from 'fs'
import type { AuditFinding, AuditPassResult } from './types.js'
import { THRESHOLDS } from './thresholds.js'
import { createSupabaseClient, rootPath } from './utils.js'

// ---- Scraper Health ----
//
// Health is DERIVED from the actual scraped output in data/scraped/, not a
// hand-edited status table. A scraper that runs clean but returns zero items
// (selector rot / expired creds) is the silent-failure mode we care about, so
// we flag a recent-but-empty file as HIGH and a missing/stale file as MEDIUM.

interface ExpectedScraper {
  name: string
  filePrefix: string
  minItems: number
}

const EXPECTED_SCRAPERS: ExpectedScraper[] = [
  { name: 'Universal (universalorlando.com)', filePrefix: 'universal', minItems: 500 },
  { name: 'Dollywood (dollywood.com)', filePrefix: 'dollywood', minItems: 100 },
  { name: 'Kings Island (sixflags.com/kingsisland)', filePrefix: 'kings-island', minItems: 50 },
]

const SCRAPE_FRESH_DAYS = 8 // weekly sync runs every 7 days

function latestScrapeFor(prefix: string): { path: string; ageDays: number } | null {
  const dir = rootPath('data', 'scraped')
  if (!existsSync(dir)) return null
  const matches = readdirSync(dir)
    .filter(f => f.startsWith(`${prefix}-`) && f.endsWith('.json'))
    .map(f => {
      const p = rootPath('data', 'scraped', f)
      return { path: p, mtime: statSync(p).mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
  if (matches.length === 0) return null
  return { path: matches[0].path, ageDays: (Date.now() - matches[0].mtime) / 86_400_000 }
}

function countItems(filePath: string): number {
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8')) as {
      restaurants?: { items?: unknown[] }[]
    }
    return (data.restaurants ?? []).reduce((sum, r) => sum + (r.items?.length ?? 0), 0)
  } catch {
    return -1
  }
}

function checkScraperHealth(): AuditFinding[] {
  const findings: AuditFinding[] = []

  for (const scraper of EXPECTED_SCRAPERS) {
    const latest = latestScrapeFor(scraper.filePrefix)

    if (!latest) {
      findings.push({
        item: '', restaurant: '', park: scraper.name,
        checkName: 'scraper_health', severity: 'MEDIUM',
        message: `No scrape output found for ${scraper.name}. Scraper may not be running.`,
        currentValue: 'missing', suggestedValue: `>= ${scraper.minItems} items`, autoFixable: false,
      })
      continue
    }

    const items = countItems(latest.path)

    if (items <= 0) {
      findings.push({
        item: '', restaurant: '', park: scraper.name,
        checkName: 'scraper_health', severity: 'HIGH',
        message: `Latest ${scraper.name} scrape produced ${items < 0 ? 'an unreadable file' : '0 items'} — likely broken (selector rot / expired credentials).`,
        currentValue: String(items), suggestedValue: `>= ${scraper.minItems} items`, autoFixable: false,
      })
    } else if (items < scraper.minItems) {
      findings.push({
        item: '', restaurant: '', park: scraper.name,
        checkName: 'scraper_health', severity: 'MEDIUM',
        message: `Latest ${scraper.name} scrape produced only ${items} items (expected >= ${scraper.minItems}) — possible partial failure.`,
        currentValue: String(items), suggestedValue: `>= ${scraper.minItems} items`, autoFixable: false,
      })
    }

    if (latest.ageDays > SCRAPE_FRESH_DAYS) {
      findings.push({
        item: '', restaurant: '', park: scraper.name,
        checkName: 'scraper_health', severity: 'MEDIUM',
        message: `Latest ${scraper.name} scrape is ${latest.ageDays.toFixed(0)} days old (> ${SCRAPE_FRESH_DAYS}). Weekly sync may be failing.`,
        currentValue: `${latest.ageDays.toFixed(0)}d`, suggestedValue: `<= ${SCRAPE_FRESH_DAYS}d`, autoFixable: false,
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
      scraperChecks: EXPECTED_SCRAPERS.length,
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
