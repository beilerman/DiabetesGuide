import { Link, useParams } from 'react-router-dom'
import { useMenuItem } from '../lib/queries'
import { getGradeForItem, GRADE_CONFIG } from '../lib/grade'
import { getDiabetesAnnotations } from '../lib/annotations'
import { cleanDisplayText, getDisplayCategory, getMenuItemDisplayName, hasUsableNutrition, formatMaybeNumber } from '../lib/display'
import { useMealCart } from '../hooks/useMealCart'
import { useFavorites } from '../hooks/useFavorites'
import { useCompare } from '../hooks/useCompare'
import { GradeBadge } from '../components/menu/GradeBadge'
import { AnnotationBadge } from '../components/menu/AnnotationBadge'
import { NutritionBadge } from '../components/menu/NutritionBadge'
import { sodiumColor, alcoholColor } from '../components/menu/nutrition-colors'
import { buildNutritionReportMailto, getNutritionTrust, type NutritionTrustSummary } from '../lib/nutrition-trust'

const categoryLabels: Record<string, string> = {
  beverage: 'Beverage',
  dessert: 'Dessert',
  entree: 'Entree',
  side: 'Side',
  snack: 'Snack',
}

export default function MenuItemDetail() {
  const { itemId } = useParams<{ itemId: string }>()
  const { data: item, isLoading } = useMenuItem(itemId)
  const { addItem } = useMealCart()
  const { isFavorite, toggle } = useFavorites()
  const { addToCompare } = useCompare()

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="h-4 w-32 rounded bg-stone-200 animate-pulse" />
        <div className="rounded-xl bg-white border border-stone-200 p-5 space-y-4 animate-pulse">
          <div className="h-7 w-3/4 rounded bg-stone-200" />
          <div className="h-4 w-1/2 rounded bg-stone-200" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-16 rounded bg-stone-100" />
            <div className="h-16 rounded bg-stone-100" />
          </div>
        </div>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-xl rounded-xl bg-white border border-stone-200 p-8 text-center">
        <h1 className="text-2xl font-bold text-stone-900">Item not found</h1>
        <p className="mt-2 text-sm text-stone-600">This menu item may have moved or been removed.</p>
        <Link to="/browse" className="mt-5 inline-flex rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
          Back to Browse
        </Link>
      </div>
    )
  }

  const displayName = getMenuItemDisplayName(item)
  const displayCategory = getDisplayCategory(item)
  const nutrition = hasUsableNutrition(item) ? item.nutritional_data?.[0] : undefined
  const trust = getNutritionTrust(nutrition)
  const carbs = nutrition?.carbs ?? null
  const calories = nutrition?.calories ?? null
  const fat = nutrition?.fat ?? null
  const sugar = nutrition?.sugar ?? null
  const protein = nutrition?.protein ?? null
  const fiber = nutrition?.fiber ?? null
  const sodium = nutrition?.sodium ?? null
  const alcoholGrams = nutrition?.alcohol_grams ?? null
  const netCarbs = carbs != null ? Math.max(0, carbs - (fiber ?? 0)) : null
  const { grade, colors } = getGradeForItem({
    calories,
    carbs,
    fat,
    protein,
    sugar,
    fiber,
    sodium,
    alcoholGrams,
  })
  const annotations = getDiabetesAnnotations({
    calories,
    carbs,
    sugar,
    fat,
    protein,
    fiber,
    sodium,
    alcoholGrams: alcoholGrams ?? 0,
    category: displayCategory,
    isFried: item.is_fried,
  })
  const favorite = isFavorite(item.id)
  const availabilityCount = item.availability_count ?? 1
  const availabilityRestaurants = item.availability_restaurants ?? []

  const addToMeal = () => {
    if (!nutrition) return
    addItem({
      id: item.id,
      name: displayName,
      carbs: carbs ?? 0,
      calories: calories ?? 0,
      fat: fat ?? 0,
      protein: protein ?? 0,
      sugar: sugar ?? 0,
      fiber: fiber ?? 0,
      sodium: sodium ?? 0,
      restaurant: availabilityCount > 1 ? `${availabilityCount} locations` : item.restaurant?.name,
      parkName: item.restaurant?.park?.name,
      nutritionConfidence: nutrition?.confidence_score,
      nutritionSource: nutrition?.source,
      nutritionSourceDetail: nutrition?.source_detail,
      nutritionAvailable: true,
    })
  }
  const reportHref = buildNutritionReportMailto(
    item,
    typeof window === 'undefined' ? undefined : window.location.href
  )

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link to="/browse" className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-800">
        <span aria-hidden="true">&larr;</span>
        Browse menu
      </Link>

      <div className="rounded-lg bg-amber-50 border border-amber-300 p-3">
        <p className="text-sm font-semibold text-amber-900">
          Educational tool only - not medical advice. Nutrition values may be estimated; confirm dosing decisions with your care plan.
        </p>
      </div>

      <article className="rounded-xl bg-white border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-stone-100">
          <div className="flex items-start gap-4">
            {nutrition ? (
              <GradeBadge grade={grade} size="lg" />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100 text-xs font-bold text-stone-500">
                N/A
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-stone-600">
                  {categoryLabels[displayCategory] ?? displayCategory}
                </span>
                {item.is_seasonal && <span className="rounded-full bg-purple-50 px-2 py-1 text-xs font-semibold text-purple-700">Seasonal</span>}
                {item.is_fried && <span className="rounded-full bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-700">Fried</span>}
                {item.is_vegetarian && <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">Vegetarian</span>}
              </div>
              <h1 className="mt-2 text-2xl font-bold leading-tight text-stone-950">{displayName}</h1>
              <p className="mt-1 text-sm text-stone-600">
                {availabilityCount > 1
                  ? `${availabilityCount} locations`
                  : item.restaurant?.name ?? 'Restaurant unavailable'}
                {item.restaurant?.park?.name ? ` | ${item.restaurant.park.name}` : ''}
              </p>
              {colors && (
                <p className="mt-2 text-sm font-semibold" style={{ color: colors.bg }}>
                  {GRADE_CONFIG[grade!].label}
                </p>
              )}
              <div className="mt-3">
                <TrustPill trust={trust} />
              </div>
            </div>
          </div>

          {trust.caution && (
            <div className={`mt-4 rounded-lg border p-3 ${trust.level === 'low' || trust.level === 'unavailable' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-teal-200 bg-teal-50 text-teal-900'}`}>
              <p className="text-sm font-semibold">{trust.label}</p>
              <p className="mt-1 text-sm">{trust.caution}</p>
              {trust.qualityWarnings.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {trust.qualityWarnings.map(warning => <li key={warning}>{warning}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addToMeal}
              disabled={!nutrition}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                nutrition
                  ? 'bg-teal-600 text-white hover:bg-teal-700'
                  : 'cursor-not-allowed bg-stone-200 text-stone-500'
              }`}
            >
              {nutrition ? 'Add to Meal' : 'Nutrition needed'}
            </button>
            <button
              type="button"
              onClick={() => toggle(item.id)}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:border-rose-300 hover:text-rose-700"
            >
              {favorite ? 'Remove Favorite' : 'Add Favorite'}
            </button>
            <button
              type="button"
              onClick={() => addToCompare(item)}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:border-teal-300 hover:text-teal-700"
            >
              Compare
            </button>
            <a
              href={reportHref}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:border-amber-400 hover:bg-amber-100"
            >
              Report nutrition issue
            </a>
          </div>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_0.8fr]">
          <section aria-labelledby="nutrition-heading">
            <h2 id="nutrition-heading" className="text-lg font-bold text-stone-900">Nutrition Details</h2>
            {nutrition ? (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Metric label="Carbs" value={formatMaybeNumber(carbs, 'g')} emphasis />
                  <Metric label="Net Carbs" value={formatMaybeNumber(netCarbs, 'g')} />
                  <Metric label="Calories" value={formatMaybeNumber(calories)} />
                  <Metric label="Sugar" value={formatMaybeNumber(sugar, 'g')} />
                  <Metric label="Protein" value={formatMaybeNumber(protein, 'g')} />
                  <Metric label="Fiber" value={formatMaybeNumber(fiber, 'g')} />
                  <Metric label="Fat" value={formatMaybeNumber(fat, 'g')} />
                  <Metric label="Sodium" value={formatMaybeNumber(sodium, 'mg')} />
                  <Metric label="Cholesterol" value={formatMaybeNumber(nutrition.cholesterol, 'mg')} />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <NutritionBadge label="Sodium" value={sodium} unit="mg" colorFn={sodiumColor} />
                  {alcoholGrams != null && alcoholGrams > 0 && (
                    <NutritionBadge label="Alcohol" value={alcoholGrams} unit="g" colorFn={alcoholColor} />
                  )}
                </div>

                {alcoholGrams != null && alcoholGrams > 0 && (
                  <p className="mt-2 text-xs text-purple-700">
                    About {(alcoholGrams / 14).toFixed(1)} standard drinks.
                  </p>
                )}
              </>
            ) : (
              <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-4">
                <p className="font-semibold text-stone-800">Nutrition unavailable</p>
                <p className="mt-1 text-sm text-stone-600">
                  This item does not have enough reliable nutrition data yet. It is not treated as a zero-carb or zero-calorie item.
                </p>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <section aria-labelledby="notes-heading">
              <h2 id="notes-heading" className="text-lg font-bold text-stone-900">Diabetes Notes</h2>
              {annotations.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {annotations.map((annotation, index) => (
                    <AnnotationBadge key={index} annotation={annotation} />
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-stone-600">No specific notes for this item.</p>
              )}
            </section>

            {item.description && (
              <section aria-labelledby="description-heading">
                <h2 id="description-heading" className="text-lg font-bold text-stone-900">Description</h2>
                <p className="mt-2 text-sm text-stone-700">{cleanDisplayText(item.description) || item.description}</p>
              </section>
            )}

            {item.allergens.length > 0 && (
              <section aria-labelledby="allergens-heading">
                <h2 id="allergens-heading" className="text-lg font-bold text-stone-900">Allergens</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.allergens.map(allergen => (
                    <span key={allergen.id} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold capitalize text-amber-800">
                      {allergen.allergen_type.replace('_', ' ')} ({allergen.severity.replace('_', ' ')})
                    </span>
                  ))}
                </div>
              </section>
            )}

            {availabilityRestaurants.length > 0 && (
              <section aria-labelledby="locations-heading">
                <h2 id="locations-heading" className="text-lg font-bold text-stone-900">Available At</h2>
                <p className="mt-2 text-sm text-stone-700">{availabilityRestaurants.join(', ')}</p>
              </section>
            )}

            {nutrition && (
              <section aria-labelledby="source-heading" className="rounded-lg bg-stone-50 p-3">
                <h2 id="source-heading" className="text-sm font-bold text-stone-900">Data Source</h2>
                <dl className="mt-2 grid gap-1 text-xs text-stone-600">
                  <SourceRow label="Source" value={trust.sourceLabel} />
                  {trust.confidenceLabel && <SourceRow label="Confidence" value={trust.confidenceLabel} />}
                  {trust.lastUpdatedLabel && <SourceRow label="Updated" value={trust.lastUpdatedLabel.replace('Last updated ', '')} />}
                  {nutrition.source_detail && <SourceRow label="Detail" value={nutrition.source_detail} />}
                </dl>
                <Link to="/methodology" className="mt-3 inline-flex text-xs font-semibold text-teal-700 hover:text-teal-800">
                  How nutrition data is sourced
                </Link>
              </section>
            )}
          </aside>
        </div>
      </article>
    </div>
  )
}

function TrustPill({ trust }: { trust: NutritionTrustSummary }) {
  const className = trust.level === 'verified'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : trust.level === 'estimated'
      ? 'border-teal-200 bg-teal-50 text-teal-800'
      : 'border-amber-200 bg-amber-50 text-amber-800'

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>
      {trust.label}
      {trust.confidenceLabel ? ` - ${trust.confidenceLabel}` : ''}
    </span>
  )
}

function SourceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="font-medium text-stone-500">{label}</dt>
      <dd className="text-right text-stone-700">{value}</dd>
    </div>
  )
}

function Metric({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${emphasis ? 'border-teal-200 bg-teal-50' : 'border-stone-200 bg-stone-50'}`}>
      <p className={`text-lg font-bold ${emphasis ? 'text-teal-800' : 'text-stone-900'}`}>{value}</p>
      <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
    </div>
  )
}
