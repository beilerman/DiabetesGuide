import { describe, it, expect } from 'vitest'
import { checkAccuracy } from '../accuracy.js'
import type { Item, NutData } from '../types.js'

function makeItem(overrides: Partial<Item> & { nd?: Partial<NutData> }): Item {
  const { nd: ndOverrides, ...itemOverrides } = overrides
  return {
    id: 'test-id',
    name: 'Test Item',
    category: 'entree',
    is_vegetarian: false,
    is_fried: false,
    description: null,
    restaurant: { name: 'Test Restaurant', park: { name: 'Test Park' } },
    nutritional_data: [
      {
        id: 'nd-id',
        calories: 500,
        carbs: 50,
        fat: 20,
        protein: 25,
        sugar: 10,
        fiber: 5,
        sodium: 800,
        cholesterol: 50,
        alcohol_grams: null,
        source: 'api_lookup',
        confidence_score: 60,
        ...ndOverrides,
      },
    ],
    ...itemOverrides,
  }
}

describe('checkAccuracy', () => {
  it('flags fiber > carbs as HIGH auto-fixable', () => {
    const item = makeItem({ nd: { fiber: 60, carbs: 30 } })
    const result = checkAccuracy([item])

    const finding = result.findings.find((f) => f.checkName === 'fiber_gt_carbs')
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('HIGH')
    expect(finding!.autoFixable).toBe(true)

    const fix = result.autoFixes.find((f) => f.field === 'fiber')
    expect(fix).toBeDefined()
    expect(fix!.after).toBe(Math.round(30 * 0.1)) // 3
  })

  it('flags sugar > carbs as HIGH but does NOT auto-fix (carbs may be undercounted)', () => {
    const item = makeItem({ nd: { sugar: 80, carbs: 50 } })
    const result = checkAccuracy([item])

    const finding = result.findings.find((f) => f.checkName === 'sugar_gt_carbs')
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('HIGH')
    // Capping sugar would hide the signal that the dosing-critical carb value
    // is probably too low — this must go to human review, not auto-repair.
    expect(finding!.autoFixable).toBe(false)
    expect(result.autoFixes.find((f) => f.field === 'sugar')).toBeUndefined()
  })

  it('flags sodium > 10000 as HIGH auto-fixable', () => {
    const item = makeItem({ nd: { sodium: 48000 } })
    const result = checkAccuracy([item])

    const finding = result.findings.find((f) => f.checkName === 'sodium_extreme')
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('HIGH')
    expect(finding!.autoFixable).toBe(true)

    const fix = result.autoFixes.find((f) => f.field === 'sodium')
    expect(fix).toBeDefined()
    expect(fix!.after).toBe(4800) // 48000 / 10
  })

  it('flags Atwater deviation > 50% as HIGH non-fixable', () => {
    // Atwater estimate = 25*4 + 50*4 + 20*9 = 100+200+180 = 480
    // calories = 900, deviation = |900-480|/480 * 100 = 87.5%
    const item = makeItem({ nd: { calories: 900, carbs: 50, fat: 20, protein: 25 } })
    const result = checkAccuracy([item])

    const finding = result.findings.find((f) => f.checkName === 'atwater_deviation')
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('HIGH')
    expect(finding!.autoFixable).toBe(false)
  })

  it('skips Atwater check for alcoholic beverages', () => {
    // Frozen Margarita: Atwater = 0*4 + 30*4 + 0*9 = 120
    // calories = 400, deviation = |400-120|/120 * 100 = 233%
    // But it's alcoholic, so Atwater check should be skipped
    const item = makeItem({
      name: 'Frozen Margarita',
      category: 'beverage',
      nd: { calories: 400, carbs: 30, fat: 0, protein: 0 },
    })
    const result = checkAccuracy([item])

    const atwaterFinding = result.findings.find((f) => f.checkName === 'atwater_deviation')
    expect(atwaterFinding).toBeUndefined()
  })

  it('flags negative calories as HIGH', () => {
    const item = makeItem({ nd: { calories: -50 } })
    const result = checkAccuracy([item])

    const finding = result.findings.find((f) => f.checkName === 'negative_value')
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('HIGH')
    expect(finding!.autoFixable).toBe(true)

    const fix = result.autoFixes.find((f) => f.field === 'calories')
    expect(fix).toBeDefined()
    expect(fix!.after).toBe(0)
  })

  it('uses relaxed 30% threshold for beverages (not flagged at 25%)', () => {
    // Latte: Atwater = 10*4 + 30*4 + 5*9 = 40+120+45 = 205
    // calories = 260, deviation = |260-205|/205 * 100 = 26.8%
    // 26.8% > 20% (food threshold) but < 30% (beverage threshold)
    // Should NOT be flagged as MEDIUM because it's a beverage
    const item = makeItem({
      name: 'Vanilla Latte',
      category: 'beverage',
      nd: { calories: 260, carbs: 30, fat: 5, protein: 10 },
    })
    const result = checkAccuracy([item])

    const atwaterFinding = result.findings.find((f) => f.checkName === 'atwater_deviation')
    expect(atwaterFinding).toBeUndefined()
  })

  it('uses strict 20% threshold for food items (flagged at 25%)', () => {
    // Burger: Atwater = 25*4 + 40*4 + 20*9 = 100+160+180 = 440
    // calories = 560, deviation = |560-440|/440 * 100 = 27.3%
    // 27.3% > 20% AND absDiff = 120 >= 30 → MEDIUM for food
    const item = makeItem({
      name: 'Cheeseburger',
      category: 'entree',
      nd: { calories: 560, carbs: 40, fat: 20, protein: 25 },
    })
    const result = checkAccuracy([item])

    const finding = result.findings.find((f) => f.checkName === 'atwater_deviation')
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('MEDIUM')
  })

  it('detects beverages by name pattern even without beverage category', () => {
    // Cold Brew Coffee categorized as "snack" but name pattern matches beverage
    // Atwater = 1*4 + 15*4 + 0*9 = 64
    // calories = 90, deviation = |90-64|/64 * 100 = 40.6%
    // 40.6% > 30% (beverage threshold) AND absDiff = 26 < 30 → not flagged (abs too small)
    const item = makeItem({
      name: 'Cold Brew Coffee',
      category: 'snack',
      nd: { calories: 90, carbs: 15, fat: 0, protein: 1 },
    })
    const result = checkAccuracy([item])

    const atwaterFinding = result.findings.find((f) => f.checkName === 'atwater_deviation')
    expect(atwaterFinding).toBeUndefined()
  })

  it('returns clean result for valid items', () => {
    // Default item: Atwater = 25*4 + 50*4 + 20*9 = 480 vs cal=500
    // deviation = |500-480|/480*100 = ~4.2% — well under 20% threshold
    const item = makeItem({})
    const result = checkAccuracy([item])

    expect(result.findings).toHaveLength(0)
    expect(result.autoFixes).toHaveLength(0)
    expect(result.stats.checked).toBe(1)
    expect(result.stats.clean).toBe(1)
    expect(result.stats.flagged).toBe(0)
  })

  it('validates alcoholic items via the alcohol Atwater term when alcohol_grams is known', () => {
    // Margarita: P*4 + C*4 + F*9 + alc*7 = 0 + 120 + 0 + 28*7 = 316 vs 320 cal
    // deviation ~1.3% → no finding. Previously this item was skipped entirely.
    const ok = makeItem({
      name: 'Frozen Margarita',
      category: 'beverage',
      nd: { calories: 320, carbs: 30, fat: 0, protein: 0, alcohol_grams: 28 },
    })
    // Same drink claiming 700 cal → deviation 121% → HIGH, no longer hidden by the alcohol skip.
    const bad = makeItem({
      name: 'Frozen Margarita',
      category: 'beverage',
      nd: { calories: 700, carbs: 30, fat: 0, protein: 0, alcohol_grams: 28 },
    })
    const result = checkAccuracy([ok, bad])

    const findings = result.findings.filter((f) => f.checkName === 'atwater_deviation')
    expect(findings).toHaveLength(1)
    expect(findings[0]!.severity).toBe('HIGH')
  })

  it('flags alcohol-suspected items without alcohol_grams as LOW instead of silently skipping', () => {
    const item = makeItem({
      name: 'Frozen Margarita',
      category: 'beverage',
      nd: { calories: 400, carbs: 30, fat: 0, protein: 0, alcohol_grams: null },
    })
    const result = checkAccuracy([item])

    expect(result.findings.find((f) => f.checkName === 'atwater_deviation')).toBeUndefined()
    const missing = result.findings.find((f) => f.checkName === 'alcohol_grams_missing')
    expect(missing).toBeDefined()
    expect(missing!.severity).toBe('LOW')
  })

  it('carries the current confidence on auto-fixes so apply can demote it', () => {
    const item = makeItem({ nd: { fiber: 60, carbs: 30, confidence_score: 75 } })
    const result = checkAccuracy([item])

    const fix = result.autoFixes.find((f) => f.field === 'fiber')
    expect(fix).toBeDefined()
    expect(fix!.currentConfidence).toBe(75)
  })

  it('flags 5+ differently-named non-official items sharing an identical nutrition profile', () => {
    const tuple = { calories: 450, carbs: 52, fat: 18, protein: 12, sugar: 9, fiber: 3, sodium: 600 }
    const clones = ['Pasta Bowl', 'Veggie Wrap', 'BBQ Plate', 'Fish Tacos', 'Rice Bowl'].map((name, i) =>
      makeItem({ id: `tpl-${i}`, name, nd: { ...tuple, id: `nd-tpl-${i}`, source: 'crowdsourced' } }),
    )
    const result = checkAccuracy(clones)

    const finding = result.findings.find((f) => f.checkName === 'template_profile')
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('LOW')
    expect(result.stats.templateGroups).toBe(1)
  })

  it('does not flag identical profiles on official rows or same-named chain copies', () => {
    const tuple = { calories: 450, carbs: 52, fat: 18, protein: 12, sugar: 9, fiber: 3, sodium: 600 }
    // Official chain values repeated across locations — legitimate.
    const officials = ['Latte', 'Mocha', 'Flat White', 'Cappuccino', 'Americano'].map((name, i) =>
      makeItem({ id: `off-${i}`, name, nd: { ...tuple, id: `nd-off-${i}`, source: 'official' } }),
    )
    // Same item name at five restaurants — one product, many locations.
    const sameName = Array.from({ length: 5 }, (_, i) =>
      makeItem({ id: `same-${i}`, name: 'Mickey Pretzel', nd: { ...tuple, id: `nd-same-${i}`, source: 'crowdsourced' } }),
    )
    const result = checkAccuracy([...officials, ...sameName])

    expect(result.findings.find((f) => f.checkName === 'template_profile')).toBeUndefined()
  })
})
