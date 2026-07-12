import { describe, expect, it } from 'vitest'
import { buildBackfillPlan, classifyLegacyNutrition } from '../backfill-evidence.js'
import type { LegacyNutritionRecord } from '../backfill-evidence.js'

function record(overrides: Partial<LegacyNutritionRecord> = {}): LegacyNutritionRecord {
  return {
    menuItemId: 'item-1',
    itemName: 'Legacy Sandwich',
    source: 'official',
    sourceDetail: 'source: https://restaurant.example/nutrition',
    carbs: 42,
    confidence: 85,
    serving: { quantity: null, unit: null, description: null },
    exactItemMatch: false,
    exactServingMatch: false,
    legacySources: [],
    ...overrides,
  }
}

describe('legacy evidence backfill', () => {
  it('keeps a cited value unreviewed when its serving basis is absent', () => {
    const result = classifyLegacyNutrition(record())

    expect(result).toMatchObject({
      proposedTier: 'D',
      status: 'review_required',
      autoCertify: false,
      canonicalChange: null,
    })
    expect(result.reasons).toContain('serving basis is incomplete')
  })

  it('classifies generic API and USDA values as Tier D evidence', () => {
    const result = classifyLegacyNutrition(record({
      source: 'api_lookup',
      sourceDetail: 'USDA FoodData Central generic match',
    }))

    expect(result.proposedTier).toBe('D')
    expect(result.reasons).toContain('generic database match is not item-specific evidence')
  })

  it('keeps triangulated and recipe methods at Tier C and AI/keyword at Tier D', () => {
    expect(classifyLegacyNutrition(record({ sourceDetail: 'triangulated agreement' })).proposedTier).toBe('C')
    expect(classifyLegacyNutrition(record({ sourceDetail: 'recipe-computed estimate' })).proposedTier).toBe('C')
    expect(classifyLegacyNutrition(record({ sourceDetail: 'AI estimate' })).proposedTier).toBe('D')
    expect(classifyLegacyNutrition(record({ sourceDetail: 'keyword copy' })).proposedTier).toBe('D')
  })

  it('proposes exact official research as Tier A but never auto-certifies it', () => {
    const result = classifyLegacyNutrition(record({
      serving: { quantity: 1, unit: 'item', description: '1 sandwich as sold' },
      exactItemMatch: true,
      exactServingMatch: true,
    }))

    expect(result).toMatchObject({
      proposedTier: 'A',
      status: 'review_required',
      autoCertify: false,
      canonicalChange: null,
    })
  })

  it('quarantines malformed source citations', () => {
    const result = classifyLegacyNutrition(record({ sourceDetail: 'source: definitely-not-a-url' }))

    expect(result.status).toBe('quarantined')
    expect(result.reasons).toContain('source citation is malformed')
  })

  it('builds an idempotent plan with no canonical nutrition changes', () => {
    const first = buildBackfillPlan([record({ menuItemId: 'b' }), record({ menuItemId: 'a' })])
    const second = buildBackfillPlan([record({ menuItemId: 'a' }), record({ menuItemId: 'b' })])

    expect(first).toEqual(second)
    expect(first.canonicalChanges).toEqual([])
    expect(first.entries.map(entry => entry.menuItemId)).toEqual(['a', 'b'])
  })
})
