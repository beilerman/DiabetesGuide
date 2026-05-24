import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchMenuItemsByIdsOffline,
  fetchMenuItemsOffline,
  searchMenuItemsOffline,
} from '../offline-queries'
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

function makeItem(id: string, parkId = 'park-1'): MenuItemWithNutrition {
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
    restaurant: {
      id: 'r1',
      park_id: parkId,
      name: 'Test Restaurant',
      land: null,
      cuisine_type: null,
      hours: null,
      lat: null,
      lon: null,
      created_at: '',
      park: {
        id: parkId,
        name: `Park ${parkId}`,
        location: '',
        timezone: '',
        first_aid_locations: [],
        created_at: '',
      },
    },
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

describe('searchMenuItemsOffline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('trims whitespace before filtering cached items during offline fallback', async () => {
    const cached = [
      makeItem('turkey-leg'),
      makeItem('fruit-cup'),
    ]
    cached[0].name = 'Turkey Leg'
    cached[1].name = 'Fruit Cup'
    offlineDbMocks.readAllItems.mockResolvedValueOnce(cached)

    const results = await searchMenuItemsOffline('  turkey  ')

    expect(results.map(item => item.id)).toEqual(['turkey-leg'])
  })

  it('filters cached offline search results to the selected park', async () => {
    const cached = [
      makeItem('mk-turkey', 'magic-kingdom'),
      makeItem('epcot-turkey', 'epcot'),
      makeItem('mk-fruit', 'magic-kingdom'),
    ]
    cached[0].name = 'Turkey Leg'
    cached[1].name = 'Turkey Leg'
    cached[2].name = 'Fruit Cup'
    offlineDbMocks.readAllItems.mockResolvedValueOnce(cached)

    const results = await searchMenuItemsOffline('turkey', 'magic-kingdom')

    expect(results.map(item => item.id)).toEqual(['mk-turkey'])
  })
})

describe('fetchMenuItemsByIdsOffline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns cached items matching requested IDs when online fetch falls back', async () => {
    const cached = [
      makeItem('favorite-1'),
      makeItem('other-item'),
      makeItem('favorite-2'),
    ]
    offlineDbMocks.readAllItems.mockResolvedValueOnce(cached)

    const results = await fetchMenuItemsByIdsOffline(['favorite-2', 'favorite-1'])

    expect(results.map(item => item.id)).toEqual(['favorite-1', 'favorite-2'])
  })

  it('returns an empty list without querying storage when no IDs are provided', async () => {
    const results = await fetchMenuItemsByIdsOffline([])

    expect(results).toEqual([])
    expect(offlineDbMocks.readAllItems).not.toHaveBeenCalled()
  })
})
