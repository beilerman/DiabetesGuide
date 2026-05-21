import { describe, it, expect } from 'vitest'
import { cleanItemName, cleanItemNames } from '../item-name'
import type { MenuItemWithNutrition } from '../types'

describe('cleanItemName', () => {
  it('strips a year + festival prefix joined with a hyphen', () => {
    expect(
      cleanItemName('2026 FESTIVAL OF THE ARTS- Artist Palette Jumbo Chocolate Chip Cookie'),
    ).toBe('Artist Palette Jumbo Chocolate Chip Cookie')
  })

  it('strips a spaced-hyphen festival prefix', () => {
    expect(cleanItemName('2026 EPCOT Food & Wine Festival - Beef Skewer')).toBe('Beef Skewer')
  })

  it('strips a colon-separated festival prefix', () => {
    expect(
      cleanItemName('EPCOT International Festival of the Arts: Lemon-Violet Macaron'),
    ).toBe('Lemon-Violet Macaron')
  })

  it('strips a flower & garden festival prefix', () => {
    expect(cleanItemName('2026 Flower & Garden Festival - Peach Cobbler')).toBe('Peach Cobbler')
  })

  it('leaves a plain dish name untouched', () => {
    expect(cleanItemName('Artist Palette Jumbo Chocolate Chip Cookie')).toBe(
      'Artist Palette Jumbo Chocolate Chip Cookie',
    )
  })

  it('does not strip hyphenated dish names', () => {
    expect(cleanItemName('Red Wine-braised Beef Short Rib')).toBe('Red Wine-braised Beef Short Rib')
    expect(cleanItemName('Beer-battered Onion Rings')).toBe('Beer-battered Onion Rings')
  })

  it('does not strip a non-event prefix even when spaced', () => {
    expect(cleanItemName('Chicken Sandwich - Spicy')).toBe('Chicken Sandwich - Spicy')
  })

  it('does not strip a single-word "Festival-Style" compound', () => {
    expect(cleanItemName('Festival-Style Nachos')).toBe('Festival-Style Nachos')
  })

  it('handles empty and nullish input', () => {
    expect(cleanItemName('')).toBe('')
    expect(cleanItemName(null)).toBe('')
    expect(cleanItemName(undefined)).toBe('')
  })

  it('trims surrounding whitespace', () => {
    expect(cleanItemName('  Churro  ')).toBe('Churro')
  })
})

describe('cleanItemNames', () => {
  function makeItem(id: string, name: string): MenuItemWithNutrition {
    return {
      id,
      restaurant_id: 'r1',
      name,
      description: null,
      price: null,
      category: 'snack',
      is_seasonal: false,
      is_fried: false,
      is_vegetarian: false,
      photo_url: null,
      created_at: '',
      nutritional_data: [],
      allergens: [],
    }
  }

  it('cleans names across a list while preserving other fields', () => {
    const items = [
      makeItem('a', '2026 FESTIVAL OF THE ARTS- Artist Palette Cookie'),
      makeItem('b', 'Churro'),
    ]
    const result = cleanItemNames(items)
    expect(result[0].name).toBe('Artist Palette Cookie')
    expect(result[0].id).toBe('a')
    expect(result[1]).toBe(items[1]) // unchanged items keep their reference
  })
})
