import { describe, it, expect } from 'vitest'
import { getDiabetesAnnotations } from '../annotations'

describe('getDiabetesAnnotations', () => {
  it('flags high simple sugar', () => {
    const annotations = getDiabetesAnnotations({ calories: 400, carbs: 50, sugar: 35, fat: 10, protein: 5, fiber: 1, sodium: 200, alcoholGrams: 0, category: 'dessert', isFried: false })
    expect(annotations[0].text).toContain('rapid glucose spike')
    expect(annotations[0].severity).toBe('red')
  })

  it('praises high protein ratio', () => {
    const annotations = getDiabetesAnnotations({ calories: 350, carbs: 15, sugar: 2, fat: 18, protein: 30, fiber: 2, sodium: 600, alcoholGrams: 0, category: 'entree', isFried: false })
    expect(annotations.some(a => a.text.includes('protein'))).toBe(true)
  })

  it('warns about alcohol', () => {
    const annotations = getDiabetesAnnotations({ calories: 200, carbs: 20, sugar: 18, fat: 0, protein: 0, fiber: 0, sodium: 10, alcoholGrams: 14, category: 'beverage', isFried: false })
    expect(annotations.some(a => a.text.includes('alcohol'))).toBe(true)
    expect(annotations.some(a => a.severity === 'red')).toBe(true)
  })

  it('flags liquid sugar in beverages', () => {
    const annotations = getDiabetesAnnotations({ calories: 300, carbs: 72, sugar: 68, fat: 0, protein: 0, fiber: 0, sodium: 20, alcoholGrams: 0, category: 'beverage', isFried: false })
    expect(annotations[0].text).toContain('Liquid sugar')
  })

  it('notes minimal glucose impact for low carb items', () => {
    const annotations = getDiabetesAnnotations({ calories: 120, carbs: 8, sugar: 2, fat: 6, protein: 10, fiber: 1, sodium: 300, alcoholGrams: 0, category: 'snack', isFried: false })
    expect(annotations.some(a => a.text.includes('Minimal glucose impact'))).toBe(true)
  })

  it('returns empty for null nutrition', () => {
    const annotations = getDiabetesAnnotations({ calories: null, carbs: null, sugar: null, fat: null, protein: null, fiber: null, sodium: null, alcoholGrams: null, category: 'entree', isFried: false })
    expect(annotations).toEqual([])
  })
})
