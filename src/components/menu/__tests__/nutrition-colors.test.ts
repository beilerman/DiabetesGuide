import { describe, it, expect } from 'vitest'
import {
  nutritionLevel,
  carbColor,
  sugarColor,
  calorieColor,
  sodiumColor,
  NUTRITION_BANDS,
} from '../nutrition-colors'

// Regression for finding 058: the badge color bands and the DotMeter bands must
// stay in lock-step. nutritionLevel() is the single source of truth both derive
// from; these tests pin the exact boundary semantics so a future threshold tweak
// can't silently disagree across the two surfaces.

describe('nutritionLevel boundaries', () => {
  it('carbs: green is inclusive at 30, amber inclusive at 60', () => {
    expect(nutritionLevel('carbs', 30)).toBe('green') // inclusive green
    expect(nutritionLevel('carbs', 31)).toBe('amber')
    expect(nutritionLevel('carbs', 60)).toBe('amber') // inclusive amber
    expect(nutritionLevel('carbs', 61)).toBe('rose')
  })

  it('sugar: green is exclusive at 10, amber inclusive at 25', () => {
    expect(nutritionLevel('sugar', 9)).toBe('green')
    expect(nutritionLevel('sugar', 10)).toBe('amber') // exclusive green → 10 is amber
    expect(nutritionLevel('sugar', 25)).toBe('amber')
    expect(nutritionLevel('sugar', 26)).toBe('rose')
  })

  it('calories: green is exclusive at 400, amber inclusive at 700', () => {
    expect(nutritionLevel('calories', 399)).toBe('green')
    expect(nutritionLevel('calories', 400)).toBe('amber')
    expect(nutritionLevel('calories', 700)).toBe('amber')
    expect(nutritionLevel('calories', 701)).toBe('rose')
  })

  it('sodium: green is exclusive at 500, amber inclusive at 1000', () => {
    expect(nutritionLevel('sodium', 499)).toBe('green')
    expect(nutritionLevel('sodium', 500)).toBe('amber')
    expect(nutritionLevel('sodium', 1000)).toBe('amber')
    expect(nutritionLevel('sodium', 1001)).toBe('rose')
  })
})

describe('color class functions agree with nutritionLevel', () => {
  const cases: Array<[(n: number) => string, Parameters<typeof nutritionLevel>[0], number[]]> = [
    [carbColor, 'carbs', [0, 30, 31, 60, 61, 200]],
    [sugarColor, 'sugar', [0, 9, 10, 25, 26, 100]],
    [calorieColor, 'calories', [0, 399, 400, 700, 701, 2000]],
    [sodiumColor, 'sodium', [0, 499, 500, 1000, 1001, 5000]],
  ]

  const levelToClass = {
    green: 'bg-green-100 text-green-800 border-green-200',
    amber: 'bg-amber-100 text-amber-800 border-amber-200',
    rose: 'bg-rose-100 text-rose-800 border-rose-200',
  } as const

  it.each(cases)('%o classes match levels', (colorFn, metric, values) => {
    for (const v of values) {
      expect(colorFn(v)).toBe(levelToClass[nutritionLevel(metric, v)])
    }
  })
})

describe('bands match the documented spec', () => {
  it('CLAUDE.md traffic-light thresholds', () => {
    expect(NUTRITION_BANDS.carbs).toMatchObject({ greenMax: 30, amberMax: 60 })
    expect(NUTRITION_BANDS.sugar).toMatchObject({ greenMax: 10, amberMax: 25 })
    expect(NUTRITION_BANDS.calories).toMatchObject({ greenMax: 400, amberMax: 700 })
    expect(NUTRITION_BANDS.sodium).toMatchObject({ greenMax: 500, amberMax: 1000 })
  })
})
