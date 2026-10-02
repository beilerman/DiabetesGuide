import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { auditOutcome, requireConfig, syncOutcome, validateScrapes } from './workflow-guard.mjs'

const startedAt = Date.parse('2026-10-01T23:59:59Z')
const healthy = () => [{ mtimeMs: startedAt + 2000, result: {
  scrapedAt: '2026-10-02T00:00:01Z', errors: [], restaurants: [{
    restaurantName: 'Fixture Cafe', items: Array.from({ length: 100 }, (_, i) => ({ itemName: `Fixture ${i}` })),
  }],
} }]

test('missing and blank config block without reflecting credential values', () => {
  assert.throws(() => requireConfig({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: ' ' }), /SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotThrow(() => requireConfig({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' }))
})
test('healthy fresh output is valid across UTC midnight, regardless of new DB changes', () => {
  assert.deepEqual(validateScrapes(healthy(), startedAt, 'success'), { itemCount: 100, fileCount: 1 })
})
test('partial scraper failure blocks even with enough rows', () => {
  assert.throws(() => validateScrapes(healthy(), startedAt, 'failure'), /scrapers failed/)
})
test('old files cannot satisfy the fresh item minimum', () => {
  const files = healthy()
  files[0].mtimeMs = startedAt - 86400000
  assert.throws(() => validateScrapes(files, startedAt, 'success'), /Stale/)
  files[0].mtimeMs = startedAt + 2000
  files[0].result.scrapedAt = '2026-09-30T10:00:00Z'
  assert.throws(() => validateScrapes(files, startedAt, 'success'), /Stale/)
})
test('zero output and insufficient rows are blocked, not no-change success', () => {
  assert.throws(() => validateScrapes([], startedAt, 'success'), /No fresh/)
  const files = healthy()
  files[0].result.restaurants[0].items = []
  assert.throws(() => validateScrapes(files, startedAt, 'success'), /Insufficient/)
})
test('scrape errors, missing error receipts and invalid item names fail closed', () => {
  for (const change of [r => r.errors.push('HTTP 403'), r => delete r.errors,
                        r => { r.restaurants[0].items[0].itemName = '' }]) {
    const files = healthy()
    change(files[0].result)
    assert.throws(() => validateScrapes(files, startedAt, 'success'))
  }
})
test('daily audit completion requires every required stage, including rejected/skipped stages', () => {
  const statuses = { pipeline: 'success', external: 'success', quality: 'success', evidence: 'success' }
  assert.equal(auditOutcome(statuses), 'complete')
  for (const value of ['failure', 'skipped', undefined]) assert.equal(auditOutcome({ ...statuses, quality: value }), 'failed')
})
test('sync receipt distinguishes missing config, blocked scraping, later failure and completed/no-change', () => {
  const statuses = Object.fromEntries(['prepare', 'scrape', 'check', 'merge', 'estimate', 'report', 'approve'].map(s => [s, 'success']))
  assert.equal(syncOutcome(statuses), 'complete')
  assert.equal(syncOutcome({ ...statuses, prepare: 'failure' }, 'blocked_missing_config'), 'blocked_missing_config')
  assert.equal(syncOutcome({ ...statuses, prepare: 'skipped' }), 'failed')
  assert.equal(syncOutcome({ ...statuses, scrape: 'failure' }), 'blocked_scrape')
  assert.equal(syncOutcome({ ...statuses, check: 'failure' }), 'blocked_scrape')
  assert.equal(syncOutcome({ ...statuses, approve: 'failure' }), 'failed')
})

function inFixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'workflow-guard-'))
  const invoke = (mode, env = {}) => spawnSync(process.execPath,
    [fileURLToPath(new URL('./workflow-guard.mjs', import.meta.url)), mode], { cwd: root, env, encoding: 'utf8' })
  const receipt = () => JSON.parse(readFileSync(join(root, 'data/pending/workflow-receipt.json'), 'utf8'))
  try { run({ root, invoke, receipt }) } finally { rmSync(root, { recursive: true, force: true }) }
}

test('CLI missing-config receipt is blocked, nonzero, and never includes env values', () => inFixture(({ invoke, receipt }) => {
  const result = invoke('prepare', { SUPABASE_URL: 'sensitive-fixture-value' })
  assert.equal(result.status, 1)
  assert.equal(receipt().status, 'blocked_missing_config')
  assert(!JSON.stringify(receipt()).includes('sensitive-fixture-value'))
  assert(!result.stderr.includes('sensitive-fixture-value'))
}))
test('CLI prepare removes stale JSON only inside disposable fixture checkout', () => inFixture(({ root, invoke, receipt }) => {
  mkdirSync(join(root, 'data/scraped'), { recursive: true })
  writeFileSync(join(root, 'data/scraped/old.json'), '{}')
  writeFileSync(join(root, 'data/scraped/notes.txt'), 'preserve fixture notes')
  assert.equal(invoke('prepare', { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' }).status, 0)
  assert.equal(receipt().status, 'started')
  assert(!existsSync(join(root, 'data/scraped/old.json')))
  assert(existsSync(join(root, 'data/scraped/notes.txt')))
}))
test('CLI check and finish retain counts for a completed healthy/no-change run', () => inFixture(({ root, invoke, receipt }) => {
  assert.equal(invoke('prepare', { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' }).status, 0)
  const fixture = healthy()[0].result
  fixture.scrapedAt = new Date().toISOString()
  writeFileSync(join(root, 'data/scraped/fixture.json'), JSON.stringify(fixture))
  assert.equal(invoke('check', { SCRAPE_OUTCOME: 'success' }).status, 0)
  assert.equal(receipt().itemCount, 100)
  const stages = Object.fromEntries(['prepare', 'scrape', 'check', 'merge', 'estimate', 'report', 'approve'].map(s => [s, 'success']))
  assert.equal(invoke('finish', { STAGE_OUTCOMES: JSON.stringify(stages) }).status, 0)
  assert.equal(receipt().status, 'complete')
  assert.equal(receipt().itemCount, 100)
}))
test('CLI audit aggregate failure preserves a receipt and returns nonzero', () => inFixture(({ root, invoke }) => {
  const result = invoke('audit', { STAGE_OUTCOMES: JSON.stringify({ pipeline: 'failure', external: 'success', quality: 'success', evidence: 'success' }) })
  assert.equal(result.status, 1)
  const receipt = JSON.parse(readFileSync(join(root, 'audit/workflow-receipt.json'), 'utf8'))
  assert.equal(receipt.status, 'failed')
  assert.equal(receipt.outcomes.pipeline, 'failure')
}))
