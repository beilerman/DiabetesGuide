import { describe, it, expect } from 'vitest'
import { applyFilters, DEFAULT_FILTERS } from '../filters'
import type { MenuItemWithNutrition, Filters } from '../types'

function makeItem(overrides: Partial<MenuItemWithNutrition> & { carbs?: number; sugar?: number; protein?: number; fiber?: number; calories?: number; sodium?: number; alcohol_grams?: number | null; allergenTypes?: string[] }): MenuItemWithNutrition {
  const { carbs, sugar, protein, fiber, calories, sodium, alcohol_grams, allergenTypes, ...rest } = overrides
  return {
    id: 'test-1',
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
    nutritional_data: [{
      id: 'n1',
      menu_item_id: 'test-1',
      calories: calories ?? 500,
      carbs: carbs ?? 40,
      fat: 20,
      sugar: sugar ?? 10,
      protein: protein ?? 25,
      fiber: fiber ?? 3,
      sodium: sodium ?? 600,
      cholesterol: null,
      alcohol_grams: alcohol_grams ?? null,
      source: 'api_lookup',
      source_detail: null,
      confidence_score: 60,
      created_at: '',
    }],
    allergens: (allergenTypes ?? []).map(t => ({
      id: `a-${t}`,
      menu_item_id: 'test-1',
      allergen_type: t,
      severity: 'contains' as const,
      created_at: '',
    })),
    ...rest,
  }
}

describe('applyFilters — grade filter', () => {
  it('filters items to A and B grades only', () => {
    const items = [
      makeItem({ id: 'a1', name: 'Grilled Chicken', carbs: 10, protein: 30, calories: 250, sugar: 1, fiber: 2 }), // A
      makeItem({ id: 'b1', name: 'Turkey Wrap', carbs: 35, protein: 20, calories: 450, sugar: 5, fiber: 4 }), // B
      makeItem({ id: 'f1', name: 'Mega Sundae', carbs: 95, protein: 4, calories: 900, sugar: 80, fiber: 0 }), // F
    ]
    const filters: Filters = { ...DEFAULT_FILTERS, gradeFilter: ['A', 'B'] }
    const result = applyFilters(items, filters)
    expect(result.length).toBe(2)
    expect(result.map(i => i.id)).toContain('a1')
    expect(result.map(i => i.id)).toContain('b1')
  })

  it('returns all items when gradeFilter is null', () => {
    const items = [
      makeItem({ id: 'a1', carbs: 10 }),
      makeItem({ id: 'f1', carbs: 95, sugar: 80, calories: 900 }),
    ]
    const filters: Filters = { ...DEFAULT_FILTERS, gradeFilter: null }
    const result = applyFilters(items, filters)
    expect(result.length).toBe(2)
  })
})

describe('applyFilters — allergen-free filter', () => {
  it('excludes items containing specified allergens', () => {
    const items = [
      makeItem({ id: 'ok', name: 'Plain Rice', allergenTypes: [] }),
      makeItem({ id: 'dairy', name: 'Cheese Pizza', allergenTypes: ['dairy'] }),
      makeItem({ id: 'gluten', name: 'Bread', allergenTypes: ['gluten'] }),
    ]
    const filters: Filters = { ...DEFAULT_FILTERS, allergenFree: ['dairy'] }
    const result = applyFilters(items, filters)
    expect(result.length).toBe(2)
    expect(result.map(i => i.id)).not.toContain('dairy')
  })
})

describe('applyFilters — alcohol-free toggle', () => {
  it('hides items with alcohol when hideAlcohol is true', () => {
    const items = [
      makeItem({ id: 'food', name: 'Burger', alcohol_grams: null }),
      makeItem({ id: 'beer', name: 'Beer', alcohol_grams: 14, category: 'beverage' }),
    ]
    const filters: Filters = { ...DEFAULT_FILTERS, hideAlcohol: true }
    const result = applyFilters(items, filters)
    expect(result.length).toBe(1)
    expect(result[0].id).toBe('food')
  })
})

describe('applyFilters — grade sort', () => {
  it('sorts by grade score descending', () => {
    const items = [
      makeItem({ id: 'f1', name: 'Sundae', carbs: 95, sugar: 80, calories: 900, protein: 4, fiber: 0 }),
      makeItem({ id: 'a1', name: 'Chicken', carbs: 10, protein: 30, calories: 250, sugar: 1, fiber: 2 }),
      makeItem({ id: 'c1', name: 'Pasta', carbs: 50, protein: 15, calories: 550, sugar: 8, fiber: 3 }),
    ]
    const filters: Filters = { ...DEFAULT_FILTERS, sort: 'grade' }
    const result = applyFilters(items, filters)
    expect(result[0].id).toBe('a1')
    expect(result[result.length - 1].id).toBe('f1')
  })
})
