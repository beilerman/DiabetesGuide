/**
 * trust.ts — Carb-trust predicates shared by the quality report and tests.
 *
 * Definition v2 (2026-06-09): a carb value is "dosing-grade" only when its
 * confidence_score >= 70 — the same threshold the app UI uses before it stops
 * telling users "do not dose from this value" (src/lib/nutrition-trust.ts).
 * The old source-OR-confidence definition is kept as "sourced" for series
 * continuity in quality-history.json.
 */

export const TRUSTED_CONFIDENCE = 70
export const TRUST_DEFINITION = 'confidence>=70 (v2)'

/** Old (v1) definition kept for the continuity series. */
export const SOURCED_SOURCES = new Set(['official', 'api_lookup'])

/**
 * Dosing-grade: the only tier the app presents without a "do not dose" caution.
 */
export function isDosingGrade(carbs: number | null, confidenceScore: number | null): boolean {
  return carbs != null && (confidenceScore ?? 0) >= TRUSTED_CONFIDENCE
}

/**
 * Legacy v1 "trusted" definition (authoritative source OR high confidence).
 * Reported as sourcedCarbsPct so the pre-realignment history remains comparable.
 */
export function isSourced(
  carbs: number | null,
  source: string | null,
  confidenceScore: number | null,
): boolean {
  if (carbs == null) return false
  return SOURCED_SOURCES.has(source ?? '') || (confidenceScore ?? 0) >= TRUSTED_CONFIDENCE
}

// ---- Priority slice (campaign target: entrees + desserts at top destinations) ----

export const TOP_DESTINATIONS = /walt disney world|universal orlando|disneyland/i
const PRIORITY_CATEGORIES = new Set(['entree', 'dessert'])

/**
 * True when an item belongs to the campaign's priority slice: an entree or
 * dessert at one of the top three destinations (by park location).
 */
export function isPrioritySliceItem(category: string | null, parkLocation: string | null): boolean {
  if (!category || !PRIORITY_CATEGORIES.has(category)) return false
  return TOP_DESTINATIONS.test(parkLocation ?? '')
}

// ---- Verification-queue priority (dosing impact ordering) ----

const CATEGORY_WEIGHTS: Record<string, number> = {
  entree: 3,
  dessert: 3,
  snack: 2,
  side: 1,
  beverage: 0.5,
}

/**
 * Dosing-impact score for ordering the verification queue: destination tier
 * (top-3 destinations weigh 3x) x category weight (entrees/desserts highest,
 * beverages lowest) x carb magnitude (a 90g-carb platter matters more than a
 * 12g side, even when the current estimate is untrusted — magnitude is a proxy
 * for dosing consequence). Higher = research first.
 */
export function dosingPriorityScore(
  category: string | null,
  parkLocation: string | null,
  carbs: number | null,
): number {
  const destWeight = TOP_DESTINATIONS.test(parkLocation ?? '') ? 3 : 1
  const categoryWeight = CATEGORY_WEIGHTS[category ?? ''] ?? 1
  // 1..3, with unknown carbs treated as a modest 25g
  const carbFactor = 1 + Math.min(Math.max(carbs ?? 25, 0), 150) / 75
  return destWeight * categoryWeight * carbFactor
}
