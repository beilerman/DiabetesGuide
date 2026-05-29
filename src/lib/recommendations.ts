import type { MenuItemWithNutrition } from './types'
import { computeScore } from './grade'

/**
 * Pure recommendation logic for "lower-carb at this restaurant" suggestions.
 *
 * Extracted out of `BetterChoices.tsx` so it can be unit-tested without
 * React and called by scripts/agents that want to surface alternatives
 * (e.g., the future trip-plan optimizer, an offline export, or an LLM
 * agent reasoning about meals).
 */

export interface RankedRecommendation {
  item: MenuItemWithNutrition
  score: number
}

export interface FindBetterChoicesOpts {
  /** Maximum number of recommendations to return. Default 2. */
  limit?: number
}

/**
 * Score one item using the project's nutrition-score formula. Returns null
 * when the item has no nutrition data attached.
 */
export function scoreMenuItem(item: MenuItemWithNutrition): number | null {
  const nd = item.nutritional_data?.[0]
  if (!nd) return null
  return computeScore({
    calories: nd.calories,
    carbs: nd.carbs,
    fat: nd.fat,
    protein: nd.protein,
    sugar: nd.sugar,
    fiber: nd.fiber,
    sodium: nd.sodium,
    alcoholGrams: nd.alcohol_grams,
    category: item.category,
  })
}

/**
 * Find the top `limit` (default 2) sibling items that score strictly higher
 * than the current item. Excludes the current item itself, skips siblings
 * without nutrition data, and breaks ties deterministically by score (no
 * secondary tiebreaker — equal-score items hold their input order).
 *
 * Returns an empty array when:
 *   - the current item has no nutrition data (we can't rank against it)
 *   - no sibling outscores the current item
 */
export function findBetterChoices(
  currentItem: MenuItemWithNutrition,
  siblings: MenuItemWithNutrition[],
  opts: FindBetterChoicesOpts = {},
): RankedRecommendation[] {
  const limit = opts.limit ?? 2
  const currentScore = scoreMenuItem(currentItem)
  if (currentScore == null) return []

  return siblings
    .filter((item) => item.id !== currentItem.id)
    .map((item) => ({ item, score: scoreMenuItem(item) }))
    .filter((entry): entry is RankedRecommendation =>
      entry.score != null && entry.score > currentScore,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
