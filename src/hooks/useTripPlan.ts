import { useCallback, useEffect, useState } from 'react'
import type { MealItem, TripPlan, TripDay, TripMealSlot, TripsState } from '../lib/types'
import { STORAGE_KEYS } from '../lib/storage-keys'

const STORAGE_KEY = STORAGE_KEYS.tripPlan
const LEGACY_STORAGE_KEY = STORAGE_KEYS.tripPlanLegacy
const DEFAULT_MEAL_NAMES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks']
const DEFAULT_START_DATE = '2026-01-01'

export interface CreateTripInput {
  name: string
  resortId: string
  startDate: string
  endDate: string
  selectedParkIds: string[]
  mealsPerDay?: number
  carbGoalPerMeal?: number
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

function createMealSlots(mealsPerDay: number): TripMealSlot[] {
  return Array.from({ length: mealsPerDay }, (_, i) => ({
    name: DEFAULT_MEAL_NAMES[i] ?? `Meal ${i + 1}`,
    items: [],
  }))
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `trip-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function normalizeDateRange(start: unknown, end: unknown): { startDate: string; endDate: string } {
  const startDate = isIsoDate(start) ? start : DEFAULT_START_DATE
  const endDate = isIsoDate(end) && end >= startDate ? end : startDate
  return { startDate, endDate }
}

function addDays(date: string, offset: number): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  parsed.setUTCDate(parsed.getUTCDate() + offset)
  return parsed.toISOString().slice(0, 10)
}

function countInclusiveDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime()
  const end = new Date(`${endDate}T00:00:00Z`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1)
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
    nutritionConfidence: typeof item.nutritionConfidence === 'number' ? item.nutritionConfidence : undefined,
    nutritionSource: item.nutritionSource,
    nutritionSourceDetail: typeof item.nutritionSourceDetail === 'string' ? item.nutritionSourceDetail : null,
    nutritionAvailable: typeof item.nutritionAvailable === 'boolean' ? item.nutritionAvailable : undefined,
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

function sanitizeDay(raw: unknown, mealsPerDay: number, fallbackDate: string | null): TripDay | null {
  if (!raw || typeof raw !== 'object') return null
  const day = raw as Partial<TripDay>
  const rawMeals = Array.isArray(day.meals) ? day.meals : []
  const meals = rawMeals
    .map((meal, index) => sanitizeMealSlot(meal, index))
    .filter((meal): meal is TripMealSlot => meal !== null)
  return {
    date: isIsoDate(day.date) ? day.date : fallbackDate,
    parkId: typeof day.parkId === 'string' ? day.parkId : null,
    meals: meals.length > 0 ? meals : createMealSlots(mealsPerDay),
  }
}

function normalizeTripPlan(input: unknown): TripPlan | null {
  if (!input || typeof input !== 'object') return null
  const plan = input as Partial<TripPlan>
  if (typeof plan.resortId !== 'string' || !plan.resortId.trim()) return null
  if (!Array.isArray(plan.days)) return null

  const mealsPerDay = safePositiveInteger(plan.mealsPerDay, 3)
  const { startDate, endDate } = normalizeDateRange(plan.startDate, plan.endDate)
  const expectedDays = countInclusiveDays(startDate, endDate)
  const days = plan.days
    .map((day, index) => sanitizeDay(day, mealsPerDay, addDays(startDate, index)))
    .filter((day): day is TripDay => day !== null)
  if (days.length === 0) return null

  const normalizedDays = days.slice(0, expectedDays)
  while (normalizedDays.length < expectedDays) {
    normalizedDays.push({
      date: addDays(startDate, normalizedDays.length),
      parkId: null,
      meals: createMealSlots(mealsPerDay),
    })
  }

  return {
    id: typeof plan.id === 'string' && plan.id.trim() ? plan.id : createId(),
    name: typeof plan.name === 'string' && plan.name.trim() ? plan.name.trim() : 'Theme Park Trip',
    resortId: plan.resortId,
    startDate,
    endDate,
    selectedParkIds: Array.isArray(plan.selectedParkIds)
      ? plan.selectedParkIds.filter((id): id is string => typeof id === 'string')
      : [],
    days: normalizedDays,
    carbGoalPerMeal: Math.max(0, safeNumber(plan.carbGoalPerMeal, 60)),
    mealsPerDay,
  }
}

function normalizeTripsState(input: unknown): TripsState {
  if (input && typeof input === 'object' && Array.isArray((input as Partial<TripsState>).trips)) {
    const parsed = input as Partial<TripsState>
    const rawTrips = parsed.trips ?? []
    const trips = rawTrips
      .map(normalizeTripPlan)
      .filter((trip): trip is TripPlan => trip !== null)
    const activeTripId = typeof parsed.activeTripId === 'string' && trips.some(trip => trip.id === parsed.activeTripId)
      ? parsed.activeTripId
      : trips[0]?.id ?? null
    return { activeTripId, trips }
  }

  const legacy = normalizeTripPlan(input)
  return legacy ? { activeTripId: legacy.id, trips: [legacy] } : { activeTripId: null, trips: [] }
}

function readFromStorage(): TripsState {
  if (typeof window === 'undefined') return { activeTripId: null, trips: [] }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) return normalizeTripsState(JSON.parse(raw))

    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy) return normalizeTripsState(JSON.parse(legacy))
  } catch {
    return { activeTripId: null, trips: [] }
  }
  return { activeTripId: null, trips: [] }
}

let sharedState: TripsState = readFromStorage()
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function writeToStorage(state: TripsState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    window.localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // Keep the in-memory trip plan usable even when browser storage is unavailable.
  }
}

function setSharedState(next: TripsState) {
  sharedState = next
  writeToStorage(next)
  notify()
}

function activePlanFrom(state: TripsState): TripPlan | null {
  return state.trips.find(trip => trip.id === state.activeTripId) ?? null
}

function updateActivePlan(updater: (plan: TripPlan) => TripPlan) {
  const active = activePlanFrom(sharedState)
  if (!active) return
  setSharedState({
    activeTripId: active.id,
    trips: sharedState.trips.map(trip => trip.id === active.id ? updater(active) : trip),
  })
}

function createPlanFromInput(input: CreateTripInput): TripPlan {
  const { startDate, endDate } = normalizeDateRange(input.startDate, input.endDate)
  const mealsPerDay = safePositiveInteger(input.mealsPerDay, 3)
  const dayCount = countInclusiveDays(startDate, endDate)
  return {
    id: createId(),
    name: input.name.trim() || 'Theme Park Trip',
    resortId: input.resortId,
    startDate,
    endDate,
    selectedParkIds: input.selectedParkIds,
    carbGoalPerMeal: Math.max(0, safeNumber(input.carbGoalPerMeal, 60)),
    mealsPerDay,
    days: Array.from({ length: dayCount }, (_, index) => ({
      date: addDays(startDate, index),
      parkId: input.selectedParkIds[index] ?? null,
      meals: createMealSlots(mealsPerDay),
    })),
  }
}

function createLegacyPlan(resortId: string, numDays: number, mealsPerDay = 3, carbGoalPerMeal = 60): TripPlan {
  const days = Math.max(1, Math.round(numDays))
  return createPlanFromInput({
    name: 'Theme Park Trip',
    resortId,
    startDate: DEFAULT_START_DATE,
    endDate: addDays(DEFAULT_START_DATE, days - 1),
    selectedParkIds: [],
    mealsPerDay,
    carbGoalPerMeal,
  })
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
  const [state, setState] = useState<TripsState>(sharedState)
  const plan = activePlanFrom(state)

  useEffect(() => {
    const listener = () => setState({ ...sharedState, trips: [...sharedState.trips] })
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  const createPlan = useCallback((
    inputOrResort: CreateTripInput | string,
    numDays = 3,
    mealsPerDay = 3,
    carbGoalPerMeal = 60,
  ) => {
    const nextPlan = typeof inputOrResort === 'string'
      ? createLegacyPlan(inputOrResort, numDays, mealsPerDay, carbGoalPerMeal)
      : createPlanFromInput(inputOrResort)
    setSharedState({
      activeTripId: nextPlan.id,
      trips: [nextPlan, ...sharedState.trips.filter(trip => trip.id !== nextPlan.id)],
    })
  }, [])

  const assignPark = useCallback((dayIndex: number, parkId: string | null) => {
    updateActivePlan(active => {
      if (dayIndex < 0 || dayIndex >= active.days.length) return active
      return {
        ...active,
        days: active.days.map((day, index) => index === dayIndex ? { ...day, parkId } : day),
      }
    })
  }, [])

  const addItemToSlot = useCallback((dayIndex: number, mealIndex: number, item: MealItem) => {
    updateActivePlan(active => {
      const day = active.days[dayIndex]
      const meal = day?.meals[mealIndex]
      if (!day || !meal) return active
      return {
        ...active,
        days: active.days.map((currentDay, currentDayIndex) => currentDayIndex === dayIndex
          ? {
              ...currentDay,
              meals: currentDay.meals.map((currentMeal, currentMealIndex) => currentMealIndex === mealIndex
                ? { ...currentMeal, items: [...currentMeal.items, item] }
                : currentMeal
              ),
            }
          : currentDay
        ),
      }
    })
  }, [])

  const removeItemFromSlot = useCallback((dayIndex: number, mealIndex: number, itemIndex: number) => {
    updateActivePlan(active => {
      const day = active.days[dayIndex]
      const meal = day?.meals[mealIndex]
      if (!day || !meal) return active
      return {
        ...active,
        days: active.days.map((currentDay, currentDayIndex) => currentDayIndex === dayIndex
          ? {
              ...currentDay,
              meals: currentDay.meals.map((currentMeal, currentMealIndex) => currentMealIndex === mealIndex
                ? { ...currentMeal, items: currentMeal.items.filter((_, index) => index !== itemIndex) }
                : currentMeal
              ),
            }
          : currentDay
        ),
      }
    })
  }, [])

  const updateCarbGoal = useCallback((carbGoalPerMeal: number) => {
    updateActivePlan(active => ({ ...active, carbGoalPerMeal }))
  }, [])

  const clearPlan = useCallback(() => {
    const active = activePlanFrom(sharedState)
    if (!active) return
    const trips = sharedState.trips.filter(trip => trip.id !== active.id)
    setSharedState({ activeTripId: trips[0]?.id ?? null, trips })
  }, [])

  const addDay = useCallback(() => {
    updateActivePlan(active => {
      const nextDate = addDays(active.endDate, 1)
      return {
        ...active,
        endDate: nextDate,
        days: [...active.days, { date: nextDate, parkId: null, meals: createMealSlots(active.mealsPerDay) }],
      }
    })
  }, [])

  const removeDay = useCallback((dayIndex: number) => {
    updateActivePlan(active => {
      if (active.days.length <= 1) return active
      const days = active.days.filter((_, index) => index !== dayIndex)
      return {
        ...active,
        startDate: days[0]?.date ?? active.startDate,
        endDate: days[days.length - 1]?.date ?? active.endDate,
        days,
      }
    })
  }, [])

  const exportTrips = useCallback(() => JSON.stringify(sharedState, null, 2), [])

  const importTrips = useCallback((json: string): { ok: boolean; error?: string } => {
    try {
      const parsed = JSON.parse(json)
      const next = normalizeTripsState(parsed)
      if (next.trips.length === 0) return { ok: false, error: 'No trips found in backup.' }
      setSharedState(next)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Backup JSON could not be parsed.' }
    }
  }, [])

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
    trips: state.trips,
    activeTripId: state.activeTripId,
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
    exportTrips,
    importTrips,
  }
}

export function __resetTripPlanState(state: unknown = null) {
  listeners.clear()
  sharedState = state === null
    ? { activeTripId: null, trips: [] }
    : normalizeTripsState(state)
  writeToStorage(sharedState)
}

export function __normalizeStoredTripPlan(raw: unknown) {
  return normalizeTripPlan(raw)
}
