// src/components/resort/VenueCard.tsx
import { Link } from 'react-router-dom'
import type { ResortTheme } from '../../lib/resort-config'

// Park emoji mapping (extracted from old Home.tsx)
export function getParkEmoji(parkName: string): string {
  const name = parkName.toLowerCase()
  if (name.includes('magic kingdom') || name.includes('disneyland park')) return '🏰'
  if (name.includes('epcot')) return '🌐'
  if (name.includes('hollywood') || name.includes('studios')) return '🎬'
  if (name.includes('animal kingdom') && !name.includes('lodge')) return '🦁'
  if (name.includes('cruise') || name.includes('disney magic') || name.includes('disney wonder') || name.includes('disney dream') || name.includes('disney fantasy') || name.includes('disney wish') || name.includes('disney treasure')) return '🚢'
  if (name.includes('aulani')) return '🌺'
  if (name.includes('resort') || name.includes('hotel') || name.includes('lodge')) return '🏨'
  if (name.includes('epic universe')) return '🌌'
  if (name.includes('universal')) return '🎢'
  if (name.includes('islands')) return '🏝️'
  if (name.includes('water') || name.includes('aquatica') || name.includes('blizzard') || name.includes('typhoon') || name.includes('volcano')) return '🌊'
  if (name.includes('adventure') || name.includes('busch')) return '🎪'
  if (name.includes('legoland')) return '🧱'
  if (name.includes('springs') || name.includes('downtown disney')) return '🛍️'
  if (name.includes('seaworld')) return '🐬'
  return '🎡'
}

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
          <span className="text-stone-400">·</span>
          <span>{itemCount} items</span>
        </div>
      </div>
      <svg className="w-5 h-5 text-stone-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </Link>
  )
}
