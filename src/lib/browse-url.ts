import { DEFAULT_FILTERS } from './filters'
import type { Filters } from './types'
import type { Grade } from './grade'

export type BrowsePreset = 'low-carb' | 'top-rated' | 'gluten-free' | 'vegetarian' | 'no-fried'

const VALID_SORTS: Filters['sort'][] = ['name', 'carbsAsc', 'carbsDesc', 'caloriesAsc', 'caloriesDesc', 'grade']
const VALID_GRADES: Grade[] = ['A', 'B', 'C', 'D', 'F']

function appendListParam(params: URLSearchParams, key: string, values: string[]) {
  if (values.length > 0) params.set(key, values.join(','))
}

export function buildBrowsePresetUrl(preset: BrowsePreset): string {
  const params = new URLSearchParams()

  if (preset === 'low-carb') {
    params.set('maxCarbs', '30')
    params.set('sort', 'carbsAsc')
  }
  if (preset === 'top-rated') {
    params.set('grade', 'A,B')
    params.set('sort', 'grade')
  }
  if (preset === 'gluten-free') {
    params.set('allergenFree', 'wheat')
    params.set('sort', 'name')
  }
  if (preset === 'vegetarian') {
    params.set('vegetarianOnly', 'true')
    params.set('sort', 'name')
  }
  if (preset === 'no-fried') {
    params.set('hideFried', 'true')
    params.set('sort', 'grade')
  }

  return `/browse?${params.toString()}`
}

export function getInitialBrowseFilters(searchParams: URLSearchParams): Filters {
  const rawMaxCarbs = searchParams.get('maxCarbs')
  const maxCarbs = rawMaxCarbs == null ? Number.NaN : Number(rawMaxCarbs)
  const requestedSort = searchParams.get('sort') as Filters['sort'] | null
  const gradeFilter = (searchParams.get('grade') ?? '')
    .split(',')
    .filter((grade): grade is Grade => VALID_GRADES.includes(grade as Grade))
  const allergenFree = (searchParams.get('allergenFree') ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  return {
    ...DEFAULT_FILTERS,
    search: searchParams.get('search') ?? DEFAULT_FILTERS.search,
    maxCarbs: Number.isFinite(maxCarbs) && maxCarbs >= 0 ? maxCarbs : DEFAULT_FILTERS.maxCarbs,
    category: (searchParams.get('category') as Filters['category']) || DEFAULT_FILTERS.category,
    vegetarianOnly: searchParams.get('vegetarianOnly') === 'true',
    hideFried: searchParams.get('hideFried') === 'true',
    hideDrinks: searchParams.get('hideDrinks') === 'true',
    hideAlcohol: searchParams.get('hideAlcohol') === 'true',
    gradeFilter: gradeFilter.length > 0 ? gradeFilter : DEFAULT_FILTERS.gradeFilter,
    allergenFree,
    sort: requestedSort && VALID_SORTS.includes(requestedSort) ? requestedSort : DEFAULT_FILTERS.sort,
  }
}

export function buildBrowseUrl(filters: Partial<Filters>): string {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.maxCarbs != null) params.set('maxCarbs', String(filters.maxCarbs))
  if (filters.category) params.set('category', filters.category)
  if (filters.vegetarianOnly) params.set('vegetarianOnly', 'true')
  if (filters.hideFried) params.set('hideFried', 'true')
  if (filters.hideDrinks) params.set('hideDrinks', 'true')
  if (filters.hideAlcohol) params.set('hideAlcohol', 'true')
  appendListParam(params, 'grade', filters.gradeFilter ?? [])
  appendListParam(params, 'allergenFree', filters.allergenFree ?? [])
  if (filters.sort) params.set('sort', filters.sort)

  const query = params.toString()
  return query ? `/browse?${query}` : '/browse'
}
