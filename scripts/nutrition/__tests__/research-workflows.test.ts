import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const prPath = '.github/workflows/nutrition-research-pr.yml'
const applyPath = '.github/workflows/nutrition-research-apply.yml'
const integrationPath = '.github/workflows/nutrition-research-integration.yml'

function workflow(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('nutrition research pull-request workflow', () => {
  it('uses pull_request with read-only permissions and never pull_request_target', () => {
    const source = workflow(prPath)
    expect(source).toMatch(/pull_request:/)
    expect(source).not.toMatch(/pull_request_target:/)
    expect(source).toMatch(/permissions:\s*\n\s*contents: read/)
    expect(source).not.toMatch(/contents: write|pull-requests: write/)
  })

  it('runs static validation without secrets for every research batch PR', () => {
    const source = workflow(prPath)
    expect(source).toContain('static-contract:')
    expect(source).toContain('nutrition:research-validate -- --static')
    const staticJob = source.slice(source.indexOf('static-contract:'), source.indexOf('live-drift:'))
    expect(staticJob).not.toContain('secrets.')
    expect(staticJob).toContain('npm ci')
  })

  it('runs live validation only for same-repository branches with a read-only key', () => {
    const source = workflow(prPath)
    const liveJob = source.slice(source.indexOf('live-drift:'), source.indexOf('auto-merge-gate:'))
    expect(liveJob).toContain('github.event.pull_request.head.repo.full_name == github.repository')
    expect(liveJob).toContain('nutrition:research-validate -- --live')
    expect(liveJob).toContain('SUPABASE_ANON_KEY')
    expect(liveJob).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('fails the auto-merge gate for invalid or review-blocked artifacts', () => {
    const source = workflow(prPath)
    const gate = source.slice(source.indexOf('auto-merge-gate:'))
    expect(gate).toContain('blocks_auto_merge')
    expect(gate).toContain('exit 1')
    expect(gate).not.toContain('gh pr merge')
  })
})

describe('nutrition research protected apply workflow', () => {
  it('runs only for research batch JSON pushed to main', () => {
    const source = workflow(applyPath)
    expect(source).toMatch(/push:/)
    expect(source).toMatch(/branches:\s*\[main\]/)
    expect(source).toContain("'audit/nutrition-research/batches/*.json'")
    expect(source).not.toMatch(/pull_request(?:_target)?:/)
  })

  it('serializes production apply and uses a protected environment', () => {
    const source = workflow(applyPath)
    expect(source).toContain('group: nutrition-research-apply-production')
    expect(source).toContain('cancel-in-progress: false')
    expect(source).toContain('environment: production-nutrition-evidence')
  })

  it('is the only workflow that receives the service role', () => {
    const apply = workflow(applyPath)
    const pr = workflow(prPath)
    expect(apply).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(pr).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('checks out merged main, discovers changed JSON, validates, and applies once', () => {
    const source = workflow(applyPath)
    expect(source).toContain('ref: ${{ github.sha }}')
    expect(source).toContain('github.event.before')
    expect(source).toContain('github.sha')
    expect(source).toContain('nutrition:research-validate -- --static')
    expect(source).toContain('nutrition:research-apply -- --batch=')
    expect(source).not.toMatch(/retry|max-attempts|nick-fields\/retry/i)
  })

  it('uploads an apply report even when application fails', () => {
    const source = workflow(applyPath)
    expect(source).toContain('actions/upload-artifact@v4')
    expect(source).toContain('if: always()')
  })
})

describe('nutrition research disposable integration workflow', () => {
  it('is manual, main-only, and isolated from pull-request execution', () => {
    const source = workflow(integrationPath)
    expect(source).toContain('workflow_dispatch:')
    expect(source).toContain('environment: nutrition-research-integration')
    expect(source).toContain("ref: 'main'")
    expect(source).not.toMatch(/pull_request(?:_target)?:/)
    expect(source).toContain('TEST_SUPABASE_SERVICE_ROLE_KEY')
  })
})
