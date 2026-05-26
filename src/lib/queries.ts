import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import {
  fetchParksOffline,
  fetchRestaurantsOffline,
  fetchMenuItemsOffline,
  fetchMenuItemsByIdsOffline,
  searchMenuItemsOffline,
  fetchAllRestaurantsOffline,
  fetchMenuItemCountsOffline,
} from './offline-queries'
import { readRestaurantsByPark, readItemsByPark, readAllItems } from './offline-db'
import { readMenuItemCountsCache } from './menu-count-cache'
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

interface UseMenuItemsOptions {
  dedupe?: boolean
}

export function useMenuItems(parkId?: string, options?: UseMenuItemsOptions) {
  const dedupe = options?.dedupe !== false
  return useQuery({
    queryKey: ['menuItems', parkId, dedupe],
    queryFn: (): Promise<MenuItemWithNutrition[]> => fetchMenuItemsOffline(parkId, { dedupe }),
    enabled: true,
  })
}

export function useFavoriteMenuItems(ids: string[]) {
  return useQuery({
    queryKey: ['favoriteMenuItems', ids],
    queryFn: (): Promise<MenuItemWithNutrition[]> => fetchMenuItemsByIdsOffline(ids),
    enabled: ids.length > 0,
  })
}

export function useMenuItem(id: string | undefined) {
  return useQuery({
    queryKey: ['menuItem', id],
    queryFn: async (): Promise<MenuItemWithNutrition | null> => {
      if (!id) return null
      const [item] = await fetchMenuItemsByIdsOffline([id])
      return item ?? null
    },
    enabled: !!id,
  })
}

export function useSearch(searchQuery: string, parkId?: string) {
  const trimmed = searchQuery.trim()
  return useQuery({
    queryKey: ['search', trimmed, parkId ?? null],
    queryFn: (): Promise<MenuItemWithNutrition[]> => {
      if (!trimmed) return Promise.resolve([])
      return searchMenuItemsOffline(trimmed, parkId)
    },
    enabled: trimmed.length > 1,
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
    queryFn: (): Promise<Map<string, number>> => fetchMenuItemCountsOffline(),
    initialData: () => readMenuItemCountsCache(),
  })
}

export function useTotalMenuItemCount() {
  return useQuery({
    queryKey: ['totalMenuItemCount'],
    queryFn: async (): Promise<number> => {
      try {
        const { count, error } = await supabase
          .from('menu_items')
          .select('*', { count: 'exact', head: true })
        if (error) throw error
        return count ?? 0
      } catch {
        const cached = await readAllItems()
        return cached.length
      }
    },
  })
}
