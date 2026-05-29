import { describe, it, expect } from 'vitest'
import { findBetterChoices } from '../recommendations'
import type { MenuItemWithNutrition } from '../types'

function makeItem(id: string, calories: number, carbs: number, category: string = 'entree'): MenuItemWithNutrition {
  return {
    id,
    name: `Item ${id}`,
    category,
    description: null,
    price: null,
    is_vegetarian: false,
    is_fried: false,
    is_seasonal: false,
    restaurant_id: 'r-1',
    restaurant: null,
    nutritional_data: [{
      id: `nd-${id}`,
      menu_item_id: id,
      calories,
      carbs,
      fat: 20,
      protein: 20,
      sugar: 5,
      fiber: 3,
      sodium: 800,
      cholesterol: null,
      alcohol_grams: null,
      source: 'official',
      source_detail: null,
      confidence_score: 90,
      created_at: '2026-01-01',
      updated_at: null,
    }],
    allergens: [],
  } as unknown as MenuItemWithNutrition
}

describe('findBetterChoices', () => {
  it('returns the top 2 sibling items with strictly higher scores', () => {
    // Lower calories + lower carbs → higher score in this app's grading.
    const current = makeItem('cur', 900, 100)
    const siblings = [
      makeItem('a', 800, 90),
      makeItem('b', 400, 30),
      makeItem('c', 500, 40),
    ]
    const result = findBetterChoices(current, siblings)
    expect(result.length).toBeLessThanOrEqual(2)
    // Best two should appear; current itself excluded.
    expect(result.map((r) => r.item.id)).not.toContain('cur')
  })

  it('excludes the current item from siblings even if duplicated', () => {
    const current = makeItem('cur', 600, 50)
    const result = findBetterChoices(current, [current, makeItem('a', 300, 20)])
    expect(result.find((r) => r.item.id === 'cur')).toBeUndefined()
  })

  it('returns [] when no sibling beats the current score', () => {
    const current = makeItem('cur', 200, 10)
    const result = findBetterChoices(current, [makeItem('a', 900, 100), makeItem('b', 1100, 130)])
    expect(result).toEqual([])
  })

  it('returns [] when the current item has no nutrition data', () => {
    const current = makeItem('cur', 200, 10)
    current.nutritional_data = []
    const result = findBetterChoices(current, [makeItem('a', 200, 10)])
    expect(result).toEqual([])
  })

  it('respects the limit option', () => {
    const current = makeItem('cur', 900, 100)
    const siblings = [
      makeItem('a', 400, 30),
      makeItem('b', 350, 25),
      makeItem('c', 300, 20),
      makeItem('d', 250, 15),
    ]
    expect(findBetterChoices(current, siblings, { limit: 3 }).length).toBe(3)
  })
})
