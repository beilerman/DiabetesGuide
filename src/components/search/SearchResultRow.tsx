import type { MenuItemWithNutrition } from '../../lib/types'
import { getGradeForItem } from '../../lib/grade'
import { getMenuItemDisplayName, hasUsableNutrition } from '../../lib/display'
import { GradeBadge } from '../menu/GradeBadge'

interface Props {
  item: MenuItemWithNutrition
  onClick: (item: MenuItemWithNutrition) => void
}

export function SearchResultRow({ item, onClick }: Props) {
  const displayName = getMenuItemDisplayName(item)
  const nd = hasUsableNutrition(item) ? item.nutritional_data?.[0] : undefined
  const carbs = nd?.carbs ?? null
  const calories = nd?.calories ?? null
  const availabilityCount = item.availability_count ?? 1
  const hasMultipleLocations = availabilityCount > 1

  const { grade } = getGradeForItem({
    calories,
    carbs,
    fat: nd?.fat ?? null,
    protein: nd?.protein ?? null,
    sugar: nd?.sugar ?? null,
    fiber: nd?.fiber ?? null,
    sodium: nd?.sodium ?? null,
    alcoholGrams: nd?.alcohol_grams ?? null,
  })

  return (
    <button
      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 active:bg-stone-100 transition-colors text-left rounded-lg"
      onClick={() => onClick(item)}
    >
      {nd ? (
        <GradeBadge grade={grade} size="sm" />
      ) : (
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-stone-200 text-[10px] font-bold text-stone-700">
          N/A
        </span>
      )}

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-stone-900 truncate">{displayName}</div>
        <div className="text-xs text-stone-500 truncate">
          {hasMultipleLocations ? `${availabilityCount} locations` : item.restaurant?.name}
          {item.restaurant?.park && <span> &middot; {item.restaurant.park.name}</span>}
        </div>
      </div>

      {carbs != null ? (
        <div className="flex-shrink-0 text-right">
          <span className="text-sm font-bold text-stone-900">{carbs}g</span>
          <div className="text-[10px] text-stone-500">carbs</div>
        </div>
      ) : (
        <div className="flex-shrink-0 text-xs text-stone-600">No data</div>
      )}
    </button>
  )
}
