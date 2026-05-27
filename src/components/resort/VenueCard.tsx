import { Link } from 'react-router-dom'
import type { ResortTheme } from '../../lib/resort-config'
import { getParkEmoji } from './park-emoji'

interface Props {
  parkId: string
  parkName: string
  resortId: string
  categoryId: string
  theme: ResortTheme
  lands: string[]
  restaurantCount: number
  itemCount: number
}

export function VenueCard({
  parkId, parkName, resortId, categoryId, theme,
  lands, restaurantCount, itemCount,
}: Props) {
  const maxLands = 3
  const visibleLands = lands.slice(0, maxLands)
  const remaining = lands.length - maxLands

  return (
    <Link
      to={`/resort/${resortId}/${categoryId}/${parkId}`}
      className="flex items-center gap-4 rounded-2xl bg-white border-l-4 border border-stone-200 p-5 shadow-sm hover:shadow-lg transition-all duration-200"
      style={{ borderLeftColor: theme.primary }}
    >
      <div className="text-3xl flex-shrink-0">{getParkEmoji(parkName)}</div>
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-semibold text-stone-900">{parkName}</h3>
        {visibleLands.length > 0 && (
          <p className="text-sm text-stone-500 mt-0.5 truncate">
            {visibleLands.join(', ')}{remaining > 0 ? ` + ${remaining} more` : ''}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1.5 text-sm text-stone-600">
          <span>{restaurantCount} {restaurantCount === 1 ? 'restaurant' : 'restaurants'}</span>
          <span className="text-stone-400">|</span>
          <span>{itemCount} menu items</span>
        </div>
      </div>
      <svg className="w-5 h-5 text-stone-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  )
}

export function VenueCardSkeleton({ parkName, theme }: { parkName: string; theme: ResortTheme }) {
  return (
    <div
      aria-label={`Loading counts for ${parkName}`}
      className="flex items-center gap-4 rounded-2xl bg-white border-l-4 border border-stone-200 p-5 shadow-sm animate-pulse"
      style={{ borderLeftColor: theme.primary }}
    >
      <div className="h-10 w-10 rounded-full bg-stone-200" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-semibold text-stone-900">{parkName}</h3>
        <div className="mt-2 h-4 w-2/3 rounded bg-stone-100" />
        <div className="mt-2 flex gap-2">
          <div className="h-4 w-24 rounded bg-stone-200" />
          <div className="h-4 w-16 rounded bg-stone-200" />
        </div>
      </div>
      <div className="h-5 w-5 rounded bg-stone-200" aria-hidden="true" />
    </div>
  )
}

export function VenueCardCountsError({ parkName, theme }: { parkName: string; theme: ResortTheme }) {
  return (
    <div
      role="alert"
      className="rounded-2xl bg-white border-l-4 border border-amber-200 p-5 shadow-sm"
      style={{ borderLeftColor: theme.primary }}
    >
      <h3 className="text-lg font-semibold text-stone-900">{parkName}</h3>
      <p className="mt-1 text-sm font-medium text-amber-800">Counts unavailable — try refreshing.</p>
    </div>
  )
}
