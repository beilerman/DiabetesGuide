import { describe, expect, it } from 'vitest'
import {
  cleanDisplayText,
  hasUsableNutrition,
  isLikelyMenuSectionHeader,
} from '../display'
import type { MenuItemWithNutrition, NutritionalData } from '../types'

function nutrition(overrides: Partial<NutritionalData> = {}): NutritionalData {
  return {
    id: 'n1',
    menu_item_id: 'i1',
    calories: null,
    carbs: null,
    fat: null,
    sugar: null,
    protein: null,
    fiber: null,
    sodium: null,
    cholesterol: null,
    alcohol_grams: null,
    source: 'api_lookup',
    source_detail: null,
    confidence_score: 0,
    created_at: '',
    ...overrides,
  }
}

function item(overrides: Partial<MenuItemWithNutrition> = {}): MenuItemWithNutrition {
  return {
    id: 'i1',
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

describe('cleanDisplayText', () => {
  it('removes scraper punctuation and numbering from item names', () => {
    expect(cleanDisplayText('--Add Chocolate Sauce to Basic Funnel Cake')).toBe('Add Chocolate Sauce to Basic Funnel Cake')
    expect(cleanDisplayText('? Block Tiramisu')).toBe('Block Tiramisu')
    expect(cleanDisplayText('** Tier 1 Nigiri')).toBe('Tier 1 Nigiri')
    expect(cleanDisplayText('*Bacon-Donut Fusion')).toBe('Bacon-Donut Fusion')
  })

  it('decodes visible HTML artifacts', () => {
    const raw = 'Abita<sup xmlns="http://www.w3.org/1999/xhtml">\u00ae</sup> Amber &amp; Lager'

    expect(cleanDisplayText(raw)).toBe('Abita\u00ae Amber & Lager')
  })
})

describe('isLikelyMenuSectionHeader', () => {
  it('identifies menu builder section headings instead of foods', () => {
    expect(isLikelyMenuSectionHeader('2. CHOOSE MIX-INS')).toBe(true)
    expect(isLikelyMenuSectionHeader('CHOOSE YOUR SAUCE')).toBe(true)
  })

  it('keeps normal numbered food names', () => {
    expect(isLikelyMenuSectionHeader('2% Milk')).toBe(false)
    expect(isLikelyMenuSectionHeader('3 Cheese Pizza')).toBe(false)
  })
})

describe('hasUsableNutrition', () => {
  it('does not treat missing nutrition as real zero nutrition', () => {
    expect(hasUsableNutrition(item({ nutritional_data: [nutrition()] }))).toBe(false)
  })

  it('allows confirmed zero-calorie items', () => {
    expect(hasUsableNutrition(item({
      name: 'Bottled Water',
      category: 'beverage',
      nutritional_data: [nutrition({
        calories: 0,
        carbs: 0,
        fat: 0,
        sugar: 0,
        protein: 0,
        fiber: 0,
        sodium: 0,
        source: 'official',
        confidence_score: 90,
      })],
    }))).toBe(true)
  })
})
