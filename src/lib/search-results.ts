import { applyFilters } from './filters'
import { buildSearchIndex, searchItems } from './search-index'
import type { Filters, MenuItemWithNutrition } from './types'

export interface SearchResultView {
  totalMatches: number
  visibleItems: MenuItemWithNutrition[]
  hasMore: boolean
}

type SearchFilters = Pick<Filters, 'maxCarbs' | 'category' | 'gradeFilter' | 'allergenFree' | 'sort'>

function toFilters(filters: SearchFilters): Filters {
  return {
    search: '',
    maxCarbs: filters.maxCarbs,
    category: filters.category,
    vegetarianOnly: false,
    hideFried: false,
    hideDrinks: false,
    hideAlcohol: false,
    gradeFilter: filters.gradeFilter,
    allergenFree: filters.allergenFree,
    sort: filters.sort,
  }
}

export function getSearchResultView(
  items: MenuItemWithNutrition[],
  query: string,
  filters: SearchFilters,
  visibleCount: number,
): SearchResultView {
  const trimmed = query.trim()
  if (trimmed.length < 2) {
    return { totalMatches: 0, visibleItems: [], hasMore: false }
  }

  const index = buildSearchIndex(items)
  const fuzzyMatches = searchItems(index, trimmed, Math.max(items.length, visibleCount))
  const filtered = applyFilters(fuzzyMatches, toFilters(filters))

  return {
    totalMatches: filtered.length,
    visibleItems: filtered.slice(0, visibleCount),
    hasMore: filtered.length > visibleCount,
  }
}
