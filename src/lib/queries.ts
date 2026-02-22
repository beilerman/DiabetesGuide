import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import {
  fetchParksOffline,
  fetchRestaurantsOffline,
  fetchMenuItemsOffline,
  searchMenuItemsOffline,
  fetchAllRestaurantsOffline,
} from './offline-queries'
import { readRestaurantsByPark, readItemsByPark, readAllItems } from './offline-db'
import type { Park, Restaurant, MenuItemWithNutrition } from './types'

export function useParks() {
  return useQuery({
    queryKey: ['parks'],
    queryFn: (): Promise<Park[]> => fetchParksOffline(),
  })
}

export function useRestaurants(parkId: string | undefined) {
  return useQuery({
    queryKey: ['restaurants', parkId],
    queryFn: (): Promise<Restaurant[]> => {
      if (!parkId) return Promise.resolve([])
      return fetchRestaurantsOffline(parkId)
    },
    enabled: !!parkId,
  })
}

export function useMenuItems(parkId?: string) {
  return useQuery({
    queryKey: ['menuItems', parkId],
    queryFn: (): Promise<MenuItemWithNutrition[]> => fetchMenuItemsOffline(parkId),
    enabled: true,
  })
}

export function useSearch(searchQuery: string) {
  return useQuery({
    queryKey: ['search', searchQuery],
    queryFn: (): Promise<MenuItemWithNutrition[]> => {
      if (!searchQuery.trim()) return Promise.resolve([])
      return searchMenuItemsOffline(searchQuery)
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
      try {
        const { count, error } = await supabase
          .from('restaurants')
          .select('*', { count: 'exact', head: true })
          .eq('park_id', parkId)
        if (error) throw error
        return count ?? 0
      } catch {
        const cached = await readRestaurantsByPark(parkId)
        return cached.length
      }
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
      try {
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
      } catch {
        const cached = await readItemsByPark(parkId)
        return cached.length
      }
    },
    enabled: !!parkId,
  })
}

/** Get all restaurants (for counting) */
export function useAllRestaurants() {
  return useQuery({
    queryKey: ['allRestaurants'],
    queryFn: (): Promise<Restaurant[]> => fetchAllRestaurantsOffline(),
  })
}

/** Get all menu items count per park */
export function useMenuItemCounts() {
  return useQuery({
    queryKey: ['menuItemCounts'],
    queryFn: async (): Promise<Map<string, number>> => {
      try {
        const { data: restaurants, error: restErr } = await supabase
          .from('restaurants')
          .select('id, park_id')
        if (restErr) throw restErr

        const parkRestaurants = new Map<string, string[]>()
        for (const r of restaurants || []) {
          const list = parkRestaurants.get(r.park_id) || []
          list.push(r.id)
          parkRestaurants.set(r.park_id, list)
        }

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
      } catch {
        // Offline fallback: count from cached items
        const allItems = await readAllItems()
        const counts = new Map<string, number>()
        for (const item of allItems) {
          const parkId = item.restaurant?.park?.id
          if (parkId) counts.set(parkId, (counts.get(parkId) ?? 0) + 1)
        }
        return counts
      }
    },
  })
}
