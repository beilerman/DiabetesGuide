import { memo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { MenuItemWithNutrition, MealItem } from '../../lib/types'
import { getGradeForItem } from '../../lib/grade'
import { getDiabetesAnnotations, type Annotation } from '../../lib/annotations'
import { getDisplayCategory, getMenuItemDisplayName, hasUsableNutrition } from '../../lib/display'
import { GradeBadge } from './GradeBadge'
import { DotMeter } from './DotMeter'
import {
  getActiveCertificationTier,
  isNutritionDosingGrade,
} from '../../lib/nutrition-trust'

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

/**
 * The card shows ONE trust/annotation line (spec 2026-07-12 §4): a high-risk
 * annotation wins, then the estimate caution, then a positive/info note. Full
 * warning detail lives on the item detail page and meal builder, where dosing
 * decisions actually happen. Estimated data additionally keeps the ~ marker on
 * the grade badge, so the estimate signal survives even when a risk note takes
 * the line.
 */
function pickTrustLine(
  topAnnotation: Annotation | null,
  isEstimate: boolean,
): { text: string; tone: 'risk' | 'info' } | null {
  if (topAnnotation && topAnnotation.severity !== 'green') return { text: topAnnotation.text, tone: 'risk' }
  if (isEstimate) return { text: 'Estimate — check details before dosing', tone: 'risk' }
  if (topAnnotation) return { text: topAnnotation.text, tone: 'info' }
  return null
}

function MenuItemCardImpl({ item, onAddToMeal, isFavorite, onToggleFavorite, onCompare, themeColor }: Props) {
  const [addingToMeal, setAddingToMeal] = useState(false)
  const [favoriteNotice, setFavoriteNotice] = useState<string | null>(null)

  const displayName = getMenuItemDisplayName(item)
  const displayCategory = getDisplayCategory(item)
  const rawNutrition = item.nutritional_data?.[0]
  const hasNutrition = hasUsableNutrition(item)
  const nd = hasNutrition ? rawNutrition : undefined
  const carbs = nd?.carbs ?? null
  const calories = nd?.calories ?? null
  const fat = nd?.fat ?? null
  const sugar = nd?.sugar ?? null
  const protein = nd?.protein ?? null
  const fiber = nd?.fiber ?? null
  const sodium = nd?.sodium ?? null
  const alcoholGrams = nd?.alcohol_grams ?? null
  const netCarbs = carbs != null && fiber != null ? Math.max(0, carbs - fiber) : carbs
  const availabilityCount = item.availability_count ?? 1
  const availabilityRestaurants = item.availability_restaurants ?? []
  const hasMultipleLocations = availabilityCount > 1
  const isLowConfidenceNutrition = Boolean(nd && !isNutritionDosingGrade(nd))

  const { grade } = getGradeForItem({
    calories, carbs, fat, protein, sugar, fiber, sodium,
    alcoholGrams,
  })

  const annotations = getDiabetesAnnotations({
    calories, carbs, sugar, fat, protein, fiber, sodium,
    alcoholGrams: alcoholGrams ?? 0,
    category: displayCategory,
    isFried: item.is_fried,
    confidenceScore: nd?.confidence_score,
  })
  const topAnnotation = annotations[0] ?? null
  const trustLine = pickTrustLine(topAnnotation, isLowConfidenceNutrition)

  const handleAddToMeal = () => {
    if (!hasNutrition) return
    setAddingToMeal(true)
    onAddToMeal({
      id: item.id,
      name: displayName,
      carbs: carbs ?? 0,
      calories: calories ?? 0,
      fat: fat ?? 0,
      protein: protein ?? 0,
      sugar: sugar ?? 0,
      fiber: fiber ?? 0,
      sodium: sodium ?? 0,
      restaurant: hasMultipleLocations ? `${availabilityCount} locations` : item.restaurant?.name,
      parkName: item.restaurant?.park?.name,
      nutritionConfidence: nd?.confidence_score,
      nutritionSource: nd?.source,
      nutritionSourceDetail: nd?.source_detail,
      nutritionAvailable: true,
      nutritionDosingGrade: isNutritionDosingGrade(nd),
      nutritionCertificationTier: getActiveCertificationTier(nd) ?? undefined,
    })
    setTimeout(() => setAddingToMeal(false), 600)
  }

  const handleFavorite = () => {
    const message = isFavorite ? 'Removed from favorites' : 'Added to favorites'
    onToggleFavorite(item.id)
    setFavoriteNotice(message)
    window.setTimeout(() => setFavoriteNotice(null), 1400)
  }

  const borderColor = themeColor ?? '#0d9488'

  // Stretched-link pattern: the title is the single real link, and its
  // ::before pseudo-element overlays the whole card so any non-interactive
  // area still navigates to details. Interactive children (favorite, buttons,
  // explicit links) sit above it via `relative z-10`. This keeps whole-card
  // click without nesting buttons/links inside a role="link" container.
  return (
    <div
      className="relative rounded-2xl bg-white shadow-soft overflow-hidden transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg"
      style={{ borderLeft: `3px solid ${borderColor}` }}
    >
      <div className="p-4">
        {/* Top row: Grade badge + name + favorite */}
        <div className="flex items-start gap-3">
          <GradeBadge grade={grade} size="md" estimated={isLowConfidenceNutrition} />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold text-stone-900 leading-tight">
                <Link
                  to={`/item/${item.id}`}
                  className="rounded-sm before:absolute before:inset-0 before:content-[''] focus:outline-none focus-visible:underline"
                >
                  {displayName}
                </Link>
              </h3>
              <button
                type="button"
                onClick={handleFavorite}
                className="relative z-10 flex-shrink-0 w-11 h-11 -my-1.5 -mr-1.5 flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors"
                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <svg
                  className={`w-5 h-5 ${isFavorite ? 'fill-rose-500 stroke-rose-500' : 'fill-none stroke-stone-400'} ${favoriteNotice ? 'heart-pop' : ''}`}
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

            {/* Restaurant + category — one muted line, no pill */}
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-stone-500">
              {(item.restaurant || hasMultipleLocations) && (
                <>
                  <span className="truncate" title={hasMultipleLocations ? availabilityRestaurants.join(', ') : item.restaurant?.name}>
                    {hasMultipleLocations ? `${availabilityCount} locations` : item.restaurant?.name}
                  </span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <span className="capitalize">{displayCategory}</span>
            </div>
          </div>
        </div>

        {/* Hero nutrition row */}
        {hasNutrition ? (
          <div className="mt-3 flex items-end gap-4">
            {/* Carbs hero */}
            {carbs != null && (
              <div className="flex flex-col items-center">
                <span className="font-display text-3xl font-bold leading-none text-stone-900">{carbs}<span className="text-sm font-normal text-stone-500">g</span></span>
                <span className="mt-0.5 text-[11px] text-stone-500 uppercase tracking-wide">Carbs</span>
                <DotMeter value={carbs} max={80} colorFn={carbDots} label="Carbs" />
              </div>
            )}

            {/* Net carbs */}
            {fiber != null && fiber > 0 && netCarbs !== carbs && (
              <div
                className="flex flex-col items-center"
                title="Net carbs = carbs − fiber. Most people dose on total carbs unless their clinician says otherwise."
              >
                <span className="text-lg font-semibold text-teal-700">{netCarbs}<span className="text-xs font-normal text-teal-600">g</span></span>
                <span className="text-[11px] text-teal-600 uppercase tracking-wide">Net</span>
              </div>
            )}

            {/* Cal */}
            {calories != null && (
              <div className="flex flex-col items-center">
                <span className="text-lg font-semibold text-stone-700">{calories}</span>
                <span className="text-[11px] text-stone-500 uppercase tracking-wide">Cal</span>
              </div>
            )}

            {/* Sugar */}
            {sugar != null && sugar > 0 && (
              <div className="flex flex-col items-center">
                <span className="text-lg font-semibold text-stone-700">{sugar}<span className="text-xs font-normal text-stone-500">g</span></span>
                <span className="text-[11px] text-stone-500 uppercase tracking-wide">Sugar</span>
              </div>
            )}

            {/* Protein */}
            {protein != null && protein > 0 && (
              <div className="flex flex-col items-center">
                <span className="text-lg font-semibold text-stone-700">{protein}<span className="text-xs font-normal text-stone-500">g</span></span>
                <span className="text-[11px] text-stone-500 uppercase tracking-wide">Protein</span>
              </div>
            )}

            {/* Alcohol */}
            {alcoholGrams != null && alcoholGrams > 0 && (
              <div className="flex flex-col items-center">
                <span className="text-lg font-semibold text-purple-700">{alcoholGrams}<span className="text-xs font-normal text-purple-500">g</span></span>
                <span className="text-[11px] text-purple-500 uppercase tracking-wide">Alcohol</span>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <span className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm bg-stone-100 text-stone-500 border border-stone-200">
              Nutrition unavailable
            </span>
            <p className="mt-2 text-xs font-medium text-amber-800">
              Cannot add to meal totals until nutrition is available.
            </p>
          </div>
        )}

        {/* Single trust/annotation line (see pickTrustLine) */}
        {trustLine && (
          <p className={`mt-2 flex items-start gap-1 text-xs font-medium leading-snug ${trustLine.tone === 'risk' ? 'text-amber-800' : 'text-stone-500'}`}>
            <span aria-hidden="true">{trustLine.tone === 'risk' ? '⚠' : '✓'}</span>
            <span>{trustLine.text}</span>
          </p>
        )}

        {favoriteNotice && (
          <div className="mt-2 text-xs font-medium text-rose-600" aria-live="polite">
            {favoriteNotice}
          </div>
        )}

        {/* Action buttons */}
        <div className="relative z-10 mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={!hasNutrition}
            aria-label={!hasNutrition ? `Nutrition needed before adding ${displayName} to meal` : `Add ${displayName} to meal`}
            className={`h-10 flex items-center justify-center gap-1.5 rounded-full px-5 text-sm font-semibold transition-all duration-200 ${
              !hasNutrition
                ? 'bg-stone-200 text-stone-500 cursor-not-allowed'
                : addingToMeal
                ? 'bg-green-600 text-white'
                : 'bg-teal-600 hover:bg-teal-700 text-white shadow-sm'
            }`}
            onClick={(event) => {
              event.stopPropagation()
              handleAddToMeal()
            }}
          >
            {!hasNutrition ? (
              <>Nutrition needed</>
            ) : addingToMeal ? (
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
                Add
              </>
            )}
          </button>

          {onCompare && (
            <button
              type="button"
              className="h-10 w-10 flex items-center justify-center rounded-full border border-stone-300 text-stone-600 hover:bg-stone-100 transition-colors"
              onClick={(event) => {
                event.stopPropagation()
                onCompare(item)
              }}
              aria-label={`Compare ${displayName}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </button>
          )}

          <Link
            to={`/item/${item.id}`}
            className="ml-auto text-sm font-semibold text-teal-700 hover:text-teal-800"
          >
            Details <span aria-hidden="true">›</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

// Memoized: skip re-rendering a card when its props are unchanged (e.g. a
// parent filter/slider re-render re-rendering the whole list). Browse/ParkDetail
// render hundreds of these; the per-item derivations only recompute when this
// card's props actually change. The hook callbacks passed in are stable.
export const MenuItemCard = memo(MenuItemCardImpl)
