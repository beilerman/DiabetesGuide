import { describe, it, expect } from 'vitest'
import { checkSaneNutrition, assertSaneNutrition, SANITY_LIMITS } from '../sanity.js'

describe('checkSaneNutrition', () => {
  it('accepts a normal theme-park meal', () => {
    expect(
      checkSaneNutrition({ calories: 750, carbs: 60, fat: 30, protein: 35, sugar: 10, fiber: 4, sodium: 1500 }),
    ).toEqual([])
  })

  it('catches a 100x sodium decimal-place error', () => {
    const violations = checkSaneNutrition({ calories: 600, sodium: 44000 })
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.find((v) => v.field === 'sodium')).toBeDefined()
  })

  it('catches a 1000x mg/kg confusion in sodium', () => {
    const violations = checkSaneNutrition({ calories: 800, sodium: 440000 })
    expect(violations.find((v) => v.field === 'sodium')?.message).toMatch(/mg\/kg/)
  })

  it('rejects sugar > carbs (impossible)', () => {
    const violations = checkSaneNutrition({ carbs: 20, sugar: 35 })
    expect(violations.find((v) => v.field === 'sugar')).toBeDefined()
  })

  it('rejects fiber > carbs (impossible)', () => {
    const violations = checkSaneNutrition({ carbs: 20, fiber: 25 })
    expect(violations.find((v) => v.field === 'fiber')).toBeDefined()
  })

  it('rejects negative macros', () => {
    const violations = checkSaneNutrition({ protein: -3 })
    expect(violations.find((v) => v.field === 'protein')).toBeDefined()
  })

  it('allows the Disney published turkey leg (5375 mg sodium)', () => {
    // Real datapoint from the data pipeline — must be under the 6000mg ceiling.
    expect(checkSaneNutrition({ calories: 1093, sodium: 5375, protein: 142 })).toEqual([])
  })

  it('rejects calories beyond 5000', () => {
    const violations = checkSaneNutrition({ calories: SANITY_LIMITS.MAX_CALORIES + 1 })
    expect(violations.find((v) => v.field === 'calories')).toBeDefined()
  })

  it('ignores null fields gracefully', () => {
    expect(checkSaneNutrition({ calories: null, sodium: null, sugar: null })).toEqual([])
  })
})

describe('assertSaneNutrition', () => {
  it('returns silently when the row is sane', () => {
    expect(() => assertSaneNutrition({ calories: 500, sodium: 800 })).not.toThrow()
  })

  it('throws with a label and the violation message', () => {
    expect(() => assertSaneNutrition({ sodium: 99999 }, 'Cheeseburger')).toThrowError(/Cheeseburger.*sodium/)
  })

  it('collects multiple violations into one error message', () => {
    try {
      assertSaneNutrition({ sodium: 99999, sugar: 100, carbs: 20 }, 'Bad Row')
      throw new Error('should have thrown')
    } catch (e) {
      const msg = (e as Error).message
      expect(msg).toMatch(/sodium/)
      expect(msg).toMatch(/sugar/)
    }
  })
})
