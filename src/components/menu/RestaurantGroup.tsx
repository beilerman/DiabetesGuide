// src/components/menu/RestaurantGroup.tsx
import { useState } from 'react'
import { MenuItemCard } from './MenuItemCard'
import type { MenuItemWithNutrition, MealItem } from '../../lib/types'

interface Props {
  restaurantName: string
  land: string | null
  items: MenuItemWithNutrition[]
  defaultExpanded: boolean
  accentColor?: string
  onAddToMeal: (item: MealItem) => void
  isFavorite: (id: string) => boolean
  onToggleFavorite: (id: string) => void
}

export function RestaurantGroup({
  restaurantName, land, items, defaultExpanded, accentColor,
  onAddToMeal, isFavorite, onToggleFavorite,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-sm">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-3 w-full text-left p-4 hover:bg-stone-50 transition-colors"
        aria-expanded={expanded}
      >
        <svg
          className={`w-5 h-5 text-stone-400 transition-transform duration-200 flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
        >
          <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-stone-900" style={{ color: expanded ? (accentColor || undefined) : undefined }}>
            {restaurantName}
          </h3>
          <div className="flex items-center gap-2 text-sm text-stone-500">
            {land && <span>{land}</span>}
            {land && <span className="text-stone-300">·</span>}
            <span>{items.length} {items.length === 1 ? 'item' : 'items'}</span>
          </div>
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map(item => (
              <MenuItemCard
                key={item.id}
                item={item}
                onAddToMeal={onAddToMeal}
                isFavorite={isFavorite(item.id)}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
