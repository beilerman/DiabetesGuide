// src/pages/VenueMenu.tsx
import { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useCatalogPreview, useParks, useMenuItems, useRestaurants } from '../lib/queries'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { RestaurantGroup } from '../components/menu/RestaurantGroup'
import { FilterBar } from '../components/filters/FilterBar'
import { useMealCart } from '../hooks/useMealCart'
import { useFavorites } from '../hooks/useFavorites'
import { getParkEmoji } from '../components/resort/park-emoji'
import { getResortById } from '../lib/resort-config'
import { catalogPreviewParkToPark, findCatalogPreviewPark } from '../lib/catalog-preview'
import { applyFilters, DEFAULT_FILTERS } from '../lib/filters'
import type { Filters, MenuItemWithNutrition } from '../lib/types'

export default function VenueMenu() {
  const { resortId, categoryId, parkId } = useParams<{
    resortId: string; categoryId: string; parkId: string
  }>()
  const resort = getResortById(resortId || '')
  const category = resort?.categories.find(c => c.id === categoryId)
  const { data: parks } = useParks()
  const { data: catalogPreview } = useCatalogPreview()
  const previewPark = catalogPreview ? findCatalogPreviewPark(catalogPreview, parkId) : undefined
  const livePark = parks?.find(p => p.id === parkId) ??
    (previewPark && catalogPreview
      ? parks?.find(p => findCatalogPreviewPark(catalogPreview, p.name)?.id === previewPark.id)
      : undefined)
  const park = livePark ?? (previewPark ? catalogPreviewParkToPark(previewPark) : undefined)
  const resolvedParkId = livePark?.id
  const { data: items, isLoading } = useMenuItems(resolvedParkId, { enabled: Boolean(resolvedParkId) })
  const { data: restaurants } = useRestaurants(resolvedParkId)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const { addItem } = useMealCart()
  const { isFavorite, toggle } = useFavorites()
  const isSeasonalCategory = !!category?.seasonalFilter
  const isWaitingForLivePark = Boolean(previewPark && !livePark)

  const filtered = useMemo(() => {
    const base = applyFilters(items ?? [], filters)
    return isSeasonalCategory ? base.filter(item => item.is_seasonal) : base
  }, [items, filters, isSeasonalCategory])
  const displayedItemCount = isWaitingForLivePark ? previewPark?.itemCount ?? 0 : filtered.length

  // Group filtered items by restaurant
  const groupedByRestaurant = useMemo(() => {
    const groups: Map<string, { key: string; name: string; land: string | null; items: MenuItemWithNutrition[] }> = new Map()
    for (const item of filtered) {
      const rKey = item.restaurant?.id || item.restaurant?.name || 'unknown'
      const rName = item.restaurant?.name || 'Unknown'
      const rLand = item.restaurant?.land || null
      if (!groups.has(rKey)) {
        groups.set(rKey, { key: rKey, name: rName, land: rLand, items: [] })
      }
      groups.get(rKey)!.items.push(item)
    }
    return [...groups.values()]
  }, [filtered])

  if (!resort || !category || !park) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">🍽️</div>
        <h2 className="text-xl font-semibold text-stone-900 mb-2">Venue not found</h2>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: 'Home', to: '/' },
          { label: resort.name, to: `/resort/${resort.id}` },
          { label: category.label, to: `/resort/${resort.id}/${category.id}` },
          { label: park.name },
        ]}
        accentColor={resort.theme.primary}
      />

      {/* Venue header */}
      <div className="flex items-center gap-3">
        <span className="text-4xl">{getParkEmoji(park.name)}</span>
        <div>
          <h1 className="text-2xl font-bold text-stone-900">{park.name}</h1>
          <p className="text-sm text-stone-600">
            {restaurants?.length ?? previewPark?.restaurantCount ?? 0} restaurants · {displayedItemCount} items
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar filters={filters} onChange={setFilters} />

      {/* Restaurant groups */}
      {isLoading || isWaitingForLivePark ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-white shadow-sm p-6 animate-pulse">
              <div className="h-5 bg-stone-200 rounded w-1/3 mb-2" />
              <div className="h-4 bg-stone-200 rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByRestaurant.map((group, i) => (
            <RestaurantGroup
              key={group.key}
              restaurantName={group.name}
              land={group.land}
              items={group.items}
              defaultExpanded={i === 0}
              accentColor={resort.theme.primary}
              onAddToMeal={addItem}
              isFavorite={isFavorite}
              onToggleFavorite={toggle}
            />
          ))}
          {groupedByRestaurant.length === 0 && (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">🍽️</div>
              <h3 className="text-lg font-semibold text-stone-800">No items match your filters</h3>
              <p className="text-stone-600 mt-1">Try adjusting your filters or search terms.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
