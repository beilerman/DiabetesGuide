import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useParks, useMenuItemCounts } from '../lib/queries'
import { getThemeForResort, DEFAULT_THEME } from '../lib/park-themes'
import {
  buildHomeResortGroups,
  hasUsableHomeItemCounts,
  type HomeResortCategoryGroup,
  type HomeResortGroup,
} from '../lib/home-resort-groups'

function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden shadow-md animate-pulse">
      <div className="h-28 bg-gradient-to-br from-stone-200 to-stone-300" />
    </div>
  )
}

export default function Home() {
  const { data: parks, isLoading, error } = useParks()
  const { data: menuItemCounts } = useMenuItemCounts()
  const countsReady = hasUsableHomeItemCounts(menuItemCounts)

  const resortGroups = useMemo(() => {
    if (!parks) return []
    return buildHomeResortGroups(parks, menuItemCounts)
  }, [parks, menuItemCounts])

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
          to="/browse?sort=grade"
          className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 hover:border-emerald-300 hover:shadow-md transition-all"
        >
          <div className="flex-shrink-0 w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-emerald-900">Top Rated</div>
            <div className="text-xs text-emerald-700">A &amp; B graded items</div>
          </div>
        </Link>

        <Link
          to="/search"
          className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-200 hover:border-teal-300 hover:shadow-md transition-all"
        >
          <div className="flex-shrink-0 w-10 h-10 bg-teal-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-teal-900">Search All</div>
            <div className="text-xs text-teal-700">Find any menu item</div>
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

      {/* Resort picker */}
      <div>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-stone-900">Choose a Destination</h2>
            <p className="mt-1 text-sm text-stone-600">Browse by resort, then park, hotel, land, and restaurant.</p>
          </div>
          <Link
            to="/browse"
            className="hidden sm:inline-flex rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:border-teal-300 hover:text-teal-700 transition-colors"
          >
            Browse all
          </Link>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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

        {!isLoading && !error && resortGroups.length > 0 && (
          <div className="space-y-7">
            {resortGroups.map(group => (
              <ResortDestinationSection
                key={group.id}
                group={group}
                countsReady={countsReady}
              />
            ))}
          </div>
        )}

        {!isLoading && !error && resortGroups.length === 0 && (
          <div className="rounded-lg border border-stone-200 bg-white p-6 text-center">
            <h3 className="font-semibold text-stone-900">No destinations found</h3>
            <p className="mt-1 text-sm text-stone-600">Try browsing all menu items instead.</p>
            <Link
              to="/browse"
              className="mt-4 inline-flex rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              Browse all
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

function formatItems(count: number, countsReady: boolean): string {
  if (!countsReady) return 'Item count syncing'
  return `${count.toLocaleString()} ${count === 1 ? 'item' : 'items'}`
}

function formatLocations(count: number): string {
  return `${count} ${count === 1 ? 'location' : 'locations'}`
}

function resortHref(group: HomeResortGroup): string {
  return group.id === 'other' ? '/browse' : `/resort/${group.id}`
}

function categoryHref(group: HomeResortGroup, category: HomeResortCategoryGroup): string {
  return group.id === 'other' ? '/browse' : `/resort/${group.id}/${category.id}`
}

function venuePreview(category: HomeResortCategoryGroup): string {
  const visible = category.parks.slice(0, 3).map(park => park.name)
  const remaining = category.parks.length - visible.length
  return `${visible.join(', ')}${remaining > 0 ? ` + ${remaining} more` : ''}`
}

function ResortDestinationSection({
  group,
  countsReady,
}: {
  group: HomeResortGroup
  countsReady: boolean
}) {
  const theme = group.id === 'other' ? DEFAULT_THEME : getThemeForResort(group.id)

  return (
    <section aria-labelledby={`home-resort-${group.id}`} className="border-t border-stone-200 pt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-2xl text-white"
            style={{ background: theme.gradient }}
            aria-hidden="true"
          >
            {group.icon || DEFAULT_THEME.icon}
          </div>
          <div className="min-w-0">
            <h3 id={`home-resort-${group.id}`} className="text-xl font-bold text-stone-900">
              {group.name}
            </h3>
            <p className="text-sm text-stone-600">{group.location}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-stone-500">
              <span>{formatLocations(group.locationCount)}</span>
              <span>{formatItems(group.itemCount, countsReady)}</span>
            </div>
          </div>
        </div>

        <Link
          to={resortHref(group)}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 hover:border-teal-300 hover:text-teal-700 transition-colors"
        >
          Browse all
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {group.categories.map(category => (
          <Link
            key={category.id}
            to={categoryHref(group, category)}
            className="group flex min-h-24 gap-3 rounded-lg border border-stone-200 bg-white p-3 transition-colors hover:border-teal-300 hover:bg-teal-50/40"
            style={{ borderLeftColor: theme.primary, borderLeftWidth: 4 }}
          >
            <span className="text-2xl" aria-hidden="true">{category.icon || group.icon || DEFAULT_THEME.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-stone-900 group-hover:text-teal-800">{category.label}</span>
              <span className="mt-0.5 block text-xs font-medium text-stone-500">
                {formatLocations(category.locationCount)} | {formatItems(category.itemCount, countsReady)}
              </span>
              {category.parks.length > 0 && (
                <span className="mt-1 block truncate text-xs text-stone-500" title={venuePreview(category)}>
                  {venuePreview(category)}
                </span>
              )}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
