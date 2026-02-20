import { useCallback, useEffect, useState } from 'react'
import type { MealItem } from '../lib/types'

const STORAGE_KEY = 'dg_meal_cart'

function readFromStorage(): MealItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as MealItem[]) : []
  } catch {
    return []
  }
}

let sharedItems: MealItem[] = readFromStorage()
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function writeToStorage(items: MealItem[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function setSharedItems(next: MealItem[]) {
  sharedItems = next
  writeToStorage(next)
  notify()
}

export function useMealCart() {
  const [items, setItems] = useState<MealItem[]>(sharedItems)

  useEffect(() => {
    const listener = () => setItems(sharedItems)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const addItem = useCallback((item: MealItem) => {
    setSharedItems([...sharedItems, item])
  }, [])

  const removeItem = useCallback((index: number) => {
    setSharedItems(sharedItems.filter((_, i) => i !== index))
  }, [])

  const clear = useCallback(() => {
    setSharedItems([])
  }, [])

  const totals = items.reduce(
    (acc, i) => ({
      carbs: acc.carbs + i.carbs,
      calories: acc.calories + i.calories,
      fat: acc.fat + i.fat,
    }),
    { carbs: 0, calories: 0, fat: 0 }
  )

  return { items, addItem, removeItem, clear, totals }
}
