import { useDeferredValue, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMenuItems, useParks } from '../lib/queries'
import { dedupeParksForDisplay } from '../lib/park-display'
import { SearchResultRow } from '../components/search/SearchResultRow'
import type { MenuItemWithNutrition } from '../lib/types'
import { MenuItemCard } from '../components/menu/MenuItemCard'
import { useMealCart } from '../hooks/useMealCart'
import { useFavorites } from '../hooks/useFavorites'
import { useCompare } from '../hooks/useCompare'
import { DEFAULT_FILTERS } from '../lib/filters'
import type { Grade } from '../lib/grade'
import { getNextVisibleCount } from '../lib/visible-items'
import { getSearchResultView } from '../lib/search-results'
import type { Filters } from '../lib/types'
import { GradeLegend, GRADE_OPTIONS } from '../components/GradeLegend'

const RECENT_KEY = 'dg_recent_searches'
const MAX_RECENT = 5
const INITIAL_VISIBLE_RESULTS = 50

function getGradeFilterFromParams(searchParams: URLSearchParams): Grade[] | null {
  const requested = new Set(
    (searchParams.get('grade') ?? '')
      .split(',')
      .map(value => value.trim().toUpperCase())
      .filter(Boolean),
  )
  const grades = GRADE_OPTIONS.filter(grade => requested.has(grade))
  return grades.length > 0 ? grades : null
}

