import { describe, expect, it } from 'vitest'
import { buildStaleDataFindings, fetchStaleRows } from '../external.js'

describe('buildStaleDataFindings', () => {
  it('uses source freshness timestamps before confidence fallback', () => {
    const now = new Date('2026-05-02T12:00:00Z')
    const old = new Date('2026-01-01T12:00:00Z').toISOString()

    const findings = buildStaleDataFindings(
      [
        {
          id: 'nd-1',
          confidence_score: 90,
          updated_at: old,
          created_at: old,
          source_detail: 'official scrape',
          menu_item: {
            name: 'Old Official Item',
            restaurant: { name: 'Restaurant', park: { name: 'Park A' } },
          },
        },
      ],
      now,
    )

    expect(findings).toHaveLength(1)
    expect(findings[0].checkName).toBe('stale_data')
    expect(findings[0].severity).toBe('MEDIUM')
    expect(findings[0].message).toContain('older than')
  })

  it('falls back to the legacy select when freshness columns are not migrated yet', async () => {
    const selections: string[] = []
    const supabase = {
      from() {
        return {
          select(selection: string) {
            selections.push(selection)
            return {
              async limit() {
                if (selections.length === 1) {
                  return {
                    data: null,
                    error: { message: 'column nutritional_data.updated_at does not exist' },
                  }
                }

                return {
                  data: [
                    {
                      id: 'nd-1',
                      confidence_score: 20,
                      created_at: '2026-05-01T00:00:00Z',
                      menu_item: {
                        name: 'Item',
                        restaurant: { name: 'Restaurant', park: { name: 'Park' } },
                      },
                    },
                  ],
                  error: null,
                }
              },
            }
          },
        }
      },
    }

    const rows = await fetchStaleRows(supabase as unknown as Parameters<typeof fetchStaleRows>[0])

    expect(selections).toHaveLength(2)
    expect(selections[1]).not.toContain('updated_at')
    expect(rows).toHaveLength(1)
  })
})
