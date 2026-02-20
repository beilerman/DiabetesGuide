import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Park, Restaurant, MenuItemWithNutrition } from './types'

const MENU_ITEMS_SELECT = `
  *,
  nutritional_data (*),
  allergens (*),
  restaurant:restaurants (*, park:parks (*))
`

function escapeSearch(q: string): string {
  return q.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&').replace(/[,().'"]/g, '')
}

async function fetchAllMenuItems(restaurantIds?: string[], maxItems?: number): Promise<MenuItemWithNutrition[]> {
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

export function useParks() {
  return useQuery({
    queryKey: ['parks'],
    queryFn: async (): Promise<Park[]> => {
      const { data, error } = await supabase
        .from('parks')
        .select('*')
        .order('name')
      if (error) throw error
      return data as Park[]
    },
  })
}

export function useRestaurants(parkId: string | undefined) {
  return useQuery({
    queryKey: ['restaurants', parkId],
    queryFn: async (): Promise<Restaurant[]> => {
      if (!parkId) return []
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('park_id', parkId)
        .order('land')
        .order('name')
      if (error) throw error
      return data as Restaurant[]
    },
    enabled: !!parkId,
  })
}

export function useMenuItems(parkId?: string) {
  return useQuery({
    queryKey: ['menuItems', parkId],
    queryFn: async (): Promise<MenuItemWithNutrition[]> => {
      if (parkId) {
        // Fetch restaurant IDs for this park, then fetch their menu items
        const { data: restaurants, error: restErr } = await supabase
          .from('restaurants')
          .select('id')
          .eq('park_id', parkId)
        if (restErr) throw restErr
        const restaurantIds = (restaurants || []).map(r => r.id)
        if (restaurantIds.length === 0) return []

        return fetchAllMenuItems(restaurantIds)
      }

      // Cap "All Parks" to 3000 items to avoid 10+ sequential API calls on mobile.
      // Per-park views fetch all items since each park has at most ~1000.
      return fetchAllMenuItems(undefined, 3000)
    },
    enabled: true,
  })
}

export function useSearch(searchQuery: string) {
  return useQuery({
    queryKey: ['search', searchQuery],
    queryFn: async (): Promise<MenuItemWithNutrition[]> => {
      if (!searchQuery.trim()) return []
      const escaped = escapeSearch(searchQuery.trim())
      const { data, error } = await supabase
        .from('menu_items')
        .select(MENU_ITEMS_SELECT)
        .or(`name.ilike.%${escaped}%,description.ilike.%${escaped}%`)
        .order('name')
        .limit(50)
      if (error) throw error
      return data as MenuItemWithNutrition[]
    },
    enabled: searchQuery.trim().length > 1,
  })
}

/** Get restaurant count for a specific park */
export function useRestaurantCount(parkId: string | undefined) {
  return useQuery({
    queryKey: ['restaurantCount', parkId],
    queryFn: async (): Promise<number> => {
      if (!parkId) return 0
      const { count, error } = await supabase
        .from('restaurants')
        .select('*', { count: 'exact', head: true })
        .eq('park_id', parkId)
      if (error) throw error
      return count ?? 0
    },
    enabled: !!parkId,
  })
}

/** Get menu item count for a specific park */
export function useMenuItemCount(parkId: string | undefined) {
  return useQuery({
    queryKey: ['menuItemCount', parkId],
    queryFn: async (): Promise<number> => {
      if (!parkId) return 0
      // Nested .eq() on joined tables is silently ignored by Supabase,
      // so fetch restaurant IDs first, then count menu items via .in()
      const { data: restaurants, error: restErr } = await supabase
        .from('restaurants')
        .select('id')
        .eq('park_id', parkId)
      if (restErr) throw restErr
      const restaurantIds = (restaurants || []).map(r => r.id)
      if (restaurantIds.length === 0) return 0
      const { count, error } = await supabase
        .from('menu_items')
        .select('*', { count: 'exact', head: true })
        .in('restaurant_id', restaurantIds)
      if (error) throw error
      return count ?? 0
    },
    enabled: !!parkId,
  })
}

/** Get all restaurants (for counting) */
export function useAllRestaurants() {
  return useQuery({
    queryKey: ['allRestaurants'],
    queryFn: async (): Promise<Restaurant[]> => {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
      if (error) throw error
      return data as Restaurant[]
    },
  })
}

/** Get all menu items count per park */
export function useMenuItemCounts() {
  return useQuery({
    queryKey: ['menuItemCounts'],
    queryFn: async (): Promise<Map<string, number>> => {
      // Fetch all restaurants (lightweight: just id + park_id)
      const { data: restaurants, error: restErr } = await supabase
        .from('restaurants')
        .select('id, park_id')
      if (restErr) throw restErr

      // Group restaurant IDs by park
      const parkRestaurants = new Map<string, string[]>()
      for (const r of restaurants || []) {
        const list = parkRestaurants.get(r.park_id) || []
        list.push(r.id)
        parkRestaurants.set(r.park_id, list)
      }

      // Count menu items per park using head: true (no data transfer)
      const counts = new Map<string, number>()
      for (const [parkId, rIds] of parkRestaurants) {
        const { count, error } = await supabase
          .from('menu_items')
          .select('*', { count: 'exact', head: true })
          .in('restaurant_id', rIds)
        if (error) throw error
        counts.set(parkId, count ?? 0)
      }
      return counts
    },
  })
}
