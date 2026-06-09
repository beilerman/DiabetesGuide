import { describe, it, expect } from 'vitest'
import { buildSearchIndex, searchItemMatches, searchItems } from '../search-index'
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

  it('weights exact and prefix name matches ahead of weaker matches', () => {
    const rankedItems: MenuItemWithNutrition[] = [
      makeItem({ id: 'exact', name: 'Churro' }),
      makeItem({ id: 'prefix', name: 'Churro Bites' }),
      makeItem({ id: 'boundary', name: 'Mini Churro Sundae' }),
      makeItem({ id: 'restaurant', name: 'Cinnamon Twist', restaurant: { id: 'r10', park_id: 'p1', name: 'Churro Cart', land: null, cuisine_type: null, hours: null, lat: null, lon: null, created_at: '' } }),
      makeItem({ id: 'unrelated', name: 'Atlantic Sea Bass', description: 'Pan-seared fish with lemon butter' }),
    ]
    const matches = searchItemMatches(buildSearchIndex(rankedItems), 'churro')

    expect(matches.map(match => match.item.id)).toEqual(['exact', 'prefix', 'boundary', 'restaurant'])
    expect(matches[0]).toMatchObject({ tier: 'strong', reason: 'Exact name match' })
    expect(matches[1]).toMatchObject({ tier: 'strong', reason: 'Name starts with search' })
    expect(matches[2]).toMatchObject({ tier: 'strong', reason: 'Name word match' })
    expect(matches.map(match => match.item.id)).not.toContain('unrelated')
  })

  it('keeps useful fuzzy matches but labels them as weak', () => {
    const matches = searchItemMatches(index, 'turky leg')

    expect(matches[0].item.name).toBe('Turkey Leg')
    expect(matches[0].tier).toBe('weak')
    expect(matches[0].reason).toBe('Fuzzy match')
  })
})
