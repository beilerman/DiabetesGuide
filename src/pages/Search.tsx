import { useState } from 'react'
import { useSearch } from '../lib/queries'
import { SearchResultRow } from '../components/search/SearchResultRow'
import type { MenuItemWithNutrition } from '../lib/types'
import { MenuItemCard } from '../components/menu/MenuItemCard'
import { useMealCart } from '../hooks/useMealCart'
import { useFavorites } from '../hooks/useFavorites'

const RECENT_KEY = 'dg_recent_searches'
const MAX_RECENT = 5

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
  const [query, setQuery] = useState('')
  const [expandedItem, setExpandedItem] = useState<MenuItemWithNutrition | null>(null)
  const { data: results, isLoading } = useSearch(query)
  const { addItem } = useMealCart()
  const { isFavorite, toggle } = useFavorites()
  const [recentSearches] = useState(getRecentSearches)

  const handleSearch = (q: string) => {
    setQuery(q)
    setExpandedItem(null)
    if (q.trim().length > 1) {
      saveRecentSearch(q.trim())
    }
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="bg-white border-b border-stone-200 px-4 py-4">
        <h1 className="text-2xl font-bold text-stone-900 mb-3">Search</h1>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search menu items..."
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-stone-100 border border-stone-200 text-stone-900 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            autoFocus
          />
          {query && (
            <button
              onClick={() => handleSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-4">
        {/* Expanded item card */}
        {expandedItem && (
          <div className="mb-4">
            <button
              onClick={() => setExpandedItem(null)}
              className="text-xs text-teal-600 hover:text-teal-700 font-medium mb-2"
            >
              ← Back to results
            </button>
            <MenuItemCard
              item={expandedItem}
              onAddToMeal={addItem}
              isFavorite={isFavorite(expandedItem.id)}
              onToggleFavorite={toggle}
            />
          </div>
        )}

        {/* Search results */}
        {!expandedItem && query.trim().length > 1 && (
          <>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-14 bg-stone-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : results && results.length > 0 ? (
              <div>
                <p className="text-sm text-stone-500 mb-2">{results.length} results</p>
                <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100">
                  {results.map(item => (
                    <SearchResultRow
                      key={item.id}
                      item={item}
                      onClick={setExpandedItem}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-5xl mb-3">🔍</div>
                <p className="text-stone-600">No results for "{query}"</p>
                <p className="text-stone-500 text-sm mt-1">Try a different search term</p>
              </div>
            )}
          </>
        )}

        {/* Recent searches + empty state */}
        {!expandedItem && query.trim().length <= 1 && (
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
              <p className="text-sm">Search across all parks for menu items</p>
              <p className="text-xs text-stone-400 mt-1">Try "turkey leg", "dole whip", or "grilled chicken"</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
