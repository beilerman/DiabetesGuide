import { describe, it, expect } from 'vitest'
import { computeGrade, computeScore } from '../grade'

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
