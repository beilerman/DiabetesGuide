import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMenuItems, useParks } from '../lib/queries'
import { FilterBar } from '../components/filters/FilterBar'
import { MenuItemCard } from '../components/menu/MenuItemCard'
import { useMealCart } from '../hooks/useMealCart'
import { useFavorites } from '../hooks/useFavorites'
import { useCompare } from '../hooks/useCompare'
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
  const { data: items, isLoading } = useMenuItems(parkId)
  const { addItem } = useMealCart()
  const { isFavorite, toggle } = useFavorites()
  const { addToCompare } = useCompare()

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

        {isLoading ? (
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
                onCompare={addToCompare}
              />
            ))}
            {filtered.length === 0 && <EmptyState hasFilters={hasActiveFilters(filters)} />}
          </div>
        )}
      </div>
    </div>
  )
}