function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveRecentSearch(query: string) {
  const recent = getRecentSearches().filter(q => q !== query)
  recent.unshift(query)
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)))
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [parkId, setParkId] = useState<string | undefined>(undefined)
  const [filters, setFilters] = useState<Pick<Filters, 'maxCarbs' | 'category' | 'allergenFree' | 'sort'>>({
    maxCarbs: null,
    category: null,
    allergenFree: [],
    sort: 'name',
  })
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_RESULTS)
  const [expandedItem, setExpandedItem] = useState<MenuItemWithNutrition | null>(null)
  const { addItem } = useMealCart()
  const { isFavorite, toggle } = useFavorites()
  const { addToCompare } = useCompare()
  const [recentSearches, setRecentSearches] = useState(getRecentSearches)
  const { data: parks } = useParks()
  const parkOptions = dedupeParksForDisplay(parks ?? [])
  const { data: menuItems, isLoading: menuItemsLoading } = useMenuItems(parkId)
  const deferredQuery = useDeferredValue(query)
  const gradeFilter = useMemo(() => getGradeFilterFromParams(searchParams), [searchParams])
  const searchFilters = useMemo(
    () => ({ ...filters, gradeFilter }),
    [filters, gradeFilter],
  )
  const isSearching = query.trim().length >= 2
  const isPendingQuery = query !== deferredQuery
  const searchView = useMemo(
    () => getSearchResultView(menuItems ?? [], deferredQuery, searchFilters, visibleCount),
    [menuItems, deferredQuery, searchFilters, visibleCount],
  )
  const results = isSearching ? searchView.visibleItems : null
  const searchLoading = isSearching && (isPendingQuery || (menuItemsLoading && menuItems == null))

  const handleSearch = (q: string) => {
    setQuery(q)
    setExpandedItem(null)
    setVisibleCount(INITIAL_VISIBLE_RESULTS)
    if (q.trim().length > 1) {
      saveRecentSearch(q.trim())
      setRecentSearches(getRecentSearches())
    }
  }

  const updateFilter = <K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) => {
    setFilters(current => ({ ...current, [key]: value }))
    setVisibleCount(INITIAL_VISIBLE_RESULTS)
    setExpandedItem(null)
  }

  const setGradeParam = (grades: Grade[] | null) => {
    const nextParams = new URLSearchParams(searchParams)
    if (grades && grades.length > 0) {
      nextParams.set('grade', grades.join(','))
    } else {
      nextParams.delete('grade')
    }
    setSearchParams(nextParams)
  }

  const toggleGrade = (grade: Grade) => {
    const current = gradeFilter ?? []
    const selected = current.includes(grade)
      ? current.filter(g => g !== grade)
      : [...current, grade]
    const next = GRADE_OPTIONS.filter(option => selected.includes(option))
    const nextFilter = next.length > 0 ? next : null
    setVisibleCount(INITIAL_VISIBLE_RESULTS)
    setExpandedItem(null)
    setGradeParam(nextFilter)
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="bg-white border-b border-stone-200 px-4 py-4">
        <h1 className="text-2xl font-bold text-stone-900 mb-3">Search</h1>

        {/* Search input */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <input
            id="site-search"
            type="text"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search menu items..."
            aria-label="Search all menu items"
            className="w-full pl-10 pr-12 py-3 rounded-xl bg-stone-100 border border-stone-200 text-stone-900 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
          {query && (
            <button
              onClick={() => handleSearch('')}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-stone-500 hover:bg-stone-200 hover:text-stone-700"
              aria-label="Clear search"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Park scope dropdown */}
        <div className="mt-3 flex items-center gap-2" aria-label="Search scope and status">
          <span className="text-xs font-medium text-stone-500">Scope:</span>
          <select
            aria-label="Search park scope"
            value={parkId ?? ''}
            onChange={e => setParkId(e.target.value || undefined)}
            className="text-xs px-2 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 focus:border-teal-500 focus:outline-none"
          >
            <option value="">All Parks{parkOptions.length > 0 ? ` (${parkOptions.length})` : ''}</option>
            {parkOptions.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {searchLoading && (
            <span role="status" className="text-[10px] font-medium text-stone-600">Searching...</span>
          )}
        </div>

        <section aria-label="Search filters" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="text-xs font-medium text-stone-600">
            Max carbs
            <input
              type="number"
              min={0}
              max={250}
              inputMode="decimal"
              value={filters.maxCarbs ?? ''}
              onChange={e => updateFilter('maxCarbs', e.target.value === '' ? null : Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-700 focus:border-teal-500 focus:outline-none"
              placeholder="Any"
            />
          </label>
          <label className="text-xs font-medium text-stone-600">
            Category
            <select
              value={filters.category ?? ''}
              onChange={e => updateFilter('category', (e.target.value || null) as Filters['category'])}
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-700 focus:border-teal-500 focus:outline-none"
            >
              <option value="">All</option>
              <option value="entree">Entree</option>
              <option value="snack">Snack</option>
              <option value="side">Side</option>
              <option value="dessert">Dessert</option>
              <option value="beverage">Beverage</option>
            </select>
          </label>
          <label className="text-xs font-medium text-stone-600">
            Sort
            <select
              value={filters.sort}
              onChange={e => updateFilter('sort', e.target.value as Filters['sort'])}
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-700 focus:border-teal-500 focus:outline-none"
            >
              <option value="name">Name</option>
              <option value="grade">Best grade</option>
              <option value="carbsAsc">Carbs low to high</option>
              <option value="carbsDesc">Carbs high to low</option>
              <option value="caloriesAsc">Calories low to high</option>
              <option value="caloriesDesc">Calories high to low</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setFilters({
                maxCarbs: DEFAULT_FILTERS.maxCarbs,
                category: DEFAULT_FILTERS.category,
                allergenFree: DEFAULT_FILTERS.allergenFree,
                sort: DEFAULT_FILTERS.sort,
              })
              setVisibleCount(INITIAL_VISIBLE_RESULTS)
              setGradeParam(null)
            }}
            className="mt-5 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs font-semibold text-stone-600 hover:border-teal-300 hover:text-teal-700"
          >
            Reset filters
          </button>
        </section>

        <GradeLegend activeGrades={gradeFilter ?? []} onToggle={toggleGrade} />
      </div>

      <section
        id="search-results"
        tabIndex={-1}
        aria-labelledby="search-results-heading"
        className="px-4 py-4 scroll-mt-24"
      >
        <h2 id="search-results-heading" className="sr-only">Search results</h2>
        {/* Expanded item card */}
        {expandedItem && (
          <div className="mb-4">
            <button
              onClick={() => setExpandedItem(null)}
              className="text-xs text-teal-600 hover:text-teal-700 font-medium mb-2 flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back to results
            </button>
            <MenuItemCard
              item={expandedItem}
              onAddToMeal={addItem}
              isFavorite={isFavorite(expandedItem.id)}
              onToggleFavorite={toggle}
              onCompare={addToCompare}
            />
          </div>
        )}

        {/* Search results */}
        {!expandedItem && isSearching && (
          <>
            {results && results.length > 0 ? (
              <div>
                <p className="text-sm text-stone-500 mb-2" aria-live="polite">
                  Showing {results.length} of {searchView.totalMatches} matching result{searchView.totalMatches !== 1 ? 's' : ''}
                </p>
                <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100">
                  {results.map(item => (
                    <SearchResultRow
                      key={item.id}
                      item={item}
                      onClick={setExpandedItem}
                    />
                  ))}
                </div>
                {searchView.hasMore && (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setVisibleCount(count => getNextVisibleCount(count, searchView.totalMatches, INITIAL_VISIBLE_RESULTS))}
                      className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:border-teal-300 hover:text-teal-700"
                    >
                      Load more results
                    </button>
                  </div>
                )}
              </div>
            ) : !searchLoading ? (
              <div className="text-center py-12">
                <div className="text-5xl mb-3">🔍</div>
                <p className="text-stone-600">No results for &ldquo;{query}&rdquo;</p>
                <p className="text-stone-500 text-sm mt-1">Try a different search term or change the park scope</p>
              </div>
            ) : null}
          </>
        )}

        {/* Recent searches + empty state */}
        {!expandedItem && !isSearching && (
          <div>
            {recentSearches.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-stone-600 mb-2">Recent</h3>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map(q => (
                    <button
                      key={q}
                      onClick={() => handleSearch(q)}
                      className="px-3 py-1.5 text-sm bg-white border border-stone-200 rounded-full text-stone-700 hover:bg-stone-50 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="text-center py-8 text-stone-500">
              <svg className="w-12 h-12 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-sm">Search across {parkId ? 'this park' : 'all parks'} for menu items</p>
              <p className="text-xs text-stone-400 mt-1">Try &ldquo;turkey leg&rdquo;, &ldquo;dole whip&rdquo;, or &ldquo;grilled chicken&rdquo;</p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
