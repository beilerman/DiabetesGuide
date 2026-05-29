import { describe, expect, it } from 'vitest'
import { buildMarkdownReport } from '../report.js'

describe('buildMarkdownReport', () => {
  it('includes external audit findings in status and review sections', () => {
    const data: Parameters<typeof buildMarkdownReport>[0] = {
      accuracy: { pass: 'accuracy', findings: [], autoFixes: [], stats: {} },
      completeness: { pass: 'completeness', findings: [], autoFixes: [], stats: {} },
      external: {
        pass: 'external',
        findings: [
          {
            item: '',
            restaurant: '',
            park: 'Universal',
            checkName: 'stale_data',
            severity: 'MEDIUM',
            message: 'Scraped data is older than freshness target',
            autoFixable: false,
          },
        ],
        autoFixes: [],
        stats: {},
      },
      autofix: { applied: 0, failed: 0, fixes: [] },
      graduation: null,
    }
    const markdown = buildMarkdownReport(data)

    expect(markdown).toContain('| MEDIUM | 1 |')
    expect(markdown).toContain('Scraped data is older than freshness target')
  })
})
