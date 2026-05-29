import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const workflowPath = resolve(__dirname, '../../.github/workflows/daily-audit.yml')

describe('daily-audit workflow', () => {
  it('lets the audit pipeline own external checks before reporting', () => {
    const workflow = readFileSync(workflowPath, 'utf8')

    expect(workflow).toContain('run: npm run audit:pipeline')
    expect(workflow).not.toContain('run: npm run audit:external')
  })
})
