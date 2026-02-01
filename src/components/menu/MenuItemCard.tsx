import type { MenuItemWithNutrition, MealItem } from '../../lib/types'
import { carbColor } from './NutritionBadge'

interface Props {
  item: MenuItemWithNutrition
  onAddToMeal: (item: MealItem) => void
  isFavorite: boolean
  onToggleFavorite: (id: string) => void
}

export function MenuItemCard({ item, onAddToMeal, isFavorite, onToggleFavorite }: Props) {
  const nd = item.nutritional_data?.[0]
  const carbs = nd?.carbs ?? 0
  const calories = nd?.calories ?? 0
  const fat = nd?.fat ?? 0

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold">{item.name}</h3>
          {item.restaurant && (
            <p className="text-xs text-gray-500">{item.restaurant.name} — {item.restaurant.land}</p>
          )}
        </div>
        <button
          onClick={() => onToggleFavorite(item.id)}
          className="text-xl"
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          {isFavorite ? '♥' : '♡'}
        </button>
      </div>

      {item.description && (
        <p className="mt-1 text-sm text-gray-600">{item.description}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${carbColor(carbs)}`}>
          {carbs}g carbs
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{calories} kcal</span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{fat}g fat</span>
        {item.is_vegetarian && <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">Vegetarian</span>}
        {item.is_fried && <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs text-orange-700">Fried</span>}
      </div>

      <button
        className="mt-3 rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
        onClick={() => onAddToMeal({ id: item.id, name: item.name, carbs, calories, fat })}
      >
        Add to Meal
      </button>
    </div>
  )
}
