import { useCallback, useEffect, useState } from 'react'
import type { MealItem, MealData, MealCartState } from '../lib/types'

const STORAGE_KEY = 'dg_meal_cart'

function defaultMeal(name = 'My Meal'): MealData {
  return { name, parkId: null, items: [] }
}

function defaultState(): MealCartState {
  const id = crypto.randomUUID()
  return { activeMealId: id, meals: { [id]: defaultMeal() } }
}

function readFromStorage(): MealCartState {
  if (typeof window === 'undefined') return defaultState()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw)
    // Migrate from old format (plain MealItem array) to new MealCartState
    if (Array.isArray(parsed)) {
      const state = defaultState()
      const meal = state.meals[state.activeMealId]
      meal.items = (parsed as MealItem[]).map(item => ({
        ...item,
        protein: item.protein ?? 0,
        sugar: item.sugar ?? 0,
        fiber: item.fiber ?? 0,
        sodium: item.sodium ?? 0,
      }))
      return state
    }
    // Validate shape
    if (parsed.activeMealId && parsed.meals) {
      return parsed as MealCartState
    }
    return defaultState()
  } catch {
    return defaultState()
  }
}

let sharedState: MealCartState = readFromStorage()
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function writeToStorage(state: MealCartState) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function setSharedState(next: MealCartState) {
  sharedState = next
  writeToStorage(next)
  notify()
}

export interface MealTotals {
  carbs: number
  calories: number
  fat: number
  protein: number
  sugar: number
  fiber: number
  sodium: number
}

function computeTotals(items: MealItem[]): MealTotals {
  return items.reduce(
    (acc, i) => ({
      carbs: acc.carbs + i.carbs,
      calories: acc.calories + i.calories,
      fat: acc.fat + i.fat,
      protein: acc.protein + (i.protein ?? 0),
      sugar: acc.sugar + (i.sugar ?? 0),
      fiber: acc.fiber + (i.fiber ?? 0),
      sodium: acc.sodium + (i.sodium ?? 0),
    }),
    { carbs: 0, calories: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0 }
  )
}

export function useMealCart() {
  const [state, setState] = useState<MealCartState>(sharedState)

  useEffect(() => {
    const listener = () => setState({ ...sharedState })
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  const activeMeal = state.meals[state.activeMealId] ?? defaultMeal()
  const items = activeMeal.items
  const totals = computeTotals(items)

  // Count all items across all meals (for badge)
  const totalItemCount = Object.values(state.meals).reduce((sum, m) => sum + m.items.length, 0)

  const addItem = useCallback((item: MealItem) => {
    const s = { ...sharedState }
    const meal = s.meals[s.activeMealId]
    if (!meal) return
    s.meals = { ...s.meals, [s.activeMealId]: { ...meal, items: [...meal.items, item] } }
    setSharedState(s)
  }, [])

  const removeItem = useCallback((index: number) => {
    const s = { ...sharedState }
    const meal = s.meals[s.activeMealId]
    if (!meal) return
    s.meals = { ...s.meals, [s.activeMealId]: { ...meal, items: meal.items.filter((_, i) => i !== index) } }
    setSharedState(s)
  }, [])

  const clear = useCallback(() => {
    const s = { ...sharedState }
    const meal = s.meals[s.activeMealId]
    if (!meal) return
    s.meals = { ...s.meals, [s.activeMealId]: { ...meal, items: [] } }
    setSharedState(s)
  }, [])

  const createMeal = useCallback((name: string, parkId: string | null = null) => {
    const id = crypto.randomUUID()
    const s = { ...sharedState }
    s.meals = { ...s.meals, [id]: { name, parkId, items: [] } }
    s.activeMealId = id
    setSharedState(s)
    return id
  }, [])

  const switchMeal = useCallback((id: string) => {
    if (!sharedState.meals[id]) return
    setSharedState({ ...sharedState, activeMealId: id })
  }, [])

  const deleteMeal = useCallback((id: string) => {
    const s = { ...sharedState }
    const mealIds = Object.keys(s.meals)
    if (mealIds.length <= 1) {
      // Don't delete the last meal — just clear it
      s.meals = { ...s.meals, [id]: { ...s.meals[id], items: [] } }
      setSharedState(s)
      return
    }
    const { [id]: _, ...rest } = s.meals
    s.meals = rest
    if (s.activeMealId === id) {
      s.activeMealId = Object.keys(rest)[0]
    }
    setSharedState(s)
  }, [])

  const renameMeal = useCallback((id: string, name: string) => {
    const s = { ...sharedState }
    const meal = s.meals[id]
    if (!meal) return
    s.meals = { ...s.meals, [id]: { ...meal, name } }
    setSharedState(s)
  }, [])

  return {
    // Active meal
    items,
    totals,
    activeMealId: state.activeMealId,
    activeMealName: activeMeal.name,
    activeMealParkId: activeMeal.parkId,

    // All meals
    meals: state.meals,
    mealIds: Object.keys(state.meals),
    totalItemCount,

    // Item operations (on active meal)
    addItem,
    removeItem,
    clear,

    // Meal management
    createMeal,
    switchMeal,
    deleteMeal,
    renameMeal,
  }
}
