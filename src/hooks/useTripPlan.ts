import { useCallback, useEffect, useState } from 'react'
import type { MealItem, TripPlan, TripDay, TripMealSlot } from '../lib/types'

const STORAGE_KEY = 'dg_trip_plan'
const DEFAULT_MEAL_NAMES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks']

function createMealSlots(mealsPerDay: number): TripMealSlot[] {
  return Array.from({ length: mealsPerDay }, (_, i) => ({
    name: DEFAULT_MEAL_NAMES[i] ?? `Meal ${i + 1}`,
    items: [],
  }))
}

function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function safePositiveInteger(value: unknown, fallback: number): number {
  return Math.max(1, Math.round(safeNumber(value, fallback)))
}

function sanitizeMealItem(raw: unknown): MealItem | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Partial<MealItem>
  if (typeof item.id !== 'string' || typeof item.name !== 'string' || !item.name.trim()) return null
  return {
    id: item.id,
    name: item.name,
    carbs: safeNumber(item.carbs),
    calories: safeNumber(item.calories),
    fat: safeNumber(item.fat),
    protein: safeNumber(item.protein),
    sugar: safeNumber(item.sugar),
    fiber: safeNumber(item.fiber),
    sodium: safeNumber(item.sodium),
    restaurant: typeof item.restaurant === 'string' ? item.restaurant : undefined,
    parkName: typeof item.parkName === 'string' ? item.parkName : undefined,
  }
}

function sanitizeMealSlot(raw: unknown, index: number): TripMealSlot | null {
  if (!raw || typeof raw !== 'object') return null
  const meal = raw as Partial<TripMealSlot>
  const name = typeof meal.name === 'string' && meal.name.trim()
    ? meal.name
    : DEFAULT_MEAL_NAMES[index] ?? `Meal ${index + 1}`
  const rawItems = Array.isArray(meal.items) ? meal.items : []
  return {
    name,
    items: rawItems.map(sanitizeMealItem).filter((item): item is MealItem => item !== null),
  }
}

function sanitizeDay(raw: unknown, mealsPerDay: number): TripDay | null {
  if (!raw || typeof raw !== 'object') return null
  const day = raw as Partial<TripDay>
  const rawMeals = Array.isArray(day.meals) ? day.meals : []
  const meals = rawMeals
    .map((meal, index) => sanitizeMealSlot(meal, index))
    .filter((meal): meal is TripMealSlot => meal !== null)
  return {
    parkId: typeof day.parkId === 'string' ? day.parkId : null,
    meals: meals.length > 0 ? meals : createMealSlots(mealsPerDay),
  }
}

function normalizeStoredTripPlan(input: unknown): TripPlan | null {
  if (!input || typeof input !== 'object') return null
  const plan = input as Partial<TripPlan>
  if (typeof plan.resortId !== 'string' || !plan.resortId.trim()) return null
  if (!Array.isArray(plan.days)) return null

  const mealsPerDay = safePositiveInteger(plan.mealsPerDay, 3)
  const days = plan.days
    .map(day => sanitizeDay(day, mealsPerDay))
    .filter((day): day is TripDay => day !== null)
  if (days.length === 0) return null

  return {
    resortId: plan.resortId,
    days,
    carbGoalPerMeal: Math.max(0, safeNumber(plan.carbGoalPerMeal, 60)),
    mealsPerDay,
  }
}

function readFromStorage(): TripPlan | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return normalizeStoredTripPlan(parsed)
  } catch {
    return null
  }
}

let sharedState: TripPlan | null = readFromStorage()
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function writeToStorage(plan: TripPlan | null) {
  if (typeof window === 'undefined') return
  try {
    if (plan === null) {
      window.localStorage.removeItem(STORAGE_KEY)
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan))
    }
  } catch {
    // Keep the in-memory plan usable even when browser storage is unavailable.
  }
}

function setSharedState(next: TripPlan | null) {
  sharedState = next
  writeToStorage(next)
  notify()
}

export interface DayTotals {
  carbs: number
  calories: number
  protein: number
  fat: number
  sugar: number
  fiber: number
  sodium: number
  itemCount: number
}

