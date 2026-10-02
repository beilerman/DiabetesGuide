/** Offline workflow receipts and guards. No API clients, credentials output, or DB writes. */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function requireConfig(env) {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(key => !env[key]?.trim())
  if (missing.length) throw new Error(`Missing required configuration: ${missing.join(', ')}`)
}

export function auditOutcome(outcomes) {
  const required = ['pipeline', 'external', 'quality', 'evidence']
  return required.every(name => outcomes[name] === 'success') ? 'complete' : 'failed'
}

export function validateScrapes(files, startedAt, scrapeOutcome, minItems = 100) {
  if (scrapeOutcome !== 'success') throw new Error('One or more required scrapers failed')
  if (!Number.isFinite(startedAt) || !files.length) throw new Error('No fresh scrape output')
  let itemCount = 0
  for (const { result, mtimeMs } of files) {
    const scrapedAt = Date.parse(result.scrapedAt)
    if (!Number.isFinite(scrapedAt) || scrapedAt < startedAt - 1000 || mtimeMs < startedAt - 1000)
      throw new Error('Stale or undated scrape output')
    if (!Array.isArray(result.errors) || result.errors.length || !Array.isArray(result.restaurants))
      throw new Error('Incomplete scrape output')
    for (const restaurant of result.restaurants) {
      if (!Array.isArray(restaurant.items) || !restaurant.restaurantName?.trim())
        throw new Error('Invalid restaurant output')
      for (const item of restaurant.items) {
        if (!item.itemName?.trim()) throw new Error('Invalid menu item output')
        itemCount++
      }
    }
  }
  if (itemCount < minItems) throw new Error('Insufficient fresh scrape coverage')
  return { itemCount, fileCount: files.length }
}

export function syncOutcome(outcomes, priorStatus) {
  if (outcomes.prepare !== 'success')
    return priorStatus === 'blocked_missing_config' ? 'blocked_missing_config' : 'failed'
  if (outcomes.scrape !== 'success' || outcomes.check !== 'success') return 'blocked_scrape'
  return ['merge', 'estimate', 'report', 'approve'].every(key => outcomes[key] === 'success') ? 'complete' : 'failed'
}

function saveReceipt(path, receipt) {
  mkdirSync(resolve(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify({ ...receipt, recordedAt: new Date().toISOString() }, null, 2) + '\n')
}

function main(mode) {
  const receiptPath = mode === 'audit' ? 'audit/workflow-receipt.json' : 'data/pending/workflow-receipt.json'
  let status = 'failed'
  try {
    if (mode === 'prepare') {
      status = 'blocked_missing_config'
      requireConfig(process.env)
      status = 'failed'
      const startedAt = Date.now()
      mkdirSync('data/scraped', { recursive: true })
      // CI uses a disposable checkout. Merge must see only this run's output,
      // including runs that cross UTC midnight; never validate old JSON by count.
      for (const file of readdirSync('data/scraped').filter(name => name.endsWith('.json')))
        unlinkSync(resolve('data/scraped', file))
      saveReceipt(receiptPath, { status: 'started', startedAt })
    } else if (mode === 'check') {
      status = 'blocked_scrape'
      const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
      const files = readdirSync('data/scraped').filter(name => name.endsWith('.json')).map(name => ({
        result: JSON.parse(readFileSync(resolve('data/scraped', name), 'utf8')),
        mtimeMs: statSync(resolve('data/scraped', name)).mtimeMs,
      }))
      const coverage = validateScrapes(files, receipt.startedAt, process.env.SCRAPE_OUTCOME)
      saveReceipt(receiptPath, { ...receipt, ...coverage, status: 'validated_scrape' })
    } else if (mode === 'audit' || mode === 'finish') {
      const outcomes = JSON.parse(process.env.STAGE_OUTCOMES || '{}')
      const prior = existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, 'utf8')) : {}
      status = mode === 'audit' ? auditOutcome(outcomes) : syncOutcome(outcomes, prior.status)
      saveReceipt(receiptPath, { ...prior, status, outcomes })
      if (status !== 'complete') process.exitCode = 1
    } else {
      throw new Error('Unknown workflow guard mode')
    }
  } catch {
    // Do not reflect arbitrary file/SDK errors or environment values into logs.
    if (status === 'complete') status = 'failed'
    saveReceipt(receiptPath, { status })
    console.error(`Workflow guard: ${status}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main(process.argv[2])
