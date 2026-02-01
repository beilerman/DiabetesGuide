import { Link } from 'react-router-dom'
import { useParks } from '../lib/queries'

// Park emoji mapping based on park name patterns
function getParkEmoji(parkName: string): string {
  const name = parkName.toLowerCase()
  if (name.includes('magic kingdom') || name.includes('disneyland')) return '🏰'
  if (name.includes('epcot')) return '🌐'
  if (name.includes('hollywood') || name.includes('studios')) return '🎬'
  if (name.includes('animal kingdom')) return '🦁'
  if (name.includes('universal')) return '🎢'
  if (name.includes('islands')) return '🏝️'
  if (name.includes('water') || name.includes('aquatica') || name.includes('blizzard') || name.includes('typhoon')) return '🌊'
  if (name.includes('adventure') || name.includes('busch')) return '🎪'
  if (name.includes('legoland')) return '🧱'
  return '🎡'
}

// Park color based on type
function getParkColor(parkName: string): string {
  const name = parkName.toLowerCase()
  if (name.includes('magic kingdom') || name.includes('disneyland')) return 'border-l-purple-500'
  if (name.includes('epcot')) return 'border-l-blue-500'
  if (name.includes('hollywood') || name.includes('studios')) return 'border-l-red-500'
  if (name.includes('animal kingdom')) return 'border-l-green-500'
  if (name.includes('universal')) return 'border-l-indigo-500'
  if (name.includes('islands')) return 'border-l-cyan-500'
  if (name.includes('water')) return 'border-l-sky-400'
  return 'border-l-teal-500'
}

// Skeleton card component
function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="skeleton w-12 h-12 rounded-xl" />
        <div className="flex-1 space-y-3">
          <div className="skeleton h-6 w-3/4 rounded" />
          <div className="skeleton h-4 w-1/2 rounded" />
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const { data: parks, isLoading, error } = useParks()

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
        <h1 className="text-3xl sm:text-4xl font-bold text-stone-900">Welcome to DiabetesGuide</h1>
        <p className="text-lg text-stone-600 max-w-2xl mx-auto">
          Find diabetes-friendly meals across theme parks with detailed nutritional information
        </p>
        {parks && (
          <div className="flex items-center justify-center gap-2 text-sm text-stone-500">
            <span className="font-semibold text-teal-600">{parks.length}</span>
            <span>parks available</span>
          </div>
        )}
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

      {/* Parks section */}
      <div>
        <h2 className="text-2xl font-bold text-stone-900 mb-4">Choose a Park</h2>

        {/* Loading state */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="text-center py-12 px-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-rose-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-rose-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-stone-900 mb-2">Failed to load parks</h3>
            <p className="text-stone-600 mb-4">There was an error loading the park data. Please try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Retry
            </button>
          </div>
        )}

        {/* Parks grid */}
        {parks && parks.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {parks.map(park => (
              <Link
                key={park.id}
                to={`/park/${park.id}`}
                className={`rounded-2xl border-l-4 border-t border-r border-b border-stone-200 bg-white p-6 shadow-sm hover:shadow-lg transition-all ${getParkColor(park.name)}`}
              >
                <div className="flex items-start gap-4">
                  <div className="text-4xl flex-shrink-0" role="img" aria-label="Park icon">
                    {getParkEmoji(park.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-stone-900 mb-1 line-clamp-2">{park.name}</h2>
                    <p className="text-sm text-stone-500 flex items-center gap-1">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                        <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                      </svg>
                      <span className="truncate">{park.location}</span>
                    </p>
                  </div>
                  <svg className="w-5 h-5 text-stone-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Empty state */}
        {parks && parks.length === 0 && (
          <div className="text-center py-12 px-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-stone-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-stone-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-stone-900 mb-2">No parks available</h3>
            <p className="text-stone-600">Check back later for available parks.</p>
          </div>
        )}
      </div>
    </div>
  )
}