function computeDayTotals(day: TripDay): DayTotals {
  const totals: DayTotals = { carbs: 0, calories: 0, protein: 0, fat: 0, sugar: 0, fiber: 0, sodium: 0, itemCount: 0 }
  for (const meal of day.meals) {
    for (const item of meal.items) {
      totals.carbs += safeNumber(item.carbs)
      totals.calories += safeNumber(item.calories)
      totals.protein += safeNumber(item.protein)
      totals.fat += safeNumber(item.fat)
      totals.sugar += safeNumber(item.sugar)
      totals.fiber += safeNumber(item.fiber)
      totals.sodium += safeNumber(item.sodium)
      totals.itemCount++
    }
  }
  return totals
}

export function useTripPlan() {
  const [plan, setPlan] = useState<TripPlan | null>(sharedState)

  useEffect(() => {
    const listener = () => setPlan(sharedState ? { ...sharedState } : null)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  const createPlan = useCallback((resortId: string, numDays: number, mealsPerDay = 3, carbGoalPerMeal = 60) => {
    const days: TripDay[] = Array.from({ length: numDays }, () => ({
      parkId: null,
      meals: createMealSlots(mealsPerDay),
    }))
    setSharedState({ resortId, days, carbGoalPerMeal, mealsPerDay })
  }, [])

  const assignPark = useCallback((dayIndex: number, parkId: string | null) => {
    if (!sharedState) return
    const next = { ...sharedState, days: [...sharedState.days] }
    if (dayIndex < 0 || dayIndex >= next.days.length) return
    next.days[dayIndex] = { ...next.days[dayIndex], parkId }
    setSharedState(next)
  }, [])

  const addItemToSlot = useCallback((dayIndex: number, mealIndex: number, item: MealItem) => {
    if (!sharedState) return
    const next = { ...sharedState, days: [...sharedState.days] }
    const day = next.days[dayIndex]
    if (!day) return
    const meal = day.meals[mealIndex]
    if (!meal) return
    next.days[dayIndex] = {
      ...day,
      meals: day.meals.map((m, i) => i === mealIndex ? { ...m, items: [...m.items, item] } : m),
    }
    setSharedState(next)
  }, [])

  const removeItemFromSlot = useCallback((dayIndex: number, mealIndex: number, itemIndex: number) => {
    if (!sharedState) return
    const next = { ...sharedState, days: [...sharedState.days] }
    const day = next.days[dayIndex]
    if (!day) return
    const meal = day.meals[mealIndex]
    if (!meal) return
    next.days[dayIndex] = {
      ...day,
      meals: day.meals.map((m, i) => i === mealIndex ? { ...m, items: m.items.filter((_, j) => j !== itemIndex) } : m),
    }
    setSharedState(next)
  }, [])

  const updateCarbGoal = useCallback((carbGoalPerMeal: number) => {
    if (!sharedState) return
    setSharedState({ ...sharedState, carbGoalPerMeal })
  }, [])

  const clearPlan = useCallback(() => {
    setSharedState(null)
  }, [])

  const addDay = useCallback(() => {
    if (!sharedState) return
    setSharedState({
      ...sharedState,
      days: [...sharedState.days, { parkId: null, meals: createMealSlots(sharedState.mealsPerDay) }],
    })
  }, [])

  const removeDay = useCallback((dayIndex: number) => {
    if (!sharedState || sharedState.days.length <= 1) return
    setSharedState({
      ...sharedState,
      days: sharedState.days.filter((_, i) => i !== dayIndex),
    })
  }, [])

  // Computed
  const dayTotals = plan?.days.map(computeDayTotals) ?? []
  const tripTotals = dayTotals.reduce(
    (acc, d) => ({
      carbs: acc.carbs + d.carbs,
      calories: acc.calories + d.calories,
      protein: acc.protein + d.protein,
      fat: acc.fat + d.fat,
      sugar: acc.sugar + d.sugar,
      fiber: acc.fiber + d.fiber,
      sodium: acc.sodium + d.sodium,
      itemCount: acc.itemCount + d.itemCount,
    }),
    { carbs: 0, calories: 0, protein: 0, fat: 0, sugar: 0, fiber: 0, sodium: 0, itemCount: 0 }
  )

  return {
    plan,
    hasPlan: plan !== null,
    dayTotals,
    tripTotals,

    createPlan,
    assignPark,
    addItemToSlot,
    removeItemFromSlot,
    updateCarbGoal,
    clearPlan,
    addDay,
    removeDay,
  }
}

export function __resetTripPlanState(state: TripPlan | null = null) {
  listeners.clear()
  sharedState = state
  writeToStorage(sharedState)
}

export function __normalizeStoredTripPlan(raw: unknown) {
  return normalizeStoredTripPlan(raw)
}
