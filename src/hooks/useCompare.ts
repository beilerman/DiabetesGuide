import { useCallback, useEffect, useState } from 'react'
import type { MenuItemWithNutrition } from '../lib/types'

const STORAGE_KEY = 'dg_compare'
const MAX_ITEMS = 3

/** Slim version stored in localStorage (full MenuItemWithNutrition is too large) */
export interface CompareItem {
  id: string
  name: string
  category: string
  carbs: number
  calories: number
  fat: number
  protein: number
  sugar: number
  fiber: number
  sodium: number
  alcoholGrams: number
  price: number | null
  restaurant: string | null
  parkName: string | null
  isFried: boolean
}

function toCompareItem(item: MenuItemWithNutrition): CompareItem {
  const nd = item.nutritional_data?.[0]
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    carbs: nd?.carbs ?? 0,
    calories: nd?.calories ?? 0,
    fat: nd?.fat ?? 0,
    protein: nd?.protein ?? 0,
    sugar: nd?.sugar ?? 0,
    fiber: nd?.fiber ?? 0,
    sodium: nd?.sodium ?? 0,
    alcoholGrams: nd?.alcohol_grams ?? 0,
    price: item.price,
    restaurant: item.restaurant?.name ?? null,
    parkName: item.restaurant?.park?.name ?? null,
    isFried: item.is_fried,
  }
}

function readFromStorage(): CompareItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CompareItem[]) : []
  } catch {
    return []
  }
}

let sharedItems: CompareItem[] = readFromStorage()
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

function persist(items: CompareItem[]) {
  sharedItems = items
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }
  notify()
}

export function useCompare() {
  const [items, setItems] = useState<CompareItem[]>(sharedItems)

  useEffect(() => {
    const listener = () => setItems([...sharedItems])
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  const addToCompare = useCallback((item: MenuItemWithNutrition) => {
    if (sharedItems.length >= MAX_ITEMS) return
    if (sharedItems.some(i => i.id === item.id)) return
    persist([...sharedItems, toCompareItem(item)])
  }, [])

  const removeFromCompare = useCallback((id: string) => {
    persist(sharedItems.filter(i => i.id !== id))
  }, [])

  const clearCompare = useCallback(() => {
    persist([])
  }, [])

  const isInCompare = useCallback((id: string) => {
    return sharedItems.some(i => i.id === id)
  }, [items])

  return {
    compareItems: items,
    compareCount: items.length,
    isFull: items.length >= MAX_ITEMS,
    addToCompare,
    removeFromCompare,
    clearCompare,
    isInCompare,
  }
}
