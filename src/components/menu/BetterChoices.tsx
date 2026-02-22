import type { MenuItemWithNutrition } from '../../lib/types'
import { computeScore, computeGrade } from '../../lib/grade'
import { GradeBadge } from './GradeBadge'

interface Props {
  currentItem: MenuItemWithNutrition
  siblingItems: MenuItemWithNutrition[]
}

function getScore(item: MenuItemWithNutrition): number | null {
  const nd = item.nutritional_data?.[0]
  if (!nd) return null
  return computeScore({
    calories: nd.calories, carbs: nd.carbs, fat: nd.fat,
    protein: nd.protein, sugar: nd.sugar, fiber: nd.fiber,
    sodium: nd.sodium, alcoholGrams: nd.alcohol_grams,
  })
}

export function BetterChoices({ currentItem, siblingItems }: Props) {
  const currentScore = getScore(currentItem)
  if (currentScore == null) return null

  const betterItems = siblingItems
    .filter(item => item.id !== currentItem.id)
    .map(item => ({ item, score: getScore(item) }))
    .filter((entry): entry is { item: MenuItemWithNutrition; score: number } =>
      entry.score != null && entry.score > currentScore
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)

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
