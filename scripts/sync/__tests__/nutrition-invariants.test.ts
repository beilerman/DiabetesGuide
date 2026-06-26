import { describe, it, expect } from 'vitest'
import { enforceNutritionInvariants, type NutritionRowNumbers } from '../nutrition-invariants.js'

function makeRow(overrides: Partial<NutritionRowNumbers> = {}): NutritionRowNumbers {
  return {
    calories: 500,
    carbs: 50,
    fat: 20,
    protein: 25,
    sugar: 10,
    fiber: 5,
    sodium: 800,
    confidence_score: 60,
    ...overrides,
  }
}

describe('enforceNutritionInvariants', () => {
  it('lowers fiber to equal carbs when fiber > carbs', () => {
    const row = makeRow({ carbs: 30, fiber: 60 })
    const result = enforceNutritionInvariants(row)
    expect(result.fiber).toBe(30)
    expect(result.carbs).toBe(30)
  })

  it('leaves the row unchanged when fiber === carbs', () => {
    const row = makeRow({ carbs: 40, fiber: 40 })
    const result = enforceNutritionInvariants(row)
    expect(result.fiber).toBe(40)
    expect(result).toEqual(row)
  })

  it('leaves the row unchanged when fiber < carbs', () => {
    const row = makeRow({ carbs: 50, fiber: 5 })
    const result = enforceNutritionInvariants(row)
    expect(result.fiber).toBe(5)
    expect(result).toEqual(row)
  })

  it('does nothing when carbs is null', () => {
    const row = makeRow({ carbs: null, fiber: 60 })
    const result = enforceNutritionInvariants(row)
    expect(result.fiber).toBe(60)
    expect(result.carbs).toBeNull()
  })

  it('does nothing when fiber is null', () => {
    const row = makeRow({ carbs: 30, fiber: null })
    const result = enforceNutritionInvariants(row)
    expect(result.fiber).toBeNull()
    expect(result.carbs).toBe(30)
  })

  it('does NOT modify sugar when sugar > carbs', () => {
    const row = makeRow({ carbs: 20, sugar: 60, fiber: 5 })
    const result = enforceNutritionInvariants(row)
    expect(result.sugar).toBe(60)
    expect(result.carbs).toBe(20)
  })

  it('does not mutate its input', () => {
    const row = makeRow({ carbs: 30, fiber: 60 })
    const snapshot = { ...row }
    const result = enforceNutritionInvariants(row)
    expect(row).toEqual(snapshot)
    expect(result).not.toBe(row)
  })

  it('preserves extra fields on the row (generic passthrough)', () => {
    const row = { ...makeRow({ carbs: 30, fiber: 60 }), menu_item_id: 'abc', source: 'crowdsourced' }
    const result = enforceNutritionInvariants(row)
    expect(result.menu_item_id).toBe('abc')
    expect(result.source).toBe('crowdsourced')
    expect(result.fiber).toBe(30)
  })

  it('returns the same reference when no change is needed', () => {
    const row = makeRow({ carbs: 50, fiber: 5 })
    const result = enforceNutritionInvariants(row)
    expect(result).toBe(row)
  })
})
