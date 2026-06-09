import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readCiWorkflow() {
  return readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8')
}

describe('ci workflow', () => {
  it('runs the documented quality gates on pull requests', () => {
    const workflow = readCiWorkflow()

    expect(workflow).toContain('pull_request:')
    expect(workflow).toContain('npm run lint')
    expect(workflow).toContain('npm test')
    expect(workflow).toContain('npm run build')
    expect(workflow).toContain('npm run test:e2e')
    expect(workflow).toContain('npx playwright install --with-deps chromium')
  })
})
