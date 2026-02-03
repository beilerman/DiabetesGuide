// src/pages/Home.tsx
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useParks, useAllRestaurants, useMenuItemCounts } from '../lib/queries'
import { ResortCard } from '../components/resort/ResortCard'
import { RESORT_CONFIG, getParksForResort } from '../lib/resort-config'

function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden shadow-md animate-pulse">
      <div className="h-44 bg-gradient-to-br from-stone-200 to-stone-300" />
    </div>
  )
}

export default function Home() {
  const { data: parks, isLoading, error } = useParks()
  const { data: allRestaurants } = useAllRestaurants()
  const { data: menuItemCounts } = useMenuItemCounts()

  // Compute counts per resort
  const resortCounts = useMemo(() => {
    if (!parks || !allRestaurants || !menuItemCounts) return new Map()

    const counts = new Map<string, { restaurants: number; items: number }>()

    for (const resort of RESORT_CONFIG) {
      const resortParks = getParksForResort(parks, resort)
      const parkIds = new Set(resortParks.map(p => p.id))

      // Count restaurants in this resort's parks
      const restaurantCount = allRestaurants.filter(r => parkIds.has(r.park_id)).length

      // Count menu items in this resort's parks
      let itemCount = 0
      for (const parkId of parkIds) {
        itemCount += menuItemCounts.get(parkId) || 0
      }

      counts.set(resort.id, { restaurants: restaurantCount, items: itemCount })
    }

    return counts
  }, [parks, allRestaurants, menuItemCounts])

  return (
    <div className="space-y-8">
      {/* Hero section */}
      <div className="text-center space-y-4 py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-teal-500 to-emerald-500 rounded-2xl shadow-lg mb-4">
          <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            <path d="M12 8v8m-4-4h8" strokeLinecap="round"/>
          </svg>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-stone-900">DiabetesGuide</h1>
        <p className="text-lg text-stone-600 max-w-2xl mx-auto">
          Find diabetes-friendly meals across theme parks with detailed nutritional information
        </p>
      </div>

      {/* Quick action buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          to="/browse?sort=carbsAsc"
          className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 hover:border-emerald-300 hover:shadow-md transition-all"
        >
          <div className="flex-shrink-0 w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-emerald-900">Low Carb Picks</div>
            <div className="text-xs text-emerald-700">Browse healthiest options</div>
          </div>
        </Link>

        <Link
          to="/browse"
          className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-200 hover:border-teal-300 hover:shadow-md transition-all"
        >
          <div className="flex-shrink-0 w-10 h-10 bg-teal-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-teal-900">Browse All</div>
            <div className="text-xs text-teal-700">Search all menu items</div>
          </div>
        </Link>

        <Link
          to="/insulin"
          className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 hover:border-amber-300 hover:shadow-md transition-all"
        >
          <div className="flex-shrink-0 w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-amber-900">Insulin Helper</div>
            <div className="text-xs text-amber-700">Calculate dosage</div>
          </div>
        </Link>
      </div>

      {/* Resort cards section */}
      <div>
        <h2 className="text-2xl font-bold text-stone-900 mb-4">Choose a Destination</h2>

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {error && (
          <div className="text-center py-12 px-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-rose-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-rose-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-stone-900 mb-2">Failed to load parks</h3>
            <p className="text-stone-600 mb-4">There was an error loading the data. Please try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {parks && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {RESORT_CONFIG.map(resort => {
              const resortParks = getParksForResort(parks, resort)
              if (resortParks.length === 0) return null
              const counts = resortCounts.get(resort.id)
              return (
                <ResortCard
                  key={resort.id}
                  resort={resort}
                  parkCount={resortParks.length}
                  venueCount={counts?.restaurants ?? 0}
                  itemCount={counts?.items ?? 0}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
