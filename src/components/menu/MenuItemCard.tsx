import { useState } from 'react'
import type { MenuItemWithNutrition, MealItem } from '../../lib/types'
import { getGradeForItem } from '../../lib/grade'
import { getDiabetesAnnotations } from '../../lib/annotations'
import { GradeBadge } from './GradeBadge'
import { DotMeter } from './DotMeter'
import { AnnotationBadge } from './AnnotationBadge'
import { NutritionBadge } from './NutritionBadge'
import { BetterChoices } from './BetterChoices'
import { sodiumColor, alcoholColor } from './nutrition-colors'

interface Props {
  item: MenuItemWithNutrition
  onAddToMeal: (item: MealItem) => void
  isFavorite: boolean
  onToggleFavorite: (id: string) => void
  onCompare?: (item: MenuItemWithNutrition) => void
  siblingItems?: MenuItemWithNutrition[]
  themeColor?: string
}

function carbDots(v: number): 'green' | 'amber' | 'rose' {
  if (v <= 30) return 'green'
  if (v <= 60) return 'amber'
  return 'rose'
}

function calDots(v: number): 'green' | 'amber' | 'rose' {
  if (v < 400) return 'green'
  if (v <= 700) return 'amber'
  return 'rose'
}

function sugarDots(v: number): 'green' | 'amber' | 'rose' {
  if (v < 10) return 'green'
  if (v <= 25) return 'amber'
  return 'rose'
}

function proteinDots(v: number): 'green' | 'amber' | 'rose' {
  if (v >= 20) return 'green'
  if (v >= 10) return 'amber'
  return 'rose'
}

const allergenIcons: Record<string, string> = {
  milk: '\uD83E\uDD5B',
  eggs: '\uD83E\uDD5A',
  fish: '\uD83D\uDC1F',
  shellfish: '\uD83E\uDD90',
  tree_nuts: '\uD83C\uDF30',
  peanuts: '\uD83E\uDD5C',
  wheat: '\uD83C\uDF3E',
  soybeans: '\uD83E\uDED8',
}

const categoryColors: Record<string, string> = {
  entree: 'bg-teal-100 text-teal-700',
  snack: 'bg-amber-100 text-amber-700',
  beverage: 'bg-blue-100 text-blue-700',
  dessert: 'bg-rose-100 text-rose-700',
  side: 'bg-emerald-100 text-emerald-700',
}

