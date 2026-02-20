import type { Filters, MenuItemWithNutrition } from './types'
import { getNutrition } from './nutrition'
import { computeScore, computeGrade } from './grade'

export const DEFAULT_FILTERS: Filters = {
  search: '',
  maxCarbs: null,
  category: null,
  vegetarianOnly: false,
  hideFried: false,
  hideDrinks: false,
  hideAlcohol: false,
  gradeFilter: null,
  allergenFree: [],
  sort: 'name',
}

function getItemScore(item: MenuItemWithNutrition): number | null {
  const n = getNutrition(item)
  if (!n) return null
  return computeScore({
    calories: n.calories,
    carbs: n.carbs,
    fat: n.fat,
    protein: n.protein,
    sugar: n.sugar,
    fiber: n.fiber,
    sodium: n.sodium,
    alcoholGrams: n.alcohol_grams,
  })
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

  // New: hide alcohol
  if (filters.hideAlcohol) {
    result = result.filter((i) => {
      const alc = getNutrition(i)?.alcohol_grams
      return alc == null || alc === 0
    })
  }

  // New: grade filter
  if (filters.gradeFilter && filters.gradeFilter.length > 0) {
    result = result.filter((i) => {
      const score = getItemScore(i)
      const grade = computeGrade(score)
      return grade != null && filters.gradeFilter!.includes(grade)
    })
  }

  // New: allergen-free filter
  if (filters.allergenFree.length > 0) {
    result = result.filter((i) => {
      const itemAllergens = i.allergens.map(a => a.allergen_type.toLowerCase())
      return !filters.allergenFree.some(excluded =>
        itemAllergens.includes(excluded.toLowerCase())
      )
    })
  }

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
    grade: (a, b) =>
      compareNullableNumber(getItemScore(a), getItemScore(b), 'desc'),
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
    filters.hideDrinks ||
    filters.hideAlcohol ||
    (filters.gradeFilter != null && filters.gradeFilter.length > 0) ||
    filters.allergenFree.length > 0
  )
}
