import { applyFilters } from './filters'
import { buildSearchIndex, searchItemMatches, type SearchItemMatch } from './search-index'
import type { Filters, MenuItemWithNutrition } from './types'

export type SearchSort = 'relevance' | Filters['sort']

export interface SearchResultView {
  totalMatches: number
  visibleMatches: SearchItemMatch[]
  visibleItems: MenuItemWithNutrition[]
  hasMore: boolean
  strongMatchCount: number
  weakMatchCount: number
}

type SearchFilters = Pick<Filters, 'maxCarbs' | 'category' | 'gradeFilter' | 'allergenFree'> & {
  sort: SearchSort
}

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
    sort: filters.sort === 'relevance' ? 'name' : filters.sort,
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
    return {
      totalMatches: 0,
      visibleMatches: [],
      visibleItems: [],
      hasMore: false,
      strongMatchCount: 0,
      weakMatchCount: 0,
    }
  }

  const index = buildSearchIndex(items)
  const rankedMatches = searchItemMatches(index, trimmed, Math.max(items.length, visibleCount))
  const sortedFilteredItems = applyFilters(rankedMatches.map(match => match.item), toFilters(filters))
  const allowedIds = new Set(sortedFilteredItems.map(item => item.id))
  let filteredMatches = rankedMatches.filter(match => allowedIds.has(match.item.id))

  if (filters.sort !== 'relevance') {
    const sortOrder = new Map(sortedFilteredItems.map((item, index) => [item.id, index]))
    filteredMatches = [...filteredMatches].sort(
      (a, b) => (sortOrder.get(a.item.id) ?? Number.MAX_SAFE_INTEGER) - (sortOrder.get(b.item.id) ?? Number.MAX_SAFE_INTEGER),
    )
  }

  const visibleMatches = filteredMatches.slice(0, visibleCount)

  return {
    totalMatches: filteredMatches.length,
    visibleMatches,
    visibleItems: visibleMatches.map(match => match.item),
    hasMore: filteredMatches.length > visibleCount,
    strongMatchCount: filteredMatches.filter(match => match.tier !== 'weak').length,
    weakMatchCount: filteredMatches.filter(match => match.tier === 'weak').length,
  }
}
