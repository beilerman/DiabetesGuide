import { describe, it, expect } from 'vitest'
import { buildSearchIndex, searchItems } from '../search-index'
import type { MenuItemWithNutrition } from '../types'

function makeItem(overrides: Partial<MenuItemWithNutrition>): MenuItemWithNutrition {
  return {
    id: '1',
    restaurant_id: 'r1',
    name: 'Test Item',
    description: null,
    price: null,
    category: 'entree',
    is_seasonal: false,
    is_fried: false,
    is_vegetarian: false,
    photo_url: null,
    created_at: '',
    nutritional_data: [],
    allergens: [],
    ...overrides,
  }
}

const items: MenuItemWithNutrition[] = [
  makeItem({ id: '1', name: 'Turkey Leg', restaurant: { id: 'r1', park_id: 'p1', name: 'Frontierland Cart', land: 'Frontierland', cuisine_type: null, hours: null, lat: null, lon: null, created_at: '' } }),
  makeItem({ id: '2', name: 'DOLE Whip', restaurant: { id: 'r2', park_id: 'p1', name: 'Aloha Isle', land: 'Adventureland', cuisine_type: null, hours: null, lat: null, lon: null, created_at: '' } }),
  makeItem({ id: '3', name: 'Grilled Chicken Sandwich', description: 'Flame-grilled chicken breast with lettuce and tomato' }),
  makeItem({ id: '4', name: 'Mickey Pretzel', restaurant: { id: 'r3', park_id: 'p1', name: 'Various Carts', land: null, cuisine_type: null, hours: null, lat: null, lon: null, created_at: '' } }),
  makeItem({ id: '5', name: 'Blue Milk', description: 'Plant-based frozen blend' }),
]

describe('buildSearchIndex + searchItems', () => {
  const index = buildSearchIndex(items)

  it('finds exact name match', () => {
    const results = searchItems(index, 'Turkey Leg')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('Turkey Leg')
  })

  it('finds fuzzy match for misspelling "turky leg"', () => {
    const results = searchItems(index, 'turky leg')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('Turkey Leg')
  })

  it('finds fuzzy match for "dole wip"', () => {
    const results = searchItems(index, 'dole wip')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('DOLE Whip')
  })

  it('searches restaurant names', () => {
    const results = searchItems(index, 'Aloha Isle')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('DOLE Whip')
  })

  it('searches descriptions', () => {
    const results = searchItems(index, 'flame-grilled')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('Grilled Chicken Sandwich')
  })

  it('returns empty array for empty query', () => {
    expect(searchItems(index, '')).toEqual([])
    expect(searchItems(index, '   ')).toEqual([])
  })

  it('respects limit parameter', () => {
    const results = searchItems(index, 'a', 2)
    expect(results.length).toBeLessThanOrEqual(2)
  })

  it('returns empty for no matches', () => {
    const results = searchItems(index, 'xyzzynonexistent')
    expect(results).toEqual([])
  })
})
