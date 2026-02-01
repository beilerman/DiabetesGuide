import { useState, useCallback, useEffect } from 'react'
import type { MealItem } from '../lib/types'

const STORAGE_KEY = 'dg_meal_cart'

function load(): MealItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch { return [] }
}

export function useMealCart() {
  const [items, setItems] = useState<MealItem[]>(load)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const addItem = useCallback((item: MealItem) => {
    setItems(prev => [...prev, item])
  }, [])

  const removeItem = useCallback((index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index))
  }, [])

  const clear = useCallback(() => setItems([]), [])

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
