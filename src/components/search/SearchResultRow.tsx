import type { MenuItemWithNutrition } from '../../lib/types'
import { getGradeForItem } from '../../lib/grade'
import { getMenuItemDisplayName, hasUsableNutrition } from '../../lib/display'
import { GradeBadge } from '../menu/GradeBadge'
import type { SearchMatchTier } from '../../lib/search-index'
import { isNutritionDosingGrade } from '../../lib/nutrition-trust'

interface Props {
  item: MenuItemWithNutrition
  onClick: (item: MenuItemWithNutrition) => void
  relevanceTier?: SearchMatchTier
  relevanceReason?: string
}

export function SearchResultRow({ item, onClick, relevanceTier, relevanceReason }: Props) {
  const displayName = getMenuItemDisplayName(item)
  const nd = hasUsableNutrition(item) ? item.nutritional_data?.[0] : undefined
  const carbs = nd?.carbs ?? null
  const calories = nd?.calories ?? null
  const isLowConfidence = nd != null && !isNutritionDosingGrade(nd)
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
      className="w-full flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-teal-200 hover:bg-stone-50 active:bg-stone-100"
      onClick={() => onClick(item)}
    >
      {nd ? (
        <GradeBadge grade={grade} size="sm" estimated={isLowConfidence} />
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
        {relevanceReason && (
          <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
            relevanceTier === 'weak'
              ? 'bg-amber-100 text-amber-900'
              : 'bg-teal-50 text-teal-800'
          }`}>
            {relevanceReason}
          </span>
        )}
      </div>

      {carbs != null ? (
        <div className="flex-shrink-0 text-right">
          <span className="text-sm font-bold text-stone-900">{carbs}g</span>
          <div className="text-[10px] text-stone-500">carbs</div>
          {isLowConfidence && (
            <div className="mt-0.5 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">
              <span aria-hidden="true">~</span>
              <span>est.</span>
              <span className="sr-only">Estimated — verify before dosing</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-shrink-0 text-xs text-stone-600">No data</div>
      )}
    </button>
  )
}
