import type { Filters, MenuItemWithNutrition } from './types'
import { getNutrition } from './nutrition'

export const DEFAULT_FILTERS: Filters = {
  search: '',
  maxCarbs: null,
  category: null,
  vegetarianOnly: false,
  hideFried: false,
  hideDrinks: false,
  sort: 'name',
}

export function applyFilters(
  items: MenuItemWithNutrition[],
  filters: Filters,
): MenuItemWithNutrition[] {
  let result = items

  const compareNullableNumber = (
    a: number | null | undefined,
    b: number | null | undefined,
    direction: 'asc' | 'desc',
  ): number => {
    const aMissing = a == null
    const bMissing = b == null
    if (aMissing && bMissing) return 0
    if (aMissing) return 1
    if (bMissing) return -1
    return direction === 'asc' ? a - b : b - a
  }

  if (filters.search) {
    const q = filters.search.toLowerCase()
    result = result.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q) ||
        i.restaurant?.name.toLowerCase().includes(q),
    )
  }
  if (filters.maxCarbs != null) {
    result = result.filter(
      (i) => {
        const carbs = getNutrition(i)?.carbs
        return carbs != null && carbs <= filters.maxCarbs!
      },
    )
  }
  if (filters.category) {
    result = result.filter((i) => i.category === filters.category)
  }
  if (filters.vegetarianOnly) result = result.filter((i) => i.is_vegetarian)
  if (filters.hideFried) result = result.filter((i) => !i.is_fried)
  if (filters.hideDrinks) result = result.filter((i) => i.category !== 'beverage')

  const sortFns: Record<
    string,
    (a: MenuItemWithNutrition, b: MenuItemWithNutrition) => number
  > = {
    name: (a, b) => a.name.localeCompare(b.name),
    carbsAsc: (a, b) =>
      compareNullableNumber(getNutrition(a)?.carbs, getNutrition(b)?.carbs, 'asc'),
    carbsDesc: (a, b) =>
      compareNullableNumber(getNutrition(a)?.carbs, getNutrition(b)?.carbs, 'desc'),
    caloriesAsc: (a, b) =>
      compareNullableNumber(getNutrition(a)?.calories, getNutrition(b)?.calories, 'asc'),
    caloriesDesc: (a, b) =>
      compareNullableNumber(getNutrition(a)?.calories, getNutrition(b)?.calories, 'desc'),
  }
  result = [...result].sort(sortFns[filters.sort] || sortFns.name)

  return result
}

export function hasActiveFilters(filters: Filters): boolean {
  return (
    filters.search !== '' ||
    filters.maxCarbs != null ||
    filters.category != null ||
    filters.vegetarianOnly ||
    filters.hideFried ||
    filters.hideDrinks
  )
}
