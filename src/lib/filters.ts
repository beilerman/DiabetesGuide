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
      (i) => (getNutrition(i)?.carbs ?? 0) <= filters.maxCarbs!,
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
      (getNutrition(a)?.carbs ?? 0) - (getNutrition(b)?.carbs ?? 0),
    carbsDesc: (a, b) =>
      (getNutrition(b)?.carbs ?? 0) - (getNutrition(a)?.carbs ?? 0),
    caloriesAsc: (a, b) =>
      (getNutrition(a)?.calories ?? 0) - (getNutrition(b)?.calories ?? 0),
    caloriesDesc: (a, b) =>
      (getNutrition(b)?.calories ?? 0) - (getNutrition(a)?.calories ?? 0),
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
