import { describe, it, expect } from 'vitest'
import { buildFixBatch } from '../auto-fix.js'
import type { AutoFix } from '../types.js'

function makeFix(overrides: Partial<AutoFix> = {}): AutoFix {
  return {
    nutritionDataId: 'nd-1',
    item: 'Test Item',
    restaurant: 'Test Restaurant',
    park: 'Test Park',
    field: 'fiber',
    before: 60,
    after: 3,
    reason: 'fiber > carbs',
    ...overrides,
  }
}

describe('buildFixBatch', () => {
  it('groups multiple fixes for the same record', () => {
    const fixes: AutoFix[] = [
      makeFix({ nutritionDataId: 'nd-1', field: 'fiber', before: 60, after: 3 }),
      makeFix({ nutritionDataId: 'nd-1', field: 'sugar', before: 80, after: 50 }),
    ]

    const batch = buildFixBatch(fixes)

    expect(batch).toHaveLength(1)
    expect(batch[0].id).toBe('nd-1')
    expect(batch[0].updates).toEqual({ fiber: 3, sugar: 50 })
    expect(batch[0].fixes).toHaveLength(2)
  })

  it('separates fixes for different records', () => {
    const fixes: AutoFix[] = [
      makeFix({ nutritionDataId: 'nd-1', field: 'fiber', after: 3 }),
      makeFix({ nutritionDataId: 'nd-2', field: 'sodium', after: 4800 }),
    ]

    const batch = buildFixBatch(fixes)

    expect(batch).toHaveLength(2)
    expect(batch.find((b) => b.id === 'nd-1')).toBeDefined()
    expect(batch.find((b) => b.id === 'nd-2')).toBeDefined()
  })

  it('returns empty batch for empty fixes', () => {
    const batch = buildFixBatch([])

    expect(batch).toHaveLength(0)
  })
})
