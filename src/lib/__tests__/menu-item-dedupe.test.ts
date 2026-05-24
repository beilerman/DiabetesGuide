import { describe, expect, it } from 'vitest'
import { dedupeMenuItems } from '../menu-item-dedupe'
import type { MenuItemWithNutrition } from '../types'

function makeItem({
  id,
  name,
  parkName,
  restaurantName,
  category = 'beverage',
  calories = null,
  carbs = null,
  confidence = 0,
}: {
  id: string
  name: string
  parkName: string
  restaurantName: string
  category?: MenuItemWithNutrition['category']
  calories?: number | null
  carbs?: number | null
  confidence?: number
}): MenuItemWithNutrition {
  return {
    id,
    restaurant_id: `${restaurantName}-id`,
    name,
    description: null,
    price: null,
    category,
    is_seasonal: false,
    is_fried: false,
    is_vegetarian: false,
    photo_url: null,
    created_at: '',
    nutritional_data: confidence > 0
      ? [{
          id: `${id}-nutrition`,
          menu_item_id: id,
          calories,
          carbs,
          fat: null,
          sugar: null,
          protein: null,
          fiber: null,
          sodium: null,
          cholesterol: null,
          alcohol_grams: null,
          source: 'api_lookup',
          source_detail: null,
          confidence_score: confidence,
          created_at: '',
        }]
      : [],
    allergens: [],
    restaurant: {
      id: `${restaurantName}-id`,
      park_id: `${parkName}-id`,
      name: restaurantName,
      land: null,
      cuisine_type: null,
      hours: null,
      lat: null,
      lon: null,
      created_at: '',
      park: {
        id: `${parkName}-id`,
        name: parkName,
        location: '',
        timezone: '',
        first_aid_locations: [],
        created_at: '',
      },
    },
  }
}

describe('dedupeMenuItems', () => {
  it('collapses repeated same-name items within the same normalized park', () => {
    const items = [
      makeItem({
        id: 'without-nutrition',
        name: '? Block Tiramisu',
        parkName: 'Universal Epic Universe',
        restaurantName: 'Toadstool Cafe',
      }),
      makeItem({
        id: 'with-nutrition',
        name: '? Block Tiramisu',
        parkName: "Universal's Epic Universe",
        restaurantName: 'Toadstool Cafe',
        category: 'dessert',
        calories: 530,
        carbs: 58,
        confidence: 55,
      }),
    ]

    const result = dedupeMenuItems(items)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('with-nutrition')
    expect(result[0].availability_count).toBe(1)
    expect(result[0].availability_restaurants).toEqual(['Toadstool Cafe'])
  })

  it('keeps same-name items separate when they are in different parks', () => {
    const items = [
      makeItem({
        id: 'mk-water',
        name: 'Bottled Water',
        parkName: 'Magic Kingdom Park',
        restaurantName: 'Aloha Isle',
      }),
      makeItem({
        id: 'epcot-water',
        name: 'Bottled Water',
        parkName: 'EPCOT',
        restaurantName: 'Refreshment Port',
      }),
    ]

    expect(dedupeMenuItems(items).map(item => item.id)).toEqual(['mk-water', 'epcot-water'])
  })

  it('records how many locations sell a repeated item', () => {
    const items = [
      makeItem({
        id: 'water-1',
        name: 'Bottled Water',
        parkName: 'Disneyland Park',
        restaurantName: 'Plaza Inn',
      }),
      makeItem({
        id: 'water-2',
        name: 'Bottled Water',
        parkName: 'Disneyland Park',
        restaurantName: 'Cafe Daisy',
      }),
      makeItem({
        id: 'water-3',
        name: 'Bottled Water',
        parkName: 'Disneyland Park',
        restaurantName: 'Plaza Inn',
      }),
    ]

    const [item] = dedupeMenuItems(items)

    expect(item.availability_count).toBe(2)
    expect(item.availability_restaurants).toEqual(['Cafe Daisy', 'Plaza Inn'])
  })
})
