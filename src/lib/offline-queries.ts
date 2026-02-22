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

async function fetchAllMenuItemsOnline(restaurantIds?: string[], maxItems?: number): Promise<MenuItemWithNutrition[]> {
  const batchSize = 1000
  const cap = maxItems ?? Infinity
  let from = 0
  let allItems: MenuItemWithNutrition[] = []

  while (allItems.length < cap) {
    let query = supabase
      .from('menu_items')
      .select(MENU_ITEMS_SELECT)
      .order('name')
      .order('id')
      .range(from, from + batchSize - 1)

    if (restaurantIds && restaurantIds.length > 0) {
      query = query.in('restaurant_id', restaurantIds)
    }

    const { data, error } = await query
    if (error) throw error

    if (!data || data.length === 0) break
    allItems = allItems.concat(data as MenuItemWithNutrition[])
    if (data.length < batchSize) break
    from += batchSize
  }

  return maxItems ? allItems.slice(0, maxItems) : allItems
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
export async function fetchMenuItemsOffline(parkId?: string): Promise<MenuItemWithNutrition[]> {
  try {
    let items: MenuItemWithNutrition[]
    if (parkId) {
      const { data: restaurants, error: restErr } = await supabase
        .from('restaurants')
        .select('id')
        .eq('park_id', parkId)
      if (restErr) throw restErr
      const restaurantIds = (restaurants || []).map(r => r.id)
      if (restaurantIds.length === 0) return []
      items = await fetchAllMenuItemsOnline(restaurantIds)
    } else {
      items = await fetchAllMenuItemsOnline(undefined, 3000)
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
