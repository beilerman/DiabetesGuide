import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useParks, useMenuItems, useRestaurants } from '../lib/queries'
import { MenuItemCard } from '../components/menu/MenuItemCard'
import { FilterBar } from '../components/filters/FilterBar'
import { GradeBadge } from '../components/menu/GradeBadge'
import { useMealCart } from '../hooks/useMealCart'
import { useFavorites } from '../hooks/useFavorites'
import { applyFilters, hasActiveFilters, DEFAULT_FILTERS } from '../lib/filters'
import { findResortForPark } from '../lib/resort-config'
import { getThemeForResort, DEFAULT_THEME } from '../lib/park-themes'
import { getGradeForItem } from '../lib/grade'
import type { Filters, MenuItemWithNutrition } from '../lib/types'

function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-white shadow-md overflow-hidden animate-pulse">
      <div className="p-4 space-y-3">
        <div className="h-5 bg-stone-200 rounded w-3/4" />
        <div className="h-4 bg-stone-200 rounded w-1/2" />
        <div className="flex gap-2">
          <div className="h-8 bg-stone-200 rounded-full w-20" />
          <div className="h-8 bg-stone-200 rounded-full w-16" />
        </div>
      </div>
    </div>
  )
}

export default function ParkDetail() {
  const { parkId } = useParams<{ parkId: string }>()
  const { data: parks } = useParks()
  const { data: items, isLoading } = useMenuItems(parkId)
  const { data: restaurants } = useRestaurants(parkId)
  const { addItem } = useMealCart()
  const { isFavorite, toggle } = useFavorites()
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS })
  const [viewMode, setViewMode] = useState<'all' | 'byLand'>('all')

  const park = parks?.find(p => p.id === parkId)
  const resort = park ? findResortForPark(park) : undefined
  const theme = resort ? getThemeForResort(resort.id) : DEFAULT_THEME

  const filtered = useMemo(() => applyFilters(items ?? [], filters), [items, filters])

  // Top picks: best-graded items
  const topPicks = useMemo(() => {
    if (!items) return []
    const graded = items
      .map(item => {
        const nd = item.nutritional_data?.[0]
        const { grade, score } = getGradeForItem({
          calories: nd?.calories ?? null,
          carbs: nd?.carbs ?? null,
          fat: nd?.fat ?? null,
          protein: nd?.protein ?? null,
          sugar: nd?.sugar ?? null,
          fiber: nd?.fiber ?? null,
          sodium: nd?.sodium ?? null,
          alcoholGrams: nd?.alcohol_grams ?? null,
        })
        return { item, grade, score }
      })
      .filter(g => g.grade === 'A' || g.grade === 'B')
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 10)
    return graded
  }, [items])

  // Group items by land
  const landGroups = useMemo(() => {
    if (!restaurants || !filtered.length) return new Map<string, MenuItemWithNutrition[]>()
    const groups = new Map<string, MenuItemWithNutrition[]>()
    for (const item of filtered) {
      const rest = restaurants.find(r => r.id === item.restaurant_id)
      const land = rest?.land || 'Other Areas'
      const list = groups.get(land) || []
      list.push(item)
      groups.set(land, list)
    }
    return groups
  }, [filtered, restaurants])

  if (!park && !isLoading) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">🔍</div>
        <h2 className="text-xl font-semibold text-stone-900 mb-2">Park not found</h2>
        <Link to="/" className="text-teal-600 hover:underline">Back to parks</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Park header with themed gradient */}
      <div
        className="relative px-4 py-8 text-white"
        style={{ background: theme.gradient }}
      >
        <Link to="/" className="inline-flex items-center gap-1 text-white/80 hover:text-white text-sm mb-4">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All Parks
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-4xl">{theme.icon}</span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">{park?.name ?? 'Loading...'}</h1>
            {resort && (
              <p className="text-white/70 text-sm mt-0.5">{resort.name} &middot; {resort.location}</p>
            )}
          </div>
        </div>
        {items && (
          <div className="mt-3 flex gap-4 text-sm text-white/80">
            <span>{items.length} menu items</span>
            <span>{restaurants?.length ?? 0} restaurants</span>
          </div>
        )}
      </div>

      {/* Diabetes-Friendly Picks carousel */}
      {topPicks.length > 0 && (
        <div className="px-4 py-4">
          <h2 className="text-lg font-bold text-stone-900 mb-3">Diabetes-Friendly Picks</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {topPicks.map(({ item, grade }) => (
              <div
                key={item.id}
                className="flex-shrink-0 w-52 rounded-xl bg-white border border-stone-200 shadow-sm p-3"
              >
                <div className="flex items-center gap-2 mb-2">
                  <GradeBadge grade={grade} size="sm" themeColor={theme.primary} />
                  <span className="text-sm font-semibold text-stone-900 truncate">{item.name}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-stone-600">
                  <span className="truncate">{item.restaurant?.name}</span>
                  <span className="font-bold text-stone-900">{item.nutritional_data?.[0]?.carbs ?? '?'}g carbs</span>
                </div>
              </div>
            ))}
          </div>
          <Link
            to={`/browse?park=${parkId}&sort=grade`}
            className="inline-block mt-2 text-xs text-teal-600 hover:text-teal-700 font-medium"
          >
            See all A &amp; B rated items →
          </Link>
        </div>
      )}

      {/* Filter bar */}
      <FilterBar filters={filters} onChange={setFilters} />

      {/* View mode toggle */}
      <div className="px-4 pt-2 flex items-center justify-between">
        <div className="text-sm text-stone-600" aria-live="polite">
          {!isLoading && (
            <>
              Showing <span className="font-semibold text-stone-900">{filtered.length}</span>
              {hasActiveFilters(filters) && <> of {items?.length ?? 0}</>} items
            </>
          )}
        </div>
        <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('all')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'all' ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500'}`}
          >
            All
          </button>
          <button
            onClick={() => setViewMode('byLand')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'byLand' ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500'}`}
          >
            By Land
          </button>
        </div>
      </div>

      {/* Items */}
      <div className="px-4 py-4">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : viewMode === 'byLand' ? (
          <div className="space-y-6">
            {[...landGroups.entries()].map(([land, landItems]) => (
              <div key={land}>
                <h3 className="text-lg font-bold text-stone-800 mb-3 flex items-center gap-2">
                  <span
                    className="w-1 h-5 rounded-full"
                    style={{ backgroundColor: theme.primary }}
                  />
                  {land}
                  <span className="text-sm font-normal text-stone-500">({landItems.length})</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {landItems.map(item => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      onAddToMeal={addItem}
                      isFavorite={isFavorite(item.id)}
                      onToggleFavorite={toggle}
                      themeColor={theme.primary}
                    />
                  ))}
                </div>
              </div>
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
                themeColor={theme.primary}
              />
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full text-center py-16">
                <div className="text-5xl mb-4">🍽️</div>
                <h3 className="text-lg font-semibold text-stone-800">No items match your filters</h3>
                <p className="text-stone-600 text-sm mt-1">Try adjusting your filters</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
