// src/components/resort/CategoryCard.tsx
import { Link } from 'react-router-dom'
import type { ResortCategory, ResortTheme } from '../../lib/resort-config'

interface Props {
  category: ResortCategory
  resortId: string
  theme: ResortTheme
  venueCount: number
  itemCount: number
}

export function CategoryCard({ category, resortId, theme, venueCount, itemCount }: Props) {
  return (
    <Link
      to={`/resort/${resortId}/${category.id}`}
      className="block rounded-2xl overflow-hidden border border-stone-200 shadow-sm hover:shadow-lg active:scale-[0.98] transition-all duration-200"
      style={{ backgroundColor: theme.accent + '40' }}
    >
      <div className="p-5">
        <div className="text-3xl mb-2">{category.icon}</div>
        <h3 className="text-lg font-bold text-stone-900">{category.label}</h3>
        <div className="flex items-center gap-2 mt-2 text-sm text-stone-600">
          {venueCount > 0 && (
            <span>{venueCount} {venueCount === 1 ? 'venue' : 'venues'}</span>
          )}
          {venueCount > 0 && itemCount > 0 && <span className="text-stone-400">·</span>}
          {itemCount > 0 && <span>{itemCount} items</span>}
        </div>
      </div>
      {/* Bottom accent bar */}
      <div className="h-1" style={{ background: theme.gradient }} />
    </Link>
  )
}
