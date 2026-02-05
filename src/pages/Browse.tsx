import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMenuItems, useParks } from '../lib/queries'
import { FilterBar } from '../components/filters/FilterBar'
import { MenuItemCard } from '../components/menu/MenuItemCard'
import { useMealCart } from '../hooks/useMealCart'
import { useFavorites } from '../hooks/useFavorites'
import { applyFilters, hasActiveFilters, DEFAULT_FILTERS } from '../lib/filters'
import type { Filters } from '../lib/types'

function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-white shadow-md overflow-hidden animate-pulse">
      <div className="h-32 bg-gradient-to-br from-stone-200 to-stone-300" />
      <div className="p-4 space-y-3">
        <div className="h-5 bg-stone-200 rounded w-3/4" />
        <div className="h-4 bg-stone-200 rounded w-1/2" />
        <div className="flex gap-2">
          <div className="h-8 bg-stone-200 rounded-full w-20" />
          <div className="h-8 bg-stone-200 rounded-full w-16" />
          <div className="h-8 bg-stone-200 rounded-full w-16" />
        </div>
        <div className="h-10 bg-stone-200 rounded-xl w-full" />
      </div>
    </div>
  )
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-16 px-4">
      <div className="text-6xl mb-4">🍽️</div>
      <h3 className="text-xl font-semibold text-gray-800 mb-2">
        {hasFilters ? 'No items match your filters' : 'No menu items found'}
      </h3>
      <p className="text-gray-600 text-center max-w-md">
        {hasFilters ? (
          <>
            Try adjusting your filters or search terms to find more items.
            <br />
            <span className="text-sm text-teal-600 font-medium">Tip: Start with fewer filters</span>
          </>
        ) : (
          'Select a park to start browsing delicious menu items!'
        )}
      </p>
    </div>
  )
}

export default function Browse() {
  const [searchParams] = useSearchParams()
  const initialSort = (searchParams.get('sort') || 'name') as Filters['sort']
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, sort: initialSort })
  const [parkId, setParkId] = useState<string | undefined>(searchParams.get('park') || undefined)
  const { data: parks } = useParks()
  const { data: items, isLoading, error } = useMenuItems(parkId)
  const { addItem } = useMealCart()
  const { isFavorite, toggle } = useFavorites()

  const filtered = useMemo(() => applyFilters(items ?? [], filters), [items, filters])

  const totalItems = items?.length ?? 0
  const filteredCount = filtered.length

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="bg-white border-b border-stone-200 px-4 py-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Browse Menu</h1>

        {/* Park selector - horizontal pill buttons */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600 whitespace-nowrap">Park:</span>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setParkId(undefined)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                parkId === undefined
                  ? 'bg-teal-600 text-white shadow-md'
                  : 'bg-stone-100 text-gray-700 hover:bg-stone-200'
              }`}
            >
              All Parks
            </button>
            {parks?.map(p => (
              <button
                key={p.id}
                onClick={() => setParkId(p.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  parkId === p.id
                    ? 'bg-teal-600 text-white shadow-md'
                    : 'bg-stone-100 text-gray-700 hover:bg-stone-200'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      <div className="px-4 py-4">
        {/* Result count */}
        {!isLoading && totalItems > 0 && (
          <div className="mb-4 text-sm text-gray-600" aria-live="polite">
            Showing <span className="font-semibold text-gray-900">{filteredCount}</span> of{' '}
            <span className="font-semibold text-gray-900">{totalItems}</span> items
          </div>
        )}

        {error ? (
          <div className="col-span-full text-center py-12 px-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-rose-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-rose-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-stone-900 mb-2">Failed to load menu items</h3>
            <p className="text-stone-600 mb-4">There was an error loading the data. Please try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(item => (
              <MenuItemCard
                key={item.id}
                item={item}
                onAddToMeal={addItem}
                isFavorite={isFavorite(item.id)}
                onToggleFavorite={toggle}
              />
            ))}
            {filtered.length === 0 && <EmptyState hasFilters={hasActiveFilters(filters)} />}
          </div>
        )}
      </div>
    </div>
  )
}
