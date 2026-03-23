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

  it('grants contents write permission so generated updates can be pushed', () => {
    const workflow = readWorkflow()

    expect(workflow).toMatch(/permissions:\s*\r?\n\s*contents:\s*write/)
  })
})
