import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Park, Restaurant, MenuItemWithNutrition } from './types'

function escapeSearch(q: string): string {
  return q.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&').replace(/[,().'"]/g, '')
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
        .order('land, name')
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
      let query = supabase
        .from('menu_items')
        .select(`
          *,
          nutritional_data (*),
          allergens (*),
          restaurant:restaurants (*, park:parks (*))
        `)
        .order('name')

      if (parkId) {
        query = query.eq('restaurant.park_id', parkId)
      }

      const { data, error } = await query.limit(500)
      if (error) throw error
      return (data as MenuItemWithNutrition[]).filter(
        item => !parkId || item.restaurant?.park_id === parkId
      )
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
        .select(`
          *,
          nutritional_data (*),
          allergens (*),
          restaurant:restaurants (*, park:parks (*))
        `)
        .or(`name.ilike.%${escaped}%,description.ilike.%${escaped}%`)
        .order('name')
        .limit(50)
      if (error) throw error
      return data as MenuItemWithNutrition[]
    },
    enabled: searchQuery.trim().length > 1,
  })
}