export function MenuItemCard({ item, onAddToMeal, isFavorite, onToggleFavorite, onCompare, siblingItems, themeColor }: Props) {
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
  const alcoholGrams = nd?.alcohol_grams ?? null
  const netCarbs = carbs != null && fiber != null ? Math.max(0, carbs - fiber) : carbs

  const { grade, colors: gradeColors } = getGradeForItem({
    calories, carbs, fat, protein, sugar, fiber, sodium,
    alcoholGrams,
  })

  const annotations = getDiabetesAnnotations({
    calories, carbs, sugar, fat, protein, fiber, sodium,
    alcoholGrams: alcoholGrams ?? 0,
    category: item.category,
    isFried: item.is_fried,
  })
  const topAnnotation = annotations[0] ?? null

  const handleAddToMeal = () => {
    setAddingToMeal(true)
    onAddToMeal({
      id: item.id,
      name: item.name,
      carbs: carbs ?? 0,
      calories: calories ?? 0,
      fat: fat ?? 0,
      protein: protein ?? 0,
      sugar: sugar ?? 0,
      fiber: fiber ?? 0,
      sodium: sodium ?? 0,
      restaurant: item.restaurant?.name,
      parkName: item.restaurant?.park?.name,
    })
    setTimeout(() => setAddingToMeal(false), 600)
  }

  const borderColor = themeColor ?? '#0d9488'

  return (
    <div
      className="rounded-2xl bg-white shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-200"
      style={{ borderLeft: `3px solid ${borderColor}` }}
    >
      <div className="p-4">
        {/* Top row: Grade badge + name + favorite */}
        <div className="flex items-start gap-3">
          <GradeBadge grade={grade} size="lg" themeColor={themeColor} />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold text-stone-900 leading-tight">{item.name}</h3>
              <button
                onClick={() => onToggleFavorite(item.id)}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors"
                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <svg
                  className={`w-5 h-5 ${isFavorite ? 'fill-rose-500 stroke-rose-500' : 'fill-none stroke-stone-400'}`}
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

            {/* Restaurant + category */}
            <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-500">
              {item.restaurant && (
                <span className="truncate">{item.restaurant.name}</span>
              )}
              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${categoryColors[item.category] ?? 'bg-stone-100 text-stone-600'}`}>
                {item.category}
              </span>
            </div>
          </div>
        </div>

        {/* Hero nutrition row */}
        {hasNutrition ? (
          <div className="mt-3 flex items-end gap-4">
            {/* Carbs hero */}
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-stone-900">{carbs ?? 0}<span className="text-sm font-normal text-stone-500">g</span></span>
              <span className="text-[10px] text-stone-500 uppercase tracking-wide">Carbs</span>
              <DotMeter value={carbs ?? 0} max={80} colorFn={carbDots} label="Carbs" />
            </div>

            {/* Net carbs */}
            {fiber != null && fiber > 0 && netCarbs !== carbs && (
              <div className="flex flex-col items-center">
                <span className="text-lg font-semibold text-teal-700">{netCarbs}<span className="text-xs font-normal text-teal-600">g</span></span>
                <span className="text-[10px] text-teal-600 uppercase tracking-wide">Net</span>
              </div>
            )}

            {/* Cal */}
            <div className="flex flex-col items-center">
              <span className="text-lg font-semibold text-stone-700">{calories ?? 0}</span>
              <span className="text-[10px] text-stone-500 uppercase tracking-wide">Cal</span>
              <DotMeter value={calories ?? 0} max={1000} colorFn={calDots} label="Calories" />
            </div>

            {/* Sugar */}
            {sugar != null && sugar > 0 && (
              <div className="flex flex-col items-center">
                <span className="text-lg font-semibold text-stone-700">{sugar}<span className="text-xs font-normal text-stone-500">g</span></span>
                <span className="text-[10px] text-stone-500 uppercase tracking-wide">Sugar</span>
                <DotMeter value={sugar} max={50} colorFn={sugarDots} label="Sugar" />
              </div>
            )}

            {/* Protein */}
            {protein != null && protein > 0 && (
              <div className="flex flex-col items-center">
                <span className="text-lg font-semibold text-stone-700">{protein}<span className="text-xs font-normal text-stone-500">g</span></span>
                <span className="text-[10px] text-stone-500 uppercase tracking-wide">Protein</span>
                <DotMeter value={protein} max={50} colorFn={proteinDots} label="Protein" />
              </div>
            )}

            {/* Alcohol */}
            {alcoholGrams != null && alcoholGrams > 0 && (
              <div className="flex flex-col items-center">
                <span className="text-lg font-semibold text-purple-700">{alcoholGrams}<span className="text-xs font-normal text-purple-500">g</span></span>
                <span className="text-[10px] text-purple-500 uppercase tracking-wide">Alcohol</span>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <span className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm bg-stone-100 text-stone-500 border border-stone-200">
              No nutrition data
            </span>
          </div>
        )}

        {/* Top annotation */}
        {topAnnotation && (
          <div className="mt-2">
            <AnnotationBadge annotation={topAnnotation} />
          </div>
        )}

        {/* Grade label */}
        {gradeColors && (
          <div className="mt-2 text-xs font-medium" style={{ color: gradeColors.bg }}>
            {gradeColors.label}
          </div>
        )}

        {/* Tags row */}
        {(item.is_vegetarian || item.is_fried || item.is_seasonal) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.is_vegetarian && (
              <span className="px-2 py-0.5 bg-green-50 border border-green-200 text-green-700 text-[11px] rounded-full font-medium">
                Vegetarian
              </span>
            )}
            {item.is_fried && (
              <span className="px-2 py-0.5 bg-orange-50 border border-orange-200 text-orange-700 text-[11px] rounded-full font-medium">
                Fried
              </span>
            )}
            {item.is_seasonal && (
              <span className="px-2 py-0.5 bg-purple-50 border border-purple-200 text-purple-700 text-[11px] rounded-full font-medium">
                Seasonal
              </span>
            )}
          </div>
        )}

        {/* Expanded state */}
        {expanded && hasNutrition && (
          <div className="mt-3 p-3 bg-stone-50 rounded-xl space-y-3">
            {/* Full nutrition grid */}
            <div className="grid grid-cols-2 gap-2">
              {protein != null && <NutritionBadge label="Protein" value={protein} unit="g" size="sm" />}
              {fat != null && <NutritionBadge label="Fat" value={fat} unit="g" size="sm" />}
              {fiber != null && <NutritionBadge label="Fiber" value={fiber} unit="g" size="sm" />}
              {sodium != null && <NutritionBadge label="Sodium" value={sodium} unit="mg" size="sm" colorFn={sodiumColor} />}
              {nd?.cholesterol != null && <NutritionBadge label="Cholesterol" value={nd.cholesterol} unit="mg" size="sm" />}
              {alcoholGrams != null && alcoholGrams > 0 && (
                <NutritionBadge label="Alcohol" value={alcoholGrams} unit="g" size="sm" colorFn={alcoholColor} />
              )}
            </div>

            {/* Alcohol standard drinks */}
            {alcoholGrams != null && alcoholGrams > 0 && (
              <p className="text-xs text-purple-700">
                ~{(alcoholGrams / 14).toFixed(1)} standard drinks (14g = 1 drink)
              </p>
            )}

            {/* Allergens */}
            {item.allergens && item.allergens.length > 0 && (
              <div>
                <div className="text-xs font-medium text-stone-600 mb-1">Allergens</div>
                <div className="flex flex-wrap gap-1.5">
                  {item.allergens.map((allergen) => (
                    <span
                      key={allergen.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] rounded-full"
                    >
                      <span>{allergenIcons[allergen.allergen_type] || '\u26A0\uFE0F'}</span>
                      <span className="capitalize">{allergen.allergen_type.replace('_', ' ')}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* All annotations */}
            {annotations.length > 1 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-stone-600 mb-1">Diabetes notes</div>
                {annotations.slice(1).map((a, i) => (
                  <AnnotationBadge key={i} annotation={a} />
                ))}
              </div>
            )}

            {/* Confidence */}
            {nd?.confidence_score != null && (
              <div className="text-[11px] text-stone-400">
                Data confidence: {nd.confidence_score}% &middot; Source: {nd.source}
              </div>
            )}

            {/* Description */}
            {item.description && (
              <p className="text-xs text-stone-600 italic">{item.description}</p>
            )}

            {/* Better choices */}
            {siblingItems && siblingItems.length > 0 && (
              <BetterChoices currentItem={item} siblingItems={siblingItems} />
            )}
          </div>
        )}

        {/* Expand toggle */}
        {hasNutrition && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-xs text-teal-600 hover:text-teal-700 font-medium"
          >
            {expanded ? 'Show less' : 'More details'}
          </button>
        )}

        {/* Action buttons */}
        <div className="mt-3 flex gap-2">
          <button
            className={`flex-1 h-10 flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              addingToMeal
                ? 'bg-green-500 text-white'
                : 'bg-teal-600 hover:bg-teal-700 text-white shadow-sm'
            }`}
            onClick={handleAddToMeal}
          >
            {addingToMeal ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                </svg>
                Added
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Add to Meal
              </>
            )}
          </button>

          {onCompare && (
            <button
              className="h-10 px-3 flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium border border-stone-300 text-stone-700 hover:bg-stone-50 transition-colors"
              onClick={() => onCompare(item)}
              aria-label={`Compare ${item.name}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Compare
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
