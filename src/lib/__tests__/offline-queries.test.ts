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

  it('caps the all-parks menu query by default', async () => {
    const dataset = Array.from({ length: 5200 }, (_, i) => makeItem(`item-${i}`))
    const fetchPage = vi.fn(async ({ from, to }) => dataset.slice(from, Math.min(to + 1, dataset.length)))

    const items = await fetchMenuItemsOffline(undefined, { fetchPage })

    expect(items).toHaveLength(3000)
    expect(items[items.length - 1].id).toBe('item-2999')
    expect(fetchPage).toHaveBeenCalledTimes(3)
    expect(offlineDbMocks.writeAllItems).toHaveBeenCalledTimes(1)
    expect(offlineDbMocks.writeAllItems.mock.calls[0][0]).toHaveLength(3000)
  })

  it('respects an explicit limit override for diagnostics', async () => {
    const dataset = Array.from({ length: 2000 }, (_, i) => makeItem(`limited-${i}`))
    const fetchPage = vi.fn(async ({ from, to }) => dataset.slice(from, Math.min(to + 1, dataset.length)))

    const items = await fetchMenuItemsOffline(undefined, { fetchPage, limit: 750 })

    expect(items).toHaveLength(750)
    expect(items[items.length - 1].id).toBe('limited-749')
  })

  it('collapses repeated same-name items in the same park before returning menu lists', async () => {
    const dataset = [
      makeItem('water-1', 'magic-kingdom'),
      makeItem('water-2', 'magic-kingdom'),
      makeItem('water-epcot', 'epcot'),
    ]
    dataset[0].name = 'Bottled Water'
    dataset[1].name = 'Bottled Water'
    dataset[2].name = 'Bottled Water'
    dataset[0].restaurant!.name = 'Aloha Isle'
    dataset[1].restaurant!.name = 'Casey’s Corner'
    dataset[2].restaurant!.name = 'Refreshment Port'
    const fetchPage = vi.fn(async ({ from, to }) => dataset.slice(from, Math.min(to + 1, dataset.length)))

    const items = await fetchMenuItemsOffline(undefined, { fetchPage })

    expect(items.map(item => item.id)).toEqual(['water-1', 'water-epcot'])
    expect(items[0].availability_count).toBe(2)
    expect(items[0].availability_restaurants).toEqual(['Aloha Isle', 'Casey’s Corner'])
  })

  it('can return raw restaurant-level rows when dedupe is disabled', async () => {
    const dataset = [
      makeItem('water-1', 'magic-kingdom'),
      makeItem('water-2', 'magic-kingdom'),
    ]
    dataset[0].name = 'Bottled Water'
    dataset[1].name = 'Bottled Water'
    dataset[0].restaurant!.name = 'Aloha Isle'
    dataset[1].restaurant!.name = 'Casey’s Corner'
    const fetchPage = vi.fn(async ({ from, to }) => dataset.slice(from, Math.min(to + 1, dataset.length)))

    const items = await fetchMenuItemsOffline(undefined, { fetchPage, dedupe: false })

    expect(items.map(item => item.id)).toEqual(['water-1', 'water-2'])
    expect(items[0].availability_count).toBeUndefined()
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
