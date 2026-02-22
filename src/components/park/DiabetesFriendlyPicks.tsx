import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { GradeBadge } from '../menu/GradeBadge'
import { getGradeForItem } from '../../lib/grade'
import type { MenuItemWithNutrition } from '../../lib/types'

interface Props {
  items: MenuItemWithNutrition[]
  themeColor: string
  parkId: string
}

export function DiabetesFriendlyPicks({ items, themeColor, parkId }: Props) {
  const topPicks = useMemo(() => {
    return items
      .map(item => {
        const nd = item.nutritional_data?.[0]
        const { grade, score } = getGradeForItem({
          calories: nd?.calories ?? null,
          carbs: nd?.carbs ?? null,
          fat: nd?.fat ?? null,
          protein: nd?.protein ?? null,
          sugar: nd?.sugar ?? null,
          fiber: nd?.fiber ?? null,
          sodium: nd?.sodium ?? null,
          alcoholGrams: nd?.alcohol_grams ?? null,
        })
        return { item, grade, score }
      })
      .filter(g => g.grade === 'A' || g.grade === 'B')
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 10)
  }, [items])

  if (topPicks.length === 0) return null

  return (
    <div className="px-4 py-4">
      <h2 className="text-lg font-bold text-stone-900 mb-3">Diabetes-Friendly Picks</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {topPicks.map(({ item, grade }) => (
          <div
            key={item.id}
            className="flex-shrink-0 w-52 rounded-xl bg-white border border-stone-200 shadow-sm p-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <GradeBadge grade={grade} size="sm" themeColor={themeColor} />
              <span className="text-sm font-semibold text-stone-900 truncate">{item.name}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-stone-600">
              <span className="truncate">{item.restaurant?.name}</span>
              <span className="font-bold text-stone-900">{item.nutritional_data?.[0]?.carbs ?? '?'}g carbs</span>
            </div>
          </div>
        ))}
      </div>
      <Link
        to={`/browse?park=${parkId}&sort=grade`}
        className="inline-block mt-2 text-xs text-teal-600 hover:text-teal-700 font-medium"
      >
        See all A &amp; B rated items &rarr;
      </Link>
    </div>
  )
}
