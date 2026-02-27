import { describe, it, expect } from 'vitest'
import { checkCompleteness } from '../completeness.js'
import type { Item } from '../types.js'

/**
 * Create an array of `count` Item objects for a given park/restaurant.
 * If `nullCalories` is true, nutritional_data will have calories: null.
 */
function makeItems(
  parkName: string,
  restaurantName: string,
  count: number,
  nullCalories = false,
): Item[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${parkName}-${restaurantName}-${i}`,
    name: `Item ${i}`,
    category: 'entree',
    is_vegetarian: false,
    is_fried: false,
    description: null,
    restaurant: { name: restaurantName, park: { name: parkName } },
    nutritional_data: [
      {
        id: `nd-${parkName}-${restaurantName}-${i}`,
        calories: nullCalories ? null : 500,
        carbs: nullCalories ? null : 50,
        fat: nullCalories ? null : 20,
        protein: nullCalories ? null : 25,
        sugar: nullCalories ? null : 10,
        fiber: nullCalories ? null : 5,
        sodium: nullCalories ? null : 800,
        cholesterol: nullCalories ? null : 50,
        source: 'api_lookup',
        confidence_score: 60,
      },
    ],
  }))
}

describe('checkCompleteness', () => {
  it('flags restaurants with < 3 items as MEDIUM', () => {
    const items: Item[] = [
      // "Tiny Place" with only 2 items
      ...makeItems('Good Park', 'Tiny Place', 2),
      // 10 other restaurants with 5 items each (meets MIN_RESTAURANTS_PER_PARK)
      ...Array.from({ length: 10 }, (_, i) =>
        makeItems('Good Park', `Restaurant ${i}`, 5),
      ).flat(),
    ]

    const result = checkCompleteness(items)

    const finding = result.findings.find(
      (f) => f.checkName === 'sparse_restaurant' && f.restaurant === 'Tiny Place',
    )
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('MEDIUM')
    expect(finding!.park).toBe('Good Park')
  })

  it('flags theme parks with < 10 restaurants as HIGH', () => {
    const items: Item[] = [
      // "Dollywood" (theme-park type) with only 2 restaurants
      ...makeItems('Dollywood', 'Restaurant A', 5),
      ...makeItems('Dollywood', 'Restaurant B', 5),
    ]

    const result = checkCompleteness(items)

    const finding = result.findings.find(
      (f) => f.checkName === 'sparse_park' && f.park === 'Dollywood',
    )
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('HIGH')
  })

  it('flags parks with >30% null calories as HIGH', () => {
    const items: Item[] = [
      // "Bad Park": 4 non-null + 6 null at two restaurants
      ...makeItems('Bad Park', 'Bad Restaurant', 4, false),
      ...makeItems('Bad Park', 'Bad Restaurant 2', 6, true),
      // Add 8 more restaurants (3 items each, all null) to hit 10 total restaurants
      // while keeping null percentage high: 6+24=30 null out of 4+6+24=34 total = 88%
      ...Array.from({ length: 8 }, (_, i) =>
        makeItems('Bad Park', `Filler Restaurant ${i}`, 3, true),
      ).flat(),
    ]

    const result = checkCompleteness(items)

    const finding = result.findings.find(
      (f) => f.checkName === 'null_calorie_coverage' && f.park === 'Bad Park',
    )
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('HIGH')
  })

  it('returns clean for well-populated parks', () => {
    const items: Item[] = Array.from({ length: 15 }, (_, i) =>
      makeItems('Great Park', `Restaurant ${i}`, 10),
    ).flat()

    const result = checkCompleteness(items)

    const highFindings = result.findings.filter((f) => f.severity === 'HIGH')
    expect(highFindings).toHaveLength(0)
  })
})
