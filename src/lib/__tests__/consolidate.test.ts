import { describe, it, expect } from 'vitest'
import { consolidateItems, normalizeItemName } from '../consolidate'
import type { MenuItemWithNutrition } from '../types'

function makeItem(
  id: string,
  name: string,
  opts: {
    category?: MenuItemWithNutrition['category']
    carbs?: number | null
    calories?: number | null
    restaurant?: string
    park?: string
  } = {},
): MenuItemWithNutrition {
  return {
    id,
    restaurant_id: `r-${id}`,
    name,
    description: null,
    price: null,
    category: opts.category ?? 'beverage',
    is_seasonal: false,
    is_fried: false,
    is_vegetarian: false,
    photo_url: null,
    created_at: '',
    nutritional_data: [{
      id: `n-${id}`,
      menu_item_id: id,
      calories: opts.calories ?? 0,
      carbs: opts.carbs ?? 0,
      fat: 0,
      sugar: 0,
      protein: 0,
      fiber: 0,
      sodium: 0,
      cholesterol: null,
      alcohol_grams: null,
      source: 'official',
      source_detail: null,
      confidence_score: 70,
      created_at: '',
    }],
    allergens: [],
    restaurant: {
      id: `r-${id}`,
      park_id: 'p1',
      name: opts.restaurant ?? 'Some Cafe',
      land: null,
      cuisine_type: null,
      hours: null,
      lat: null,
      lon: null,
      created_at: '',
      park: {
        id: 'p1',
        name: opts.park ?? 'Magic Kingdom',
        location: '',
        timezone: '',
        first_aid_locations: [],
        created_at: '',
      },
    },
  }
}

describe('normalizeItemName', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeItemName('  Bottled   Water ')).toBe('bottled water')
  })
})

describe('consolidateItems', () => {
  it('merges identical items sold at multiple locations into one group', () => {
    const items = [
      makeItem('a', 'Bottled Water', { restaurant: 'Cafe A', carbs: 0, calories: 0 }),
      makeItem('b', 'Bottled Water', { restaurant: 'Cafe B', carbs: 0, calories: 0 }),
      makeItem('c', 'Bottled Water', { restaurant: 'Cafe C', carbs: 0, calories: 0 }),
    ]
    const result = consolidateItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].locations).toHaveLength(3)
  })

  it('treats name casing and whitespace differences as the same item', () => {
    const items = [
      makeItem('a', 'Bottled Water'),
      makeItem('b', 'bottled  water'),
    ]
    expect(consolidateItems(items)).toHaveLength(1)
  })

  it('keeps items separate when carbs differ', () => {
    const items = [
      makeItem('a', 'Lemonade', { carbs: 30, calories: 120 }),
      makeItem('b', 'Lemonade', { carbs: 45, calories: 120 }),
    ]
    expect(consolidateItems(items)).toHaveLength(2)
  })

  it('keeps items separate when calories differ', () => {
    const items = [
      makeItem('a', 'Lemonade', { carbs: 30, calories: 120 }),
      makeItem('b', 'Lemonade', { carbs: 30, calories: 200 }),
    ]
    expect(consolidateItems(items)).toHaveLength(2)
  })

  it('keeps items separate when category differs', () => {
    const items = [
      makeItem('a', 'Apple', { category: 'snack', carbs: 25, calories: 95 }),
      makeItem('b', 'Apple', { category: 'side', carbs: 25, calories: 95 }),
    ]
    expect(consolidateItems(items)).toHaveLength(2)
  })

  it('preserves input order by first occurrence', () => {
    const items = [
      makeItem('z', 'Zebra Cake', { carbs: 50, calories: 400 }),
      makeItem('a', 'Apple Juice', { carbs: 28, calories: 110 }),
      makeItem('z2', 'Zebra Cake', { carbs: 50, calories: 400 }),
    ]
    const result = consolidateItems(items)
    expect(result.map(g => g.item.name)).toEqual(['Zebra Cake', 'Apple Juice'])
  })

  it('sorts locations within a group by park then restaurant', () => {
    const items = [
      makeItem('a', 'Water', { restaurant: 'Zeta', park: 'EPCOT' }),
      makeItem('b', 'Water', { restaurant: 'Alpha', park: 'EPCOT' }),
      makeItem('c', 'Water', { restaurant: 'Beta', park: 'Animal Kingdom' }),
    ]
    const [group] = consolidateItems(items)
    expect(group.locations.map(l => l.restaurant?.name)).toEqual(['Beta', 'Alpha', 'Zeta'])
  })
})
