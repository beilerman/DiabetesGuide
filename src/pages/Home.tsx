import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useParks, useMenuItemCounts } from '../lib/queries'
import { findResortForPark } from '../lib/resort-config'
import { getThemeForResort, DEFAULT_THEME } from '../lib/park-themes'
import type { Park } from '../lib/types'

function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden shadow-md animate-pulse">
      <div className="h-28 bg-gradient-to-br from-stone-200 to-stone-300" />
    </div>
  )
}

function ParkCard({ park, itemCount }: { park: Park; itemCount: number }) {
  const resort = findResortForPark(park)
  const theme = resort ? getThemeForResort(resort.id) : DEFAULT_THEME

  return (
    <Link
      to={`/park/${park.id}`}
      className="group relative block rounded-2xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-200 hover:-translate-y-0.5"
    >
      <div
        className="relative px-5 py-6 text-white"
        style={{ background: theme.gradient }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
        <div className="relative flex items-start gap-3">
          <span className="text-4xl drop-shadow-sm" aria-hidden="true">{theme.icon}</span>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold leading-tight">{park.name}</h3>
            {resort && (
              <p className="text-white/75 text-xs mt-0.5">{resort.location}</p>
            )}
          </div>
        </div>
        <div className="relative mt-4 flex items-center justify-between text-xs">
          <span className="font-medium text-white/90">{itemCount.toLocaleString()} items</span>
          <span className="inline-flex items-center gap-1 text-white/90 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
            Browse menus
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
        </div>
      </div>
    </Link>
  )
}

export default function Home() {
  const { data: parks, isLoading, error } = useParks()
  const { data: menuItemCounts } = useMenuItemCounts()

  // Sort parks by item count (most items first), then alphabetically
  const sortedParks = useMemo(() => {
    if (!parks) return []
    return [...parks]
      .filter(p => {
        const count = menuItemCounts?.get(p.id) ?? 0
        return count > 0
      })
      .sort((a, b) => {
        const countA = menuItemCounts?.get(a.id) ?? 0
        const countB = menuItemCounts?.get(b.id) ?? 0
        if (countB !== countA) return countB - countA
        return a.name.localeCompare(b.name)
      })
  }, [parks, menuItemCounts])

  return (
    <div className="space-y-10">
      {/* Hero section */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 via-teal-500 to-emerald-500 px-6 py-12 sm:px-10 sm:py-16 text-white shadow-xl">
        <div className="absolute -top-16 -right-16 w-72 h-72 bg-white/10 rounded-full blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-20 -left-10 w-72 h-72 bg-emerald-300/20 rounded-full blur-3xl" aria-hidden="true" />
        <div className="relative max-w-2xl">
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-widest text-teal-100 mb-3">Theme park diabetes companion</p>
          <h1 className="text-3xl sm:text-5xl font-bold leading-tight">Eat with confidence at the parks.</h1>
          <p className="mt-4 text-base sm:text-lg text-teal-50 max-w-xl">
            Carb counts, ingredient flags, and meal tracking for thousands of theme-park menu items — built for people managing diabetes.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/search"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white text-teal-700 font-semibold text-sm shadow-md hover:bg-teal-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Search items
            </Link>
            <Link
              to="/browse?sort=grade"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-teal-700/40 text-white font-semibold text-sm border border-white/30 backdrop-blur hover:bg-teal-700/60 transition-colors"
            >
              Top rated
            </Link>
          </div>
        </div>
      </section>

      {/* Quick stat / utility row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="🍽️" label="Menu items" value={menuItemCounts ? Array.from(menuItemCounts.values()).reduce((a, b) => a + b, 0).toLocaleString() : '—'} />
        <StatCard icon="🎢" label="Parks" value={sortedParks.length} />
        <StatCard icon="✓" label="Graded" value="A–F" />
        <StatCard icon="📱" label="Works offline" value="Yes" />
      </div>

      {/* Park picker grid */}
      <div>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-2xl font-bold text-stone-900">Choose a park</h2>
          <p className="text-sm text-stone-500 hidden sm:block">Sorted by menu coverage</p>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
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

        {sortedParks.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedParks.map(park => (
              <ParkCard
                key={park.id}
                park={park}
                itemCount={menuItemCounts?.get(park.id) ?? 0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer disclaimer */}
      <div className="text-center text-xs text-stone-500 pt-4 pb-2 max-w-xl mx-auto">
        Nutritional info is estimated and not verified by parks. Educational use only — not medical advice.
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white border border-stone-200 px-4 py-3 flex items-center gap-3">
      <span className="text-xl" aria-hidden="true">{icon}</span>
      <div className="min-w-0">
        <p className="text-lg font-bold text-stone-900 leading-none">{value}</p>
        <p className="text-xs text-stone-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}
