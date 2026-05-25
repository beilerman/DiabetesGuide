import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMenuItems, useParks } from '../lib/queries'
import { FilterBar } from '../components/filters/FilterBar'
import { MenuItemCard } from '../components/menu/MenuItemCard'
import { useMealCart } from '../hooks/useMealCart'
import { useFavorites } from '../hooks/useFavorites'
import { useCompare } from '../hooks/useCompare'
import { applyFilters, hasActiveFilters, DEFAULT_FILTERS } from '../lib/filters'
import { dedupeParksForDisplay } from '../lib/park-display'
import { groupMenuItemsByLocation, type ResortLocationGroup, type RestaurantLocationGroup } from '../lib/menu-location-groups'
import {
  DEFAULT_VISIBLE_ITEMS,
  getNextVisibleCount,
  getVisibleItems,
  hasMoreVisibleItems,
} from '../lib/visible-items'
import type { Filters } from '../lib/types'

type BrowseViewMode = 'list' | 'location'

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
  const [viewMode, setViewMode] = useState<BrowseViewMode>('location')
  const [expandedRestaurants, setExpandedRestaurants] = useState<Set<string>>(() => new Set())
  const isLocationView = viewMode === 'location'
  const visibleResetKey = useMemo(
    () => JSON.stringify({ filters, parkId: parkId ?? null, viewMode }),
    [filters, parkId, viewMode],
  )
  const [visibleState, setVisibleState] = useState(() => ({
    count: DEFAULT_VISIBLE_ITEMS,
    key: visibleResetKey,
  }))
  const { data: parks } = useParks()
  const parkOptions = useMemo(() => dedupeParksForDisplay(parks ?? []), [parks])
  const { data: items, isLoading } = useMenuItems(parkId, { dedupe: !isLocationView })
  const { addItem } = useMealCart()
  const { isFavorite, toggle } = useFavorites()
  const { addToCompare } = useCompare()

  const visibleCount = visibleState.key === visibleResetKey ? visibleState.count : DEFAULT_VISIBLE_ITEMS
  const filtered = useMemo(() => applyFilters(items ?? [], filters), [items, filters])
  const visibleItems = useMemo(() => getVisibleItems(filtered, visibleCount), [filtered, visibleCount])
  const locationGroups = useMemo(
    () => groupMenuItemsByLocation(filtered, parks ?? []),
    [filtered, parks],
  )

  const totalItems = items?.length ?? 0
  const filteredCount = filtered.length
  const visibleItemCount = visibleItems.length
  const canLoadMore = hasMoreVisibleItems(filteredCount, visibleCount)
  const locationRestaurantCount = useMemo(
    () => locationGroups.reduce(
      (total, resort) => total + resort.categories.reduce(
        (categoryTotal, category) => categoryTotal + category.venues.reduce(
          (venueTotal, venue) => venueTotal + venue.areas.reduce(
            (areaTotal, area) => areaTotal + area.restaurants.length,
            0,
          ),
          0,
        ),
        0,
      ),
      0,
    ),
    [locationGroups],
  )

  const toggleRestaurant = (restaurantId: string) => {
    setExpandedRestaurants(current => {
      const next = new Set(current)
      if (next.has(restaurantId)) {
        next.delete(restaurantId)
      } else {
        next.add(restaurantId)
      }
      return next
    })
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="bg-white border-b border-stone-200 px-4 py-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Browse Menu</h1>
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-sm font-semibold text-amber-900">
            Educational tool only - not medical advice. Nutrition values may be estimated or unavailable.
          </p>
        </div>

        {/* Park selector - horizontal pill buttons */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600 whitespace-nowrap">Park:</span>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              type="button"
              onClick={() => setParkId(undefined)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                parkId === undefined
                  ? 'bg-teal-600 text-white shadow-md'
                  : 'bg-stone-100 text-gray-700 hover:bg-stone-200'
              }`}
            >
              All Parks{parkOptions.length > 0 ? ` (${parkOptions.length})` : ''}
            </button>
            {parkOptions.map(p => (
              <button
                key={p.id}
                type="button"
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

        <div className="mt-4 inline-flex gap-1 bg-stone-100 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'list' ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            List
          </button>
          <button
            type="button"
            onClick={() => setViewMode('location')}
            aria-pressed={viewMode === 'location'}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'location' ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            By Location
          </button>
        </div>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      <div className="px-4 py-4">
        {/* Result count */}
        {!isLoading && totalItems > 0 && (
          <div className="mb-4 text-sm text-gray-600" aria-live="polite">
            {isLocationView ? (
              <>
                Showing <span className="font-semibold text-gray-900">{filteredCount}</span> items
                <span className="text-gray-500"> across {locationRestaurantCount} restaurants</span>
              </>
            ) : (
              <>
                Showing <span className="font-semibold text-gray-900">{visibleItemCount}</span>
                {filteredCount !== visibleItemCount && <> of <span className="font-semibold text-gray-900">{filteredCount}</span></>}
                {' '}items
                {filteredCount !== totalItems && (
                  <span className="text-gray-500"> from {totalItems} loaded</span>
                )}
              </>
            )}
          </div>
        )}

        {isLoading ? (
          <>
            <div className="mb-3 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-600" role="status">
              Loading menu items and restaurant groups...
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </>
        ) : isLocationView ? (
          filtered.length === 0 ? (
            <div className="grid grid-cols-1">
              <EmptyState hasFilters={hasActiveFilters(filters)} />
            </div>
          ) : (
            <LocationBrowseView
              groups={locationGroups}
              expandedRestaurants={expandedRestaurants}
              onToggleRestaurant={toggleRestaurant}
              onAddToMeal={addItem}
              isFavorite={isFavorite}
              onToggleFavorite={toggle}
              onCompare={addToCompare}
            />
          )
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleItems.map(item => (
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
            {canLoadMore && (
              <div className="py-6 flex justify-center">
                <button
                  onClick={() => setVisibleState({
                    count: getNextVisibleCount(visibleCount, filteredCount),
                    key: visibleResetKey,
                  })}
                  className="px-5 py-2.5 rounded-xl bg-white border border-stone-300 text-sm font-semibold text-stone-700 hover:bg-stone-50 hover:border-teal-300 transition-colors"
                >
                  Load more items
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function LocationBrowseView({
  groups,
  expandedRestaurants,
  onToggleRestaurant,
  onAddToMeal,
  isFavorite,
  onToggleFavorite,
  onCompare,
}: {
  groups: ResortLocationGroup[]
  expandedRestaurants: Set<string>
  onToggleRestaurant: (restaurantId: string) => void
  onAddToMeal: Parameters<typeof MenuItemCard>[0]['onAddToMeal']
  isFavorite: (id: string) => boolean
  onToggleFavorite: (id: string) => void
  onCompare: Parameters<typeof MenuItemCard>[0]['onCompare']
}) {
  return (
    <div className="space-y-8">
      {groups.map(group => (
        <section key={group.id} aria-labelledby={`location-group-${group.id}`}>
          <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-stone-200 pb-2">
            <h2 id={`location-group-${group.id}`} className="text-xl font-bold text-stone-900">
              {group.icon && <span className="mr-2">{group.icon}</span>}
              {group.name}
            </h2>
            <span className="text-xs font-medium text-stone-500">{group.itemCount} items</span>
          </div>

          <div className="space-y-7">
            {group.categories.map(category => (
              <section key={category.id} aria-labelledby={`location-category-${group.id}-${category.id}`}>
                <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-stone-100 px-3 py-2">
                  <h3 id={`location-category-${group.id}-${category.id}`} className="text-sm font-bold uppercase tracking-wide text-stone-700">
                    {category.icon && <span className="mr-2">{category.icon}</span>}
                    {category.name}
                  </h3>
                  <span className="text-xs font-medium text-stone-500">
                    {category.venues.length} {category.venues.length === 1 ? 'location' : 'locations'}
                  </span>
                </div>

                <div className="space-y-6">
                  {category.venues.map(venue => (
                    <section key={venue.id} aria-labelledby={`venue-${venue.id}`} className="border-l-2 border-stone-200 pl-3 sm:pl-4">
                      <div className="mb-3 flex items-baseline justify-between gap-3">
                        <h4 id={`venue-${venue.id}`} className="text-base font-semibold text-stone-900">
                          {venue.name}
                        </h4>
                        <span className="text-xs text-stone-500">{venue.itemCount} items</span>
                      </div>

                      <div className="space-y-5">
                        {venue.areas.map(area => (
                          <section key={area.id} aria-labelledby={`area-${area.id}`}>
                            <div className="mb-2 flex items-center gap-2">
                              <span className="h-4 w-1 rounded-full bg-teal-600" />
                              <h5 id={`area-${area.id}`} className="text-sm font-bold uppercase tracking-wide text-stone-700">
                                {area.name}
                              </h5>
                              <span className="text-xs text-stone-400">{area.itemCount}</span>
                            </div>

                            <div className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
                              {area.restaurants.map(restaurant => (
                                <LocationRestaurantSection
                                  key={restaurant.id}
                                  restaurant={restaurant}
                                  expanded={expandedRestaurants.has(restaurant.id)}
                                  onToggle={() => onToggleRestaurant(restaurant.id)}
                                  onAddToMeal={onAddToMeal}
                                  isFavorite={isFavorite}
                                  onToggleFavorite={onToggleFavorite}
                                  onCompare={onCompare}
                                />
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function LocationRestaurantSection({
  restaurant,
  expanded,
  onToggle,
  onAddToMeal,
  isFavorite,
  onToggleFavorite,
  onCompare,
}: {
  restaurant: RestaurantLocationGroup
  expanded: boolean
  onToggle: () => void
  onAddToMeal: Parameters<typeof MenuItemCard>[0]['onAddToMeal']
  isFavorite: (id: string) => boolean
  onToggleFavorite: (id: string) => void
  onCompare: Parameters<typeof MenuItemCard>[0]['onCompare']
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${restaurant.name}, ${restaurant.itemCount} menu items`}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-stone-50"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-stone-900">{restaurant.name}</span>
          <span className="text-xs text-stone-500">{restaurant.itemCount} menu items</span>
        </span>
        <svg
          className={`h-4 w-4 flex-shrink-0 text-stone-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div className="grid grid-cols-1 gap-4 border-t border-stone-100 bg-stone-50 px-3 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {restaurant.items.map(item => (
            <MenuItemCard
              key={item.id}
              item={item}
              onAddToMeal={onAddToMeal}
              isFavorite={isFavorite(item.id)}
              onToggleFavorite={onToggleFavorite}
              onCompare={onCompare}
            />
          ))}
        </div>
      )}
    </div>
  )
}
