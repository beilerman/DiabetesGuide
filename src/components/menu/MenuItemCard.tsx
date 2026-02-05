import { useState } from 'react'
import type { MenuItemWithNutrition, MealItem } from '../../lib/types'
import { carbColor, sugarColor, calorieColor, sodiumColor, NutritionBadge } from './NutritionBadge'

interface Props {
  item: MenuItemWithNutrition
  onAddToMeal: (item: MealItem) => void
  isFavorite: boolean
  onToggleFavorite: (id: string) => void
}

export function MenuItemCard({ item, onAddToMeal, isFavorite, onToggleFavorite }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [addingToMeal, setAddingToMeal] = useState(false)

  const nd = item.nutritional_data?.[0]
  const hasNutrition = !!nd
  const carbs = nd?.carbs ?? null
  const calories = nd?.calories ?? null
  const fat = nd?.fat ?? null
  const sugar = nd?.sugar ?? null
  const protein = nd?.protein ?? null
  const fiber = nd?.fiber ?? null
  const sodium = nd?.sodium ?? null

  const categoryColors: Record<string, string> = {
    entree: 'bg-teal-500',
    snack: 'bg-amber-500',
    beverage: 'bg-blue-500',
    dessert: 'bg-rose-500',
    side: 'bg-emerald-500',
  }

  const allergenIcons: Record<string, string> = {
    milk: '🥛',
    eggs: '🥚',
    fish: '🐟',
    shellfish: '🦐',
    tree_nuts: '🌰',
    peanuts: '🥜',
    wheat: '🌾',
    soybeans: '🫘',
  }

  const handleAddToMeal = () => {
    setAddingToMeal(true)
    onAddToMeal({ id: item.id, name: item.name, carbs: carbs ?? 0, calories: calories ?? 0, fat: fat ?? 0 })
    setTimeout(() => setAddingToMeal(false), 600)
  }

  return (
    <div className="rounded-2xl bg-white shadow-md overflow-hidden hover:shadow-xl transition-shadow duration-300">
      {/* Gradient placeholder background */}
      <div className="relative h-32 bg-gradient-to-br from-teal-400/20 to-emerald-400/20">
        {/* Category badge overlay */}
        <div className="absolute top-2 right-2">
          <span className={`${categoryColors[item.category]} text-white text-xs font-semibold px-3 py-1 rounded-full shadow-md uppercase tracking-wide`}>
            {item.category}
          </span>
        </div>

        {/* Favorite button */}
        <button
          onClick={() => onToggleFavorite(item.id)}
          className="absolute bottom-2 right-2 w-12 h-12 flex items-center justify-center bg-white rounded-full shadow-lg hover:scale-110 transition-transform duration-200"
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <svg
            className={`w-7 h-7 transition-colors duration-200 ${isFavorite ? 'fill-rose-500 stroke-rose-500' : 'fill-none stroke-gray-400'}`}
            viewBox="0 0 24 24"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
            />
          </svg>
        </button>
      </div>

      <div className="p-4">
        {/* Food name */}
        <h3 className="text-lg font-semibold text-gray-900 leading-tight">{item.name}</h3>

        {/* Restaurant/location */}
        {item.restaurant && (
          <div className="mt-1 flex items-center gap-1 text-sm text-gray-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>{item.restaurant.name}</span>
            {item.restaurant.land && <span className="text-gray-400">• {item.restaurant.land}</span>}
          </div>
        )}

        {/* Description */}
        {item.description && (
          <p className="mt-2 text-sm text-gray-600 line-clamp-2">{item.description}</p>
        )}

        {/* Primary nutrition row - CARBS (largest), Calories, Sugar */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {hasNutrition ? (
            <>
              <NutritionBadge
                label="Carbs"
                value={carbs ?? 0}
                unit="g"
                size="lg"
                colorFn={carbColor}
              />
              <NutritionBadge
                label="Cal"
                value={calories ?? 0}
                unit=""
                size="md"
                colorFn={calorieColor}
              />
              {sugar != null && sugar > 0 && (
                <NutritionBadge
                  label="Sugar"
                  value={sugar}
                  unit="g"
                  size="md"
                  colorFn={sugarColor}
                />
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border px-4 py-2 text-base font-semibold bg-stone-100 text-stone-500 border-stone-200">
              No nutrition data
            </span>
          )}
        </div>

        {/* Secondary nutrition row - smaller metrics */}
        {hasNutrition && !expanded && (protein != null || fat != null || fiber != null || sodium != null) && (
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
            {protein != null && <span>Protein: {protein}g</span>}
            {fat != null && <span>Fat: {fat}g</span>}
            {fiber != null && <span>Fiber: {fiber}g</span>}
            {sodium != null && <span>Sodium: {sodium}mg</span>}
          </div>
        )}

        {/* Expanded nutrition details */}
        {expanded && (
          <div className="mt-3 p-3 bg-stone-50 rounded-xl space-y-2">
            <div className="grid grid-cols-2 gap-2 text-sm">
              {protein != null && (
                <NutritionBadge label="Protein" value={protein} unit="g" size="sm" />
              )}
              {fat != null && (
                <NutritionBadge label="Fat" value={fat} unit="g" size="sm" />
              )}
              {fiber != null && (
                <NutritionBadge label="Fiber" value={fiber} unit="g" size="sm" />
              )}
              {sodium != null && (
                <NutritionBadge label="Sodium" value={sodium} unit="mg" size="sm" colorFn={sodiumColor} />
              )}
              {nd?.cholesterol != null && (
                <NutritionBadge label="Cholesterol" value={nd.cholesterol} unit="mg" size="sm" />
              )}
            </div>
          </div>
        )}

        {/* Expand/collapse button */}
        {hasNutrition && (protein != null || fiber != null || sodium != null || nd?.cholesterol != null) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-xs text-teal-600 hover:text-teal-700 font-medium"
          >
            {expanded ? '▼ Show less' : '▶ Full nutrition details'}
          </button>
        )}

        {/* Allergen tags */}
        {item.allergens && item.allergens.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {item.allergens.map((allergen) => (
              <span
                key={allergen.id}
                className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-full"
              >
                <span>{allergenIcons[allergen.allergen_type] || '⚠️'}</span>
                <span className="capitalize">{allergen.allergen_type.replace('_', ' ')}</span>
              </span>
            ))}
          </div>
        )}

        {/* Special badges */}
        <div className="mt-3 flex flex-wrap gap-2">
          {item.is_vegetarian && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 border border-green-200 text-green-700 text-xs rounded-full font-medium">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
              </svg>
              Vegetarian
            </span>
          )}
          {item.is_fried && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 border border-orange-200 text-orange-700 text-xs rounded-full font-medium">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
              </svg>
              Fried
            </span>
          )}
          {item.is_seasonal && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 border border-purple-200 text-purple-700 text-xs rounded-full font-medium">
              ✨ Seasonal
            </span>
          )}
        </div>

        {/* Add to Meal button */}
        <button
          className={`mt-4 w-full h-12 flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 ${
            addingToMeal
              ? 'bg-green-500 text-white'
              : 'bg-teal-600 hover:bg-teal-700 text-white shadow-md hover:shadow-lg'
          }`}
          onClick={handleAddToMeal}
        >
          {addingToMeal ? (
            <>
              <svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
              </svg>
              Added!
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Add to Meal
            </>
          )}
        </button>
      </div>
    </div>
  )
}
