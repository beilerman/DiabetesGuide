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
    category: item.category,
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

  const search = filters.search.trim()
  if (search) {
    const q = search.toLowerCase()
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

  // For sorts that depend on derived values (score, nutrition fields), precompute
  // a lookup so we don't recompute O(n log n) times inside the comparator.
  // Array.sort calls the comparator ~n·log₂(n) times; with 9k items that's ~117k
  // computeScore calls instead of the 9k we actually need.
  const sortKey = filters.sort
  if (sortKey === 'grade') {
    const scoreByItem = new Map<string, number | null>()
    for (const item of result) scoreByItem.set(item.id, getItemScore(item))
    result = [...result].sort((a, b) =>
      compareNullableNumber(scoreByItem.get(a.id), scoreByItem.get(b.id), 'desc'),
    )
  } else if (sortKey === 'carbsAsc' || sortKey === 'carbsDesc' ||
             sortKey === 'caloriesAsc' || sortKey === 'caloriesDesc') {
    const field = (sortKey === 'carbsAsc' || sortKey === 'carbsDesc') ? 'carbs' : 'calories'
    const direction = sortKey.endsWith('Asc') ? 'asc' : 'desc'
    const valueByItem = new Map<string, number | null | undefined>()
    for (const item of result) valueByItem.set(item.id, getNutrition(item)?.[field])
    result = [...result].sort((a, b) =>
      compareNullableNumber(valueByItem.get(a.id), valueByItem.get(b.id), direction),
    )
  } else {
    result = [...result].sort((a, b) => a.name.localeCompare(b.name))
  }

  return result
}

export function hasActiveFilters(filters: Filters): boolean {
  return (
    filters.search.trim() !== '' ||
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
