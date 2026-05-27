// src/pages/VenueList.tsx
import { useParams } from 'react-router-dom'
import { useCatalogPreview, useParks, useRestaurants, useMenuItemCount } from '../lib/queries'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { VenueCard, VenueCardCountsError, VenueCardSkeleton } from '../components/resort/VenueCard'
import { getResortById, getParksForCategory } from '../lib/resort-config'
import { getCatalogPreviewVenues, findCatalogPreviewPark } from '../lib/catalog-preview'
import type { ResortTheme } from '../lib/resort-config'
import type { CatalogPreviewPark } from '../lib/catalog-preview'
import type { Park } from '../lib/types'

export default function VenueList() {
  const { resortId, categoryId } = useParams<{ resortId: string; categoryId: string }>()
  const resort = getResortById(resortId || '')
  const category = resort?.categories.find(c => c.id === categoryId)
  const { data: allParks, isLoading, error } = useParks()
  const { data: catalogPreview } = useCatalogPreview()

  const categoryParks = (allParks && resort && categoryId)
    ? getParksForCategory(allParks, resort, categoryId)
    : []
  const previewVenues = (catalogPreview && resort && categoryId)
    ? getCatalogPreviewVenues(catalogPreview, resort.id, categoryId)
    : []
  const venueSummaries = categoryParks.length > 0
    ? categoryParks.map(park => ({
      kind: 'live' as const,
      park,
      preview: catalogPreview ? findCatalogPreviewPark(catalogPreview, park.name) : undefined,
    }))
    : previewVenues.map(preview => ({
      kind: 'preview' as const,
      preview,
    }))
  const displayedDestinationCount = categoryParks.length > 0 ? categoryParks.length : previewVenues.length
  const showLoadingState = isLoading && venueSummaries.length === 0
  const showErrorState = error && venueSummaries.length === 0

  if (!resort || !category) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">🗺️</div>
        <h2 className="text-xl font-semibold text-stone-900 mb-2">Not found</h2>
        <p className="text-stone-600">The category you're looking for doesn't exist.</p>
      </div>
    )
  }

  if (showErrorState) {
    return (
      <div className="text-center py-12 px-4 bg-red-50 border border-red-200 rounded-xl">
        <p className="text-red-700">Failed to load destinations. Please try again.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: 'Home', to: '/' },
          { label: resort.name, to: `/resort/${resort.id}` },
          { label: category.label },
        ]}
        accentColor={resort.theme.primary}
      />

      {/* Category header */}
      <div>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{category.icon}</span>
          <div>
            <h1 className="text-2xl font-bold text-stone-900">{category.label}</h1>
            <p className="text-sm text-stone-600">
              {showLoadingState ? 'Loading...' : `${displayedDestinationCount} ${displayedDestinationCount === 1 ? 'destination' : 'destinations'}`}
            </p>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {showLoadingState && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-white border border-stone-200 p-5 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-stone-200 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-stone-200 rounded w-1/2" />
                  <div className="h-4 bg-stone-100 rounded w-3/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Venue cards */}
      {!showLoadingState && (
        <div className="space-y-3">
          <h2 className="sr-only">Destinations</h2>
          {venueSummaries.map(summary => summary.kind === 'live' ? (
            <VenueCardWithData
              key={summary.park.id}
              park={summary.park}
              resortId={resort.id}
              categoryId={category.id}
              theme={resort.theme}
              preview={summary.preview}
            />
          ) : (
            <VenueCard
              key={summary.preview.id}
              parkId={summary.preview.id}
              parkName={summary.preview.name}
              resortId={resort.id}
              categoryId={category.id}
              theme={resort.theme}
              lands={[...summary.preview.lands]}
              restaurantCount={summary.preview.restaurantCount}
              itemCount={summary.preview.itemCount}
            />
          ))}
        </div>
      )}

      {!showLoadingState && venueSummaries.length === 0 && (
        <div className="text-center py-12">
          <div className="text-5xl mb-4">🍽️</div>
          <p className="text-stone-600">No destinations found in this category.</p>
        </div>
      )}
    </div>
  )
}

/** Wrapper that loads restaurant and item count data for a single venue card */
function VenueCardWithData({ park, resortId, categoryId, theme, preview }: {
  park: Park
  resortId: string
  categoryId: string
  theme: ResortTheme
  preview?: CatalogPreviewPark
}) {
  const restaurantsQuery = useRestaurants(park.id)
  const itemCountQuery = useMenuItemCount(park.id)

  const countsAreLoading =
    restaurantsQuery.isLoading ||
    itemCountQuery.isLoading ||
    restaurantsQuery.data == null ||
    itemCountQuery.data == null

  if (restaurantsQuery.isError || itemCountQuery.isError) {
    if (preview) {
      return (
        <VenueCard
          parkId={park.id}
          parkName={park.name}
          resortId={resortId}
          categoryId={categoryId}
          theme={theme}
          lands={[...preview.lands]}
          restaurantCount={preview.restaurantCount}
          itemCount={preview.itemCount}
        />
      )
    }
    return <VenueCardCountsError parkName={park.name} theme={theme} />
  }

  if (countsAreLoading) {
    if (preview) {
      return (
        <VenueCard
          parkId={park.id}
          parkName={park.name}
          resortId={resortId}
          categoryId={categoryId}
          theme={theme}
          lands={[...preview.lands]}
          restaurantCount={preview.restaurantCount}
          itemCount={preview.itemCount}
        />
      )
    }
    return <VenueCardSkeleton parkName={park.name} theme={theme} />
  }

  // Extract unique lands from restaurants
  const lands = [...new Set(restaurantsQuery.data.map(r => r.land).filter(Boolean) as string[])]

  return (
    <VenueCard
      parkId={park.id}
      parkName={park.name}
      resortId={resortId}
      categoryId={categoryId}
      theme={theme}
      lands={lands}
      restaurantCount={restaurantsQuery.data.length}
      itemCount={itemCountQuery.data}
    />
  )
}
