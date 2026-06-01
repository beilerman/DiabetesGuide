import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const workflowPath = resolve(__dirname, '../../.github/workflows/weekly-menu-sync.yml')

function readWorkflow() {
  return readFileSync(workflowPath, 'utf8')
}

describe('weekly-menu-sync workflow', () => {
  it('uses a Puppeteer browser install command supported by the pinned package version', () => {
    const workflow = readWorkflow()

    expect(workflow).toContain('npx puppeteer browsers install')
    expect(workflow).not.toContain('npx puppeteer browsers install chromium')
  })

  it('gates DB sync on a real scraped item count, not merely a file existing', () => {
    const workflow = readWorkflow()

    // Empty scrapes still write a file, so the gate must check item count.
    expect(workflow).toContain('item_count')
    expect(workflow).toMatch(/fromJSON\(steps\.check_scraped\.outputs\.item_count\)\s*>=\s*100/)
    expect(workflow).not.toContain("outputs.file_count != '0'")
  })

  it('does not force-commit unvalidated scraped data (no git add -f)', () => {
    const workflow = readWorkflow()

    // Raw scraped/approved data is gitignored on purpose; committing it required
    // an unsafe `git add -f` that also defeated the secret-leak backstop.
    expect(workflow).not.toContain('git add -f')
    expect(workflow).not.toContain('data/scraped/ data/approved/')
  })

  it('surfaces import failures instead of swallowing them with continue-on-error', () => {
    const workflow = readWorkflow()

    // The auto-approve step must not be wrapped in continue-on-error.
    const approveIdx = workflow.indexOf('npm run sync:approve')
    expect(approveIdx).toBeGreaterThan(-1)
    const window = workflow.slice(Math.max(0, approveIdx - 400), approveIdx)
    expect(window).not.toContain('continue-on-error: true')
  })
})
