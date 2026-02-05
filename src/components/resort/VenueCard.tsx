// src/components/resort/VenueCard.tsx
import { Link } from 'react-router-dom'
import type { ResortTheme } from '../../lib/resort-config'

// Park emoji mapping - ordered from most specific to most general to avoid substring false matches
const PARK_EMOJI_RULES: ReadonlyArray<{ match: RegExp; emoji: string }> = [
  { match: /magic kingdom|disneyland park/i, emoji: '🏰' },
  { match: /epcot/i, emoji: '🌐' },
  { match: /hollywood|studios/i, emoji: '🎬' },
  { match: /animal kingdom(?!.*lodge)/i, emoji: '🦁' },
  { match: /cruise|disney magic|disney wonder|disney dream|disney fantasy|disney wish|disney treasure/i, emoji: '🚢' },
  { match: /aulani/i, emoji: '🌺' },
  { match: /resort|hotel|lodge/i, emoji: '🏨' },
  { match: /epic universe/i, emoji: '🌌' },
  { match: /universal/i, emoji: '🎢' },
  { match: /islands/i, emoji: '🏝️' },
  { match: /water|aquatica|blizzard|typhoon|volcano/i, emoji: '🌊' },
  { match: /adventure|busch/i, emoji: '🎪' },
  { match: /legoland/i, emoji: '🧱' },
  { match: /springs|downtown disney/i, emoji: '🛍️' },
  { match: /seaworld/i, emoji: '🐬' },
]

export function getParkEmoji(parkName: string): string {
  for (const { match, emoji } of PARK_EMOJI_RULES) {
    if (match.test(parkName)) return emoji
  }
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
