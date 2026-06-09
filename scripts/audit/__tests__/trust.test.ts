import { describe, expect, it } from 'vitest'
import { isDosingGrade, isSourced, isPrioritySliceItem, dosingPriorityScore, TRUSTED_CONFIDENCE } from '../trust'

describe('isDosingGrade (v2 trust: confidence >= 70, matches app UI)', () => {
  it('trusts high-confidence carbs regardless of source', () => {
    expect(isDosingGrade(45, 70)).toBe(true)
    expect(isDosingGrade(45, 85)).toBe(true)
    expect(isDosingGrade(0, 90)).toBe(true) // zero carbs is a value, not absence
  })

  it('does NOT trust api_lookup-style confidence below 70 (the v1 loophole)', () => {
    // USDA matches land at 50-60 — the app tells users not to dose from these,
    // so the metric must not count them either.
    expect(isDosingGrade(45, 55)).toBe(false)
    expect(isDosingGrade(45, 69)).toBe(false)
  })

  it('never trusts missing carbs or missing confidence', () => {
    expect(isDosingGrade(null, 95)).toBe(false)
    expect(isDosingGrade(45, null)).toBe(false)
  })

  it('threshold matches the app UI cutoff', () => {
    // src/lib/nutrition-trust.ts flips from "low" to verified/estimated at 70.
    expect(TRUSTED_CONFIDENCE).toBe(70)
  })
})

describe('isSourced (legacy v1 continuity series)', () => {
  it('counts authoritative sources at any confidence', () => {
    expect(isSourced(45, 'official', 70)).toBe(true)
    expect(isSourced(45, 'api_lookup', 55)).toBe(true)
  })

  it('counts crowdsourced only at high confidence', () => {
    expect(isSourced(45, 'crowdsourced', 75)).toBe(true)
    expect(isSourced(45, 'crowdsourced', 35)).toBe(false)
  })

  it('never counts missing carbs', () => {
    expect(isSourced(null, 'official', 90)).toBe(false)
  })
})

describe('isPrioritySliceItem (entrees+desserts at top destinations)', () => {
  it('includes entrees and desserts at the top three destinations', () => {
    expect(isPrioritySliceItem('entree', 'Walt Disney World')).toBe(true)
    expect(isPrioritySliceItem('dessert', 'Universal Orlando Resort')).toBe(true)
    expect(isPrioritySliceItem('entree', 'Disneyland Resort')).toBe(true)
  })

  it('excludes other categories at top destinations', () => {
    expect(isPrioritySliceItem('beverage', 'Walt Disney World')).toBe(false)
    expect(isPrioritySliceItem('snack', 'Walt Disney World')).toBe(false)
    expect(isPrioritySliceItem('side', 'Disneyland Resort')).toBe(false)
  })

  it('excludes priority categories at other destinations', () => {
    expect(isPrioritySliceItem('entree', 'Dollywood')).toBe(false)
    expect(isPrioritySliceItem('dessert', 'Kings Island')).toBe(false)
    expect(isPrioritySliceItem('entree', 'SeaWorld Parks')).toBe(false)
    expect(isPrioritySliceItem('dessert', 'Disney Cruise Line')).toBe(false)
  })

  it('handles missing category or location', () => {
    expect(isPrioritySliceItem(null, 'Walt Disney World')).toBe(false)
    expect(isPrioritySliceItem('entree', null)).toBe(false)
  })
})

describe('dosingPriorityScore (verification queue ordering)', () => {
  it('ranks a high-carb WDW entree above a Dollywood beverage', () => {
    const wdwEntree = dosingPriorityScore('entree', 'Walt Disney World', 90)
    const dollyBeverage = dosingPriorityScore('beverage', 'Dollywood', 90)
    expect(wdwEntree).toBeGreaterThan(dollyBeverage)
  })

  it('ranks top destinations above other parks for the same item', () => {
    expect(dosingPriorityScore('entree', 'Universal Orlando Resort', 60))
      .toBeGreaterThan(dosingPriorityScore('entree', 'Kings Island', 60))
  })

  it('ranks entrees/desserts above snacks above beverages at the same park', () => {
    const at = (cat: string) => dosingPriorityScore(cat, 'Walt Disney World', 50)
    expect(at('entree')).toEqual(at('dessert'))
    expect(at('entree')).toBeGreaterThan(at('snack'))
    expect(at('snack')).toBeGreaterThan(at('side'))
    expect(at('side')).toBeGreaterThan(at('beverage'))
  })

  it('ranks higher-carb items first within the same category and park', () => {
    expect(dosingPriorityScore('dessert', 'Disneyland Resort', 120))
      .toBeGreaterThan(dosingPriorityScore('dessert', 'Disneyland Resort', 20))
  })

  it('tolerates missing carbs and unknown categories', () => {
    expect(dosingPriorityScore('entree', 'Walt Disney World', null)).toBeGreaterThan(0)
    expect(dosingPriorityScore(null, null, null)).toBeGreaterThan(0)
  })
})
