import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS } from '../filters'
import { getSearchResultView } from '../search-results'
import type { MenuItemWithNutrition } from '../types'

function makeItem(id: string, name: string, carbs: number): MenuItemWithNutrition {
  return {
    id,
    restaurant_id: 'r1',
    name,
    description: null,
    price: null,
    category: 'entree',
    is_seasonal: false,
    is_fried: false,
    is_vegetarian: false,
    photo_url: null,
    created_at: '',
    nutritional_data: [{
      id: `n-${id}`,
      menu_item_id: id,
      calories: 300,
      carbs,
      fat: 10,
      sugar: 4,
      protein: 20,
      fiber: 2,
      sodium: 500,
      cholesterol: null,
      alcohol_grams: null,
      source: 'api_lookup',
      source_detail: null,
      confidence_score: 60,
      created_at: '',
    }],
    allergens: [],
    restaurant: {
      id: 'r1',
      park_id: 'p1',
      name: 'Test Restaurant',
      land: null,
      cuisine_type: null,
      hours: null,
      lat: null,
      lon: null,
      created_at: '',
    },
  }
}

describe('getSearchResultView', () => {
  const items = [
    makeItem('chicken-40', 'Grilled Chicken Sandwich', 40),
    makeItem('chicken-12', 'Chicken Salad', 12),
    makeItem('pretzel', 'Mickey Pretzel', 70),
  ]

  it('uses fuzzy matching for misspelled searches', () => {
    const view = getSearchResultView(items, 'chiken', DEFAULT_FILTERS, 10)

    expect(view.totalMatches).toBe(2)
    expect(view.visibleItems.map(item => item.id)).toEqual(['chicken-12', 'chicken-40'])
  })

  it('applies search-page filters and sort before paging', () => {
    const view = getSearchResultView(
      items,
      'chicken',
      { ...DEFAULT_FILTERS, maxCarbs: 30, sort: 'carbsAsc' },
      10,
    )

    expect(view.totalMatches).toBe(1)
    expect(view.visibleItems.map(item => item.id)).toEqual(['chicken-12'])
  })

  it('reports when more matching results exist beyond the visible page', () => {
    const view = getSearchResultView(items, 'chicken', DEFAULT_FILTERS, 1)

    expect(view.visibleItems).toHaveLength(1)
    expect(view.hasMore).toBe(true)
  })
})
