/**
 * scrape-all.ts — Run all working scrapers, clean old data, report results.
 *
 * Runs Universal, Dollywood, Kings Island, and (optionally) DFB sequentially,
 * each as its own tsx subprocess with a 5-minute timeout.
 * AllEars is skipped (blocked by Cloudflare).
 *
 * Usage:
 *   npx tsx scripts/scrape-all.ts [--skip-dfb] [--clean-days=30]
 */

import { execFileSync } from 'child_process'
import { readdirSync, unlinkSync, existsSync, mkdirSync, statSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCRAPED_DIR = resolve(__dirname, '../data/scraped')

const args = process.argv.slice(2)
const skipDfb = args.includes('--skip-dfb')
const cleanDaysArg = args.find(a => a.startsWith('--clean-days='))
const cleanDays = cleanDaysArg ? parseInt(cleanDaysArg.split('=')[1]) : 30

// npx resolves to npx.cmd on Windows; execFileSync runs without a shell so we
// must name the platform-specific binary explicitly (and avoid shell injection).
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx'

interface ScrapeRun {
  name: string
  script: string
  success: boolean
  durationMs: number
  error?: string
}

function cleanOldScrapedFiles(days: number): number {
  if (!existsSync(SCRAPED_DIR)) return 0

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  let removed = 0

  for (const file of readdirSync(SCRAPED_DIR)) {
    const filePath = resolve(SCRAPED_DIR, file)
    const stat = statSync(filePath)
    if (stat.mtimeMs < cutoff) {
      unlinkSync(filePath)
      removed++
    }
  }

  return removed
}

function runScraper(name: string, script: string): ScrapeRun {
  const t0 = Date.now()
  try {
    // Array args, no shell — scraper paths can never be interpreted by a shell.
    execFileSync(NPX, ['tsx', script], { stdio: 'inherit', cwd: resolve(__dirname, '..'), timeout: 300_000 })
    return { name, script, success: true, durationMs: Date.now() - t0 }
  } catch (err) {
    return {
      name,
      script,
      success: false,
      durationMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function main() {
  console.log('=== DiabetesGuide Scrape All ===\n')

  // Ensure output dir exists
  if (!existsSync(SCRAPED_DIR)) {
    mkdirSync(SCRAPED_DIR, { recursive: true })
  }

  // Clean old files
  const removed = cleanOldScrapedFiles(cleanDays)
  if (removed > 0) {
    console.log(`Cleaned ${removed} scraped files older than ${cleanDays} days\n`)
  }

  // Define scrapers in order of reliability
  const scrapers: { name: string; script: string; skip?: boolean }[] = [
    { name: 'Universal Orlando', script: 'scripts/scrapers/universal.ts' },
    { name: 'Dollywood', script: 'scripts/scrapers/dollywood.ts' },
    { name: 'Kings Island', script: 'scripts/scrapers/kings-island.ts' },
    { name: 'Disney Food Blog', script: 'scripts/scrapers/dfb-puppeteer.ts', skip: skipDfb },
    // AllEars: blocked by Cloudflare — skipped
  ]

  const results: ScrapeRun[] = []

  for (const scraper of scrapers) {
    if (scraper.skip) {
      console.log(`[SKIP] ${scraper.name}\n`)
      continue
    }

    console.log(`[RUN] ${scraper.name}...`)
    const result = runScraper(scraper.name, scraper.script)
    results.push(result)

    if (result.success) {
      console.log(`[OK]  ${scraper.name} (${(result.durationMs / 1000).toFixed(1)}s)\n`)
    } else {
      console.error(`[FAIL] ${scraper.name} (${(result.durationMs / 1000).toFixed(1)}s)`)
      console.error(`       ${result.error}\n`)
    }
  }

  // Summary
  const succeeded = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length

  console.log('=== Scrape Summary ===')
  console.log(`Succeeded: ${succeeded}`)
  console.log(`Failed: ${failed}`)

  if (succeeded === 0) {
    console.error('\nAll scrapers failed — aborting sync pipeline')
    process.exit(1)
  }

  if (failed > 0) {
    console.warn(`\n${failed} scraper(s) failed:`)
    for (const r of results.filter(r => !r.success)) {
      console.warn(`  - ${r.name}: ${r.error}`)
    }
  }

  // Count scraped files for today
  const today = new Date().toISOString().slice(0, 10)
  const todayFiles = readdirSync(SCRAPED_DIR).filter(f => f.includes(today))
  console.log(`\nScraped files for ${today}: ${todayFiles.length}`)
}

main().catch(err => {
  console.error('scrape-all failed:', err)
  process.exit(1)
})
