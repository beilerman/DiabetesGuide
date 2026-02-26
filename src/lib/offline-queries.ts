import { supabase } from './supabase'
import {
  writeParks,
  readParks,
  writeRestaurants,
  readRestaurants,
  readRestaurantsByPark,
  writeAllItems,
  readAllItems,
  readItemsByPark,
  setLastSync,
} from './offline-db'
import type { Park, Restaurant, MenuItemWithNutrition } from './types'

const MENU_ITEMS_SELECT = `
  *,
  nutritional_data (*),
  allergens (*),
  restaurant:restaurants (*, park:parks (*))
`

type MenuItemsBatchFetcher = (args: {
  from: number
  to: number
  restaurantIds?: string[]
}) => Promise<MenuItemWithNutrition[]>

export interface FetchMenuItemsOptions {
  limit?: number
  fetchPage?: MenuItemsBatchFetcher
}

async function fetchMenuItemsPage({ from, to, restaurantIds }: {
  from: number
  to: number
  restaurantIds?: string[]
}): Promise<MenuItemWithNutrition[]> {
  let query = supabase
    .from('menu_items')
    .select(MENU_ITEMS_SELECT)
    .order('name')
    .order('id')
    .range(from, to)

  if (restaurantIds && restaurantIds.length > 0) {
    query = query.in('restaurant_id', restaurantIds)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as MenuItemWithNutrition[]
}

async function fetchAllMenuItemsOnline(
  restaurantIds?: string[],
  maxItems?: number,
  fetchPage: MenuItemsBatchFetcher = fetchMenuItemsPage,
): Promise<MenuItemWithNutrition[]> {
  const batchSize = 1000
  const cap = typeof maxItems === 'number' ? maxItems : Infinity
  let from = 0
  const allItems: MenuItemWithNutrition[] = []

  while (allItems.length < cap) {
    const batch = await fetchPage({ from, to: from + batchSize - 1, restaurantIds })
    if (batch.length === 0) break
    allItems.push(...batch)
    if (batch.length < batchSize) break
    from += batchSize
  }

  return Number.isFinite(cap) ? allItems.slice(0, cap) : allItems
}

function escapeSearch(q: string): string {
  return q.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&').replace(/[,().'"]/g, '')
}

/** Fetch parks with offline fallback */
export async function fetchParksOffline(): Promise<Park[]> {
  try {
    const { data, error } = await supabase
      .from('parks')
      .select('*')
      .order('name')
    if (error) throw error
    const parks = data as Park[]
    // Cache in background
    writeParks(parks).catch(() => {})
    setLastSync(new Date().toISOString()).catch(() => {})
    return parks
  } catch {
    const cached = await readParks()
    if (cached.length > 0) return cached
    throw new Error('No network and no cached data available')
  }
}

/** Fetch restaurants with offline fallback */
export async function fetchRestaurantsOffline(parkId: string): Promise<Restaurant[]> {
  try {
    const { data, error } = await supabase
      .from('restaurants')
      .select('*')
      .eq('park_id', parkId)
      .order('land')
      .order('name')
    if (error) throw error
    const restaurants = data as Restaurant[]
    writeRestaurants(restaurants).catch(() => {})
    return restaurants
  } catch {
    const cached = await readRestaurantsByPark(parkId)
    if (cached.length > 0) return cached
    throw new Error('No network and no cached restaurant data')
  }
}

/** Fetch all restaurants with offline fallback */
export async function fetchAllRestaurantsOffline(): Promise<Restaurant[]> {
  try {
    const { data, error } = await supabase
      .from('restaurants')
      .select('*')
    if (error) throw error
    const restaurants = data as Restaurant[]
    writeRestaurants(restaurants).catch(() => {})
    return restaurants
  } catch {
    const cached = await readRestaurants()
    if (cached.length > 0) return cached
    throw new Error('No network and no cached restaurant data')
  }
}

/** Fetch menu items with offline fallback */
export async function fetchMenuItemsOffline(
  parkId?: string,
  options?: FetchMenuItemsOptions,
): Promise<MenuItemWithNutrition[]> {
  try {
    let items: MenuItemWithNutrition[]
    const { limit, fetchPage } = options ?? {}
    if (parkId) {
      const { data: restaurants, error: restErr } = await supabase
        .from('restaurants')
        .select('id')
        .eq('park_id', parkId)
      if (restErr) throw restErr
      const restaurantIds = (restaurants || []).map(r => r.id)
      if (restaurantIds.length === 0) return []
      items = await fetchAllMenuItemsOnline(restaurantIds, limit, fetchPage)
    } else {
      items = await fetchAllMenuItemsOnline(undefined, limit, fetchPage)
    }
    // Cache in background
    writeAllItems(items).catch(() => {})
    setLastSync(new Date().toISOString()).catch(() => {})
    return items
  } catch {
    if (parkId) {
      const cached = await readItemsByPark(parkId)
      if (cached.length > 0) return cached
    } else {
      const cached = await readAllItems()
      if (cached.length > 0) return cached
    }
    throw new Error('No network and no cached menu data')
  }
}

/** Search with offline fallback */
export async function searchMenuItemsOffline(searchQuery: string): Promise<MenuItemWithNutrition[]> {
  try {
    const escaped = escapeSearch(searchQuery.trim())
    const { data, error } = await supabase
      .from('menu_items')
      .select(MENU_ITEMS_SELECT)
      .or(`name.ilike.%${escaped}%,description.ilike.%${escaped}%`)
      .order('name')
      .limit(50)
    if (error) throw error
    return data as MenuItemWithNutrition[]
  } catch {
    // Offline search: filter cached items by name/description
    const allCached = await readAllItems()
    const lower = searchQuery.toLowerCase()
    return allCached
      .filter(item =>
        item.name.toLowerCase().includes(lower) ||
        (item.description && item.description.toLowerCase().includes(lower))
      )
      .slice(0, 50)
  }
}
