import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  writeParks,
  readParks,
  writeRestaurants,
  readRestaurants,
  readRestaurantsByPark,
  writeAllItems,
  readAllItems,
  readItemsByPark,
  getLastSync,
  setLastSync,
  clearOfflineData,
} from '../offline-db'
import type { Park, Restaurant, MenuItemWithNutrition } from '../types'

const park1: Park = {
  id: 'p1',
  name: 'Magic Kingdom',
  location: 'Walt Disney World',
  timezone: 'America/New_York',
  first_aid_locations: [],
  created_at: '2026-01-01',
}

const park2: Park = {
  id: 'p2',
  name: 'EPCOT',
  location: 'Walt Disney World',
  timezone: 'America/New_York',
  first_aid_locations: [],
  created_at: '2026-01-01',
}

const restaurant1: Restaurant = {
  id: 'r1',
  park_id: 'p1',
  name: "Casey's Corner",
  land: 'Main Street USA',
  cuisine_type: 'American',
  hours: null,
  lat: null,
  lon: null,
  created_at: '2026-01-01',
}

const restaurant2: Restaurant = {
  id: 'r2',
  park_id: 'p2',
  name: 'Les Halles',
  land: 'France',
  cuisine_type: 'French',
  hours: null,
  lat: null,
  lon: null,
  created_at: '2026-01-01',
}

const menuItem1 = {
  id: 'm1',
  restaurant_id: 'r1',
  name: 'Hot Dog',
  description: 'Classic all-beef hot dog',
  price: 12.99,
  category: 'entree' as const,
  is_seasonal: false,
  is_fried: false,
  is_vegetarian: false,
  photo_url: null,
  created_at: '2026-01-01',
  nutritional_data: [{
    id: 'n1', menu_item_id: 'm1', calories: 350, carbs: 28, fat: 18, sugar: 4,
    protein: 14, fiber: 1, sodium: 800, cholesterol: 40, alcohol_grams: null,
    source: 'api_lookup' as const, source_detail: null, confidence_score: 60, created_at: '2026-01-01',
  }],
  allergens: [],
  restaurant: { ...restaurant1, park: park1 },
} satisfies MenuItemWithNutrition

const menuItem2 = {
  id: 'm2',
  restaurant_id: 'r2',
  name: 'Croque Monsieur',
  description: null,
  price: 15.99,
  category: 'entree' as const,
  is_seasonal: false,
  is_fried: false,
  is_vegetarian: false,
  photo_url: null,
  created_at: '2026-01-01',
  nutritional_data: [{
    id: 'n2', menu_item_id: 'm2', calories: 550, carbs: 38, fat: 30, sugar: 3,
    protein: 28, fiber: 2, sodium: 900, cholesterol: 60, alcohol_grams: null,
    source: 'api_lookup' as const, source_detail: null, confidence_score: 55, created_at: '2026-01-01',
  }],
  allergens: [],
  restaurant: { ...restaurant2, park: park2 },
} satisfies MenuItemWithNutrition

beforeEach(async () => {
  await clearOfflineData()
})

describe('offline-db parks', () => {
  it('writes and reads parks', async () => {
    await writeParks([park1, park2])
    const parks = await readParks()
    expect(parks).toHaveLength(2)
    expect(parks.map(p => p.name)).toContain('Magic Kingdom')
  })
})

describe('offline-db restaurants', () => {
  it('writes and reads restaurants', async () => {
    await writeRestaurants([restaurant1, restaurant2])
    const all = await readRestaurants()
    expect(all).toHaveLength(2)
  })

  it('reads restaurants by park', async () => {
    await writeRestaurants([restaurant1, restaurant2])
    const p1Restaurants = await readRestaurantsByPark('p1')
    expect(p1Restaurants).toHaveLength(1)
    expect(p1Restaurants[0].name).toBe("Casey's Corner")
  })
})

describe('offline-db items', () => {
  it('writes and reads all items', async () => {
    await writeAllItems([menuItem1, menuItem2])
    const all = await readAllItems()
    expect(all).toHaveLength(2)
  })

  it('reads items by park', async () => {
    await writeAllItems([menuItem1, menuItem2])
    const p2Items = await readItemsByPark('p2')
    expect(p2Items).toHaveLength(1)
    expect(p2Items[0].name).toBe('Croque Monsieur')
  })

  it('preserves nested nutrition data', async () => {
    await writeAllItems([menuItem1])
    const items = await readAllItems()
    expect(items[0].nutritional_data).toHaveLength(1)
    expect(items[0].nutritional_data[0].calories).toBe(350)
  })
})

describe('offline-db metadata', () => {
  it('returns null when no sync recorded', async () => {
    const ts = await getLastSync()
    expect(ts).toBeNull()
  })

  it('writes and reads lastSync', async () => {
    await setLastSync('2026-02-22T08:00:00Z')
    const ts = await getLastSync()
    expect(ts).toBe('2026-02-22T08:00:00Z')
  })

  it('overwrites lastSync', async () => {
    await setLastSync('2026-02-22T08:00:00Z')
    await setLastSync('2026-02-22T12:00:00Z')
    const ts = await getLastSync()
    expect(ts).toBe('2026-02-22T12:00:00Z')
  })
})

describe('clearOfflineData', () => {
  it('clears all stores', async () => {
    await writeParks([park1])
    await writeRestaurants([restaurant1])
    await writeAllItems([menuItem1])
    await setLastSync('2026-02-22')
    await clearOfflineData()
    expect(await readParks()).toHaveLength(0)
    expect(await readRestaurants()).toHaveLength(0)
    expect(await readAllItems()).toHaveLength(0)
    expect(await getLastSync()).toBeNull()
  })
})
