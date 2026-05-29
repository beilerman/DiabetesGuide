import type { MenuItemWithNutrition } from '../../lib/types'
import { computeGrade } from '../../lib/grade'
import { findBetterChoices } from '../../lib/recommendations'
import { GradeBadge } from './GradeBadge'

interface Props {
  currentItem: MenuItemWithNutrition
  siblingItems: MenuItemWithNutrition[]
}

export function BetterChoices({ currentItem, siblingItems }: Props) {
  const betterItems = findBetterChoices(currentItem, siblingItems)
  if (betterItems.length === 0) return null

  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-stone-500 mb-1.5">Lower carb at this restaurant</p>
      <div className="space-y-1.5">
        {betterItems.map(({ item, score }) => {
          const nd = item.nutritional_data?.[0]
          const grade = computeGrade(score)
          return (
            <div key={item.id} className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-100 px-2.5 py-1.5">
              <GradeBadge grade={grade} size="sm" />
              <span className="flex-1 text-sm font-medium text-stone-800 truncate">{item.name}</span>
              <span className="text-sm font-bold text-stone-700">{nd?.carbs ?? '?'}g</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
