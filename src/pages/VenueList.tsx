// src/pages/VenueList.tsx
import { useParams } from 'react-router-dom'
import { useParks, useRestaurants, useMenuItemCount } from '../lib/queries'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { VenueCard } from '../components/resort/VenueCard'
import { getResortById, getParksForCategory } from '../lib/resort-config'
import type { ResortTheme } from '../lib/resort-config'

export default function VenueList() {
  const { resortId, categoryId } = useParams<{ resortId: string; categoryId: string }>()
  const resort = getResortById(resortId || '')
  const category = resort?.categories.find(c => c.id === categoryId)
  const { data: allParks, isLoading, error } = useParks()

  const categoryParks = (allParks && resort && categoryId)
    ? getParksForCategory(allParks, resort, categoryId)
    : []

  if (!resort || !category) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">🗺️</div>
        <h2 className="text-xl font-semibold text-stone-900 mb-2">Not found</h2>
        <p className="text-stone-600">The category you're looking for doesn't exist.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12 px-4 bg-red-50 border border-red-200 rounded-xl">
        <p className="text-red-700">Failed to load venues. Please try again.</p>
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
              {isLoading ? 'Loading...' : `${categoryParks.length} ${categoryParks.length === 1 ? 'venue' : 'venues'}`}
            </p>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
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
      {!isLoading && (
        <div className="space-y-3">
          {categoryParks.map(park => (
            <VenueCardWithData
              key={park.id}
              parkId={park.id}
              parkName={park.name}
              resortId={resort.id}
              categoryId={category.id}
              theme={resort.theme}
            />
          ))}
        </div>
      )}

      {!isLoading && categoryParks.length === 0 && (
        <div className="text-center py-12">
          <div className="text-5xl mb-4">🍽️</div>
          <p className="text-stone-600">No venues found in this category.</p>
        </div>
      )}
    </div>
  )
}

/** Wrapper that loads restaurant and item count data for a single venue card */
function VenueCardWithData({ parkId, parkName, resortId, categoryId, theme }: {
  parkId: string
  parkName: string
  resortId: string
  categoryId: string
  theme: ResortTheme
}) {
  const { data: restaurants } = useRestaurants(parkId)
  const { data: itemCount } = useMenuItemCount(parkId)

  // Extract unique lands from restaurants
  const lands = [...new Set((restaurants ?? []).map(r => r.land).filter(Boolean) as string[])]

  return (
    <VenueCard
      parkId={parkId}
      parkName={parkName}
      resortId={resortId}
      categoryId={categoryId}
      theme={theme}
      lands={lands}
      restaurantCount={restaurants?.length ?? 0}
      itemCount={itemCount ?? 0}
    />
  )
}
