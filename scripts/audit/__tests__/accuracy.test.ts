import { describe, expect, it } from 'vitest'
import { checkAccuracy } from '../accuracy.js'
import type { Item } from '../types.js'

interface MakeItemOpts {
  source?: string
  confidenceScore?: number | null
  alcoholGrams?: number | null
  name?: string
  category?: string
  calories?: number
  carbs?: number
  fat?: number
  protein?: number
}

function makeItem(opts: MakeItemOpts = {}): Item {
  const {
    source = 'api_lookup',
    confidenceScore = 40,
    alcoholGrams = null,
    name = 'Estimated Burger',
    category = 'entree',
    calories = 540,
    carbs = 40,
    fat = 20,
    protein = 20,
  } = opts
  return {
    id: 'item-1',
    name,
    category,
    is_vegetarian: false,
    is_fried: false,
    description: null,
    restaurant: { name: 'Restaurant', park: { name: 'Park' } },
    nutritional_data: [
      {
        id: 'nd-1',
        calories,
        carbs,
        fat,
        protein,
        sugar: 5,
        fiber: 3,
        sodium: 900,
        cholesterol: 50,
        alcohol_grams: alcoholGrams,
        source,
        confidence_score: confidenceScore,
      },
    ],
  }
}

describe('checkAccuracy', () => {
  it('downgrades Atwater deviations on low-confidence api_lookup nutrition to LOW when above the stricter floor', () => {
    // Need a deviation big enough to cross the api_lookup-tightened floor (35%, 100 cal abs).
    // 60% deviation, 350 cal absolute diff.
    const result = checkAccuracy([makeItem({ source: 'api_lookup', confidenceScore: 40, calories: 900, carbs: 40, fat: 20, protein: 20 })])
    const finding = result.findings.find((f) => f.checkName === 'atwater_deviation')
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('LOW')
  })

  it('flags moderate Atwater deviations on official nutrition as MEDIUM (not LOW)', () => {
    // Official-source data is the most trustworthy bucket; a medium-tier
    // deviation there is worth a real human look. Downgrading it to LOW
    // (the pre-fix behaviour) hid real anomalies in the daily report.
    const result = checkAccuracy([makeItem({ source: 'official', confidenceScore: 90 })])
    const finding = result.findings.find((f) => f.checkName === 'atwater_deviation')
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('MEDIUM')
  })

  it('keeps moderate Atwater deviations on api_lookup nutrition as LOW (not MEDIUM)', () => {
    // Atwater estimate from 20p+40c+20f = 420 cal. Stated 600 → 42.9% deviation,
    // 180 cal absDiff: above api_lookup medium floor (35%, 100 cal) but below
    // HIGH (50%, 50 cal). High confidence (70) skips the low-confidence gate.
    // Result should land in the medium branch and stay LOW for api_lookup.
    const result = checkAccuracy([
      makeItem({ source: 'api_lookup', confidenceScore: 70, calories: 600, carbs: 40, fat: 20, protein: 20 }),
    ])
    const finding = result.findings.find((f) => f.checkName === 'atwater_deviation')
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('LOW')
  })

  it('does not flag Atwater deviation on crowdsourced (AI-estimated) nutrition', () => {
    // Same data that would flag for official/api_lookup must NOT flag for crowdsourced.
    const result = checkAccuracy([makeItem({ source: 'crowdsourced', confidenceScore: 35, calories: 900, carbs: 40, fat: 20, protein: 20 })])
    const finding = result.findings.find((f) => f.checkName === 'atwater_deviation')
    expect(finding).toBeUndefined()
  })

  it('suppresses small Atwater deviations on api_lookup that previously generated noise', () => {
    // 25% deviation, 80 cal absolute diff — would flag under old thresholds (>20% & >=30 cal),
    // but should NOT under api_lookup floor (>35% & >=100 cal).
    // Macros: P*4+C*4+F*9 = 20*4+40*4+20*9 = 420 cal. calories=525 → 25% / 105 cal.
    const result = checkAccuracy([makeItem({ source: 'api_lookup', confidenceScore: 40, calories: 525, carbs: 40, fat: 20, protein: 20 })])
    const finding = result.findings.find((f) => f.checkName === 'atwater_deviation')
    // 25% < 35% threshold, so should NOT flag
    expect(finding).toBeUndefined()
  })

  // Regression fixtures for previously-fixed false positives — see CLAUDE.md
  // "Data Quality Regex Gotchas" and scripts/fix-false-positives.ts history.
  it('does not flag fat=0 zero_fat_fried on "Coffee Cake Cookie"', () => {
    const item = makeItem({
      source: 'crowdsourced',
      confidenceScore: 35,
      name: 'Coffee Cake Cookie',
      category: 'dessert',
      fat: 0,
      // High-cal dessert; just confirming the regex does not slot it into the fried bucket.
      calories: 380,
      carbs: 50,
      protein: 4,
    })
    const result = checkAccuracy([item])
    const finding = result.findings.find((f) => f.checkName === 'zero_fat_fried')
    expect(finding).toBeUndefined()
  })

  it('does not flag fat=0 zero_fat_fried on "Crispy Mac & Cheese"', () => {
    const item = makeItem({
      source: 'api_lookup',
      confidenceScore: 60,
      name: 'Crispy Mac & Cheese',
      category: 'side',
      fat: 0,
      calories: 200,
      carbs: 30,
      protein: 10,
    })
    const result = checkAccuracy([item])
    const finding = result.findings.find((f) => f.checkName === 'zero_fat_fried')
    expect(finding).toBeUndefined()
  })

  it('uses alcohol_grams * 7 in the Atwater calculation when present', () => {
    // Wine-like row: 5 carbs, 0 fat, 0 protein, 14g alcohol → estimated 5*4 + 14*7 = 118 cal.
    // Stated 120 cal → ~1.7% deviation, well within tolerance. Without alcohol included it
    // would compute to 20 cal estimate vs 120 stated = 500% deviation and HIGH-flag.
    const item = makeItem({
      source: 'official',
      confidenceScore: 90,
      name: 'House Red',
      category: 'beverage',
      calories: 120,
      carbs: 5,
      fat: 0,
      protein: 0,
      alcoholGrams: 14,
    })
    const result = checkAccuracy([item])
    const finding = result.findings.find((f) => f.checkName === 'atwater_deviation')
    expect(finding).toBeUndefined()
  })
})
