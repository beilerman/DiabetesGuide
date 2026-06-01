import { describe, it, expect } from 'vitest'
import { computeGrade, computeScore, gradeForNutrition, isCalorieCapped } from '../grade'

describe('computeScore', () => {
  it('scores a low-carb high-protein item as A', () => {
    const score = computeScore({ calories: 250, carbs: 12, fat: 14, protein: 28, sugar: 2, fiber: 3, sodium: 400 })
    expect(score).toBeGreaterThanOrEqual(85)
  })

  it('scores a high-sugar dessert as D or F', () => {
    const score = computeScore({ calories: 800, carbs: 95, fat: 38, protein: 6, sugar: 72, fiber: 1, sodium: 300 })
    expect(score).toBeLessThan(55)
  })

  it('scores a moderate item as C', () => {
    const score = computeScore({ calories: 550, carbs: 48, fat: 22, protein: 24, sugar: 12, fiber: 4, sodium: 800 })
    expect(score).toBeGreaterThanOrEqual(55)
    expect(score).toBeLessThan(70)
  })

  it('handles zero carbs gracefully', () => {
    const score = computeScore({ calories: 200, carbs: 0, fat: 14, protein: 22, sugar: 0, fiber: 0, sodium: 400 })
    expect(score).toBeGreaterThanOrEqual(85)
  })

  it('handles null/missing nutrition by returning null', () => {
    const score = computeScore({ calories: null, carbs: null, fat: null, protein: null, sugar: null, fiber: null, sodium: null })
    expect(score).toBeNull()
  })
})

describe('computeGrade', () => {
  it('maps scores to correct letter grades', () => {
    expect(computeGrade(92)).toBe('A')
    expect(computeGrade(75)).toBe('B')
    expect(computeGrade(60)).toBe('C')
    expect(computeGrade(45)).toBe('D')
    expect(computeGrade(30)).toBe('F')
  })

  it('returns null for null score', () => {
    expect(computeGrade(null)).toBeNull()
  })
})

describe('gradeForNutrition calorie cap', () => {
  // A low-net-carb but high-calorie item (the "Bronte" case): strong raw score,
  // but must not grade better than C for a diabetes audience.
  const bronteLike = { calories: 800, carbs: 10, fat: 55, protein: 12, sugar: 1, fiber: 9, sodium: 50 }

  it('caps a high-calorie item at no better than C even when the raw grade is A', () => {
    expect(computeGrade(computeScore(bronteLike))).toBe('A') // raw grade is A
    expect(gradeForNutrition(bronteLike)).toBe('C')          // capped
    expect(isCalorieCapped(bronteLike)).toBe(true)
  })

  it('does not change grades for items below the calorie threshold', () => {
    const light = { calories: 250, carbs: 10, fat: 5, protein: 8, sugar: 4, fiber: 3, sodium: 60 }
    expect(gradeForNutrition(light)).toBe(computeGrade(computeScore(light)))
    expect(isCalorieCapped(light)).toBe(false)
  })

  it('never raises a grade — a high-calorie F stays F', () => {
    const heavyBad = { calories: 900, carbs: 120, fat: 40, protein: 5, sugar: 90, fiber: 0, sodium: 800 }
    expect(gradeForNutrition(heavyBad)).toBe('F')
    expect(isCalorieCapped(heavyBad)).toBe(false)
  })

  it('returns null when nutrition is insufficient to grade', () => {
    expect(gradeForNutrition({ calories: null, carbs: null, fat: null, protein: null, sugar: null, fiber: null, sodium: null })).toBeNull()
  })

  it('applies alcohol penalty', () => {
    const withoutAlcohol = computeScore({ calories: 200, carbs: 20, fat: 0, protein: 0, sugar: 18, fiber: 0, sodium: 10 })
    const withAlcohol = computeScore({ calories: 200, carbs: 20, fat: 0, protein: 0, sugar: 18, fiber: 0, sodium: 10, alcoholGrams: 14 })
    expect(withAlcohol!).toBeLessThan(withoutAlcohol!)
  })

  it('gives zero-calorie items automatic A', () => {
    const score = computeScore({ calories: 0, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0 })
    expect(score).toBe(100)
  })
})
