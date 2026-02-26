import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchMenuItemsOffline } from '../offline-queries'
import type { MenuItemWithNutrition } from '../types'

const supabaseMock = vi.hoisted(() => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => ({ order: () => ({ range: () => ({ in: () => ({}) }) }) }) }),
    }),
  },
}))

vi.mock('../supabase', () => supabaseMock)

const offlineDbMocks = vi.hoisted(() => ({
  writeParks: vi.fn(),
  readParks: vi.fn(),
  writeRestaurants: vi.fn(),
  readRestaurants: vi.fn(),
  readRestaurantsByPark: vi.fn(),
  writeAllItems: vi.fn().mockResolvedValue(undefined),
  readAllItems: vi.fn().mockResolvedValue([]),
  readItemsByPark: vi.fn(),
  setLastSync: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../offline-db', () => offlineDbMocks)

function makeItem(id: string): MenuItemWithNutrition {
  return {
    id,
    restaurant_id: 'r1',
    name: `Item ${id}`,
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
  }
}

describe('fetchMenuItemsOffline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches every batch when no global limit is provided', async () => {
    const dataset = Array.from({ length: 5200 }, (_, i) => makeItem(`item-${i}`))
    const fetchPage = vi.fn(async ({ from, to }) => dataset.slice(from, Math.min(to + 1, dataset.length)))

    const items = await fetchMenuItemsOffline(undefined, { fetchPage })

    expect(items).toHaveLength(dataset.length)
    expect(items[items.length - 1].id).toBe('item-5199')
    expect(fetchPage).toHaveBeenCalledTimes(Math.ceil(dataset.length / 1000))
    expect(offlineDbMocks.writeAllItems).toHaveBeenCalledWith(items)
  })

  it('respects an explicit limit override for diagnostics', async () => {
    const dataset = Array.from({ length: 2000 }, (_, i) => makeItem(`limited-${i}`))
    const fetchPage = vi.fn(async ({ from, to }) => dataset.slice(from, Math.min(to + 1, dataset.length)))

    const items = await fetchMenuItemsOffline(undefined, { fetchPage, limit: 750 })

    expect(items).toHaveLength(750)
    expect(items[items.length - 1].id).toBe('limited-749')
  })
})
