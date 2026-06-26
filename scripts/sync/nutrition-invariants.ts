export interface NutritionRowNumbers {
  calories: number | null
  carbs: number | null
  fat: number | null
  protein: number | null
  sugar: number | null
  fiber: number | null
  sodium: number | null
  confidence_score: number
}

/**
 * Enforce physically-impossible-to-violate invariants on an already
 * range-clamped nutrition row at ingest time. Currently: fiber can never
 * exceed carbs (fiber is a subset of carbohydrate). When violated, fiber is
 * lowered to equal carbs (the maximum physically possible) rather than
 * dropped, and the row's confidence is left untouched. We deliberately do
 * NOT touch sugar>carbs here — per the audit's philosophy that signals an
 * undercounted (dosing-critical) carb value and must reach human review, not
 * be silently masked at ingest.
 */
export function enforceNutritionInvariants<T extends NutritionRowNumbers>(row: T): T {
  if (row.carbs !== null && row.fiber !== null && row.fiber > row.carbs) {
    return { ...row, fiber: row.carbs }
  }
  return row
}
