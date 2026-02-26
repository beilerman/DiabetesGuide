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

function safeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function sanitizeMealItem(raw: unknown): MealItem | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Partial<MealItem>
  if (typeof item.id !== 'string' || typeof item.name !== 'string' || !item.name.trim()) return null
  const carbs = safeNumber(item.carbs)
  const calories = safeNumber(item.calories)
  const fat = safeNumber(item.fat)
  return {
    id: item.id,
    name: item.name,
    carbs,
    calories,
    fat,
    protein: safeNumber(item.protein),
    sugar: safeNumber(item.sugar),
    fiber: safeNumber(item.fiber),
    sodium: safeNumber(item.sodium),
    restaurant: typeof item.restaurant === 'string' ? item.restaurant : undefined,
    parkName: typeof item.parkName === 'string' ? item.parkName : undefined,
  }
}

function sanitizeMeal(raw: unknown): MealData | null {
  if (!raw || typeof raw !== 'object') return null
  const meal = raw as Partial<MealData>
  const name = typeof meal.name === 'string' && meal.name.trim() ? meal.name : 'My Meal'
  const parkId = typeof meal.parkId === 'string' ? meal.parkId : null
  const rawItems = Array.isArray(meal.items) ? meal.items : []
  const items = rawItems.map(sanitizeMealItem).filter((i): i is MealItem => i !== null)
  return { name, parkId, items }
}

function normalizeStoredState(input: unknown): MealCartState | null {
  if (Array.isArray(input)) {
    const state = defaultState()
    const meal = state.meals[state.activeMealId]
    meal.items = input.map(sanitizeMealItem).filter((i): i is MealItem => i !== null)
    return state
  }

  if (input && typeof input === 'object') {
    const parsed = input as Partial<MealCartState> & { meals?: Record<string, unknown> }
    if (parsed.meals && typeof parsed.meals === 'object') {
      const meals: Record<string, MealData> = {}
      for (const [id, mealData] of Object.entries(parsed.meals)) {
        const sanitized = sanitizeMeal(mealData)
        if (sanitized) meals[id] = sanitized
      }
      const mealIds = Object.keys(meals)
      if (mealIds.length === 0) return null
      const active = typeof parsed.activeMealId === 'string' && meals[parsed.activeMealId]
        ? parsed.activeMealId
        : mealIds[0]
      return { activeMealId: active, meals }
    }
  }

  return null
}

function readFromStorage(): MealCartState {
  if (typeof window === 'undefined') return defaultState()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw)
    const normalized = normalizeStoredState(parsed)
    return normalized ?? defaultState()
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
    const safeName = name.trim() ? name : 'My Meal'
    const safeParkId = typeof parkId === 'string' ? parkId : null
    s.meals = { ...s.meals, [id]: { name: safeName, parkId: safeParkId, items: [] } }
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
    if (!s.meals[id]) return
    const mealIds = Object.keys(s.meals)
    if (mealIds.length <= 1) {
      // Don't delete the last meal -- just clear it
      s.meals = { ...s.meals, [id]: { ...s.meals[id], items: [] } }
      setSharedState(s)
      return
    }
    const rest = { ...s.meals }
    delete rest[id]
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
    const nextName = name.trim() ? name : meal.name
    s.meals = { ...s.meals, [id]: { ...meal, name: nextName } }
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

export function __resetMealCartState(state?: MealCartState) {
  listeners.clear()
  sharedState = state ?? defaultState()
  writeToStorage(sharedState)
}

export function __normalizeStoredMealCart(raw: unknown) {
  return normalizeStoredState(raw)
}
