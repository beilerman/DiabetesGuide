/**
 * Defense-in-depth sanity checks for nutrition values flowing into Supabase.
 *
 * Background: `MEMORY.md` documents a recurring "mg/kg confusion" pattern
 * where sodium came in 10x–1000x too high (440,000mg "Baked Brie",
 * 29,600mg "Juice"). Audit scripts catch these post-hoc, but the audit runs
 * daily — bad rows live in the DB for up to 24 hours and surface to users.
 *
 * Adding a guard at every ingestion script's write boundary makes the
 * mistake fail fast with a clear error. The DB CHECK constraints from
 * `migrate-constraints.ts` are the second line of defense; this guard
 * gives us a better error message than a generic PostgreSQL constraint
 * violation and works even before the constraints are applied.
 *
 * Limits chosen to mirror the constraints:
 *   - calories ≤ 5000 (matches `chk_calories_range`)
 *   - sodium   ≤ 6000 mg (theme-park max practical; brine-cured turkey leg
 *                         is ~5375mg per Disney's own published value)
 *   - sugar ≤ carbs and fiber ≤ carbs (impossible otherwise; mirrors
 *                                       `chk_sugar_lte_carbs`/`chk_fiber_lte_carbs`)
 *   - macros ≥ 0 (mirrors `chk_macros_non_negative`)
 */

export interface NutritionLike {
  calories?: number | null
  carbs?: number | null
  fat?: number | null
  protein?: number | null
  sugar?: number | null
  fiber?: number | null
  sodium?: number | null
}

export const SANITY_LIMITS = {
  MAX_CALORIES: 5000,
  MAX_SODIUM_MG: 6000,
} as const

export interface SanityViolation {
  field: string
  value: number
  limit: string
  message: string
}

/**
 * Return all sanity violations for a nutrition row. Empty array means safe to
 * insert. Use `assertSaneNutrition()` for a throwing variant.
 */
export function checkSaneNutrition(n: NutritionLike): SanityViolation[] {
  const out: SanityViolation[] = []

  if (n.calories != null && (n.calories < 0 || n.calories > SANITY_LIMITS.MAX_CALORIES)) {
    out.push({
      field: 'calories',
      value: n.calories,
      limit: `0..${SANITY_LIMITS.MAX_CALORIES}`,
      message: `calories ${n.calories} outside 0..${SANITY_LIMITS.MAX_CALORIES}`,
    })
  }
  if (n.sodium != null && (n.sodium < 0 || n.sodium > SANITY_LIMITS.MAX_SODIUM_MG)) {
    out.push({
      field: 'sodium',
      value: n.sodium,
      limit: `0..${SANITY_LIMITS.MAX_SODIUM_MG}mg`,
      message: `sodium ${n.sodium}mg outside 0..${SANITY_LIMITS.MAX_SODIUM_MG} (mg/kg confusion?)`,
    })
  }

  for (const field of ['carbs', 'fat', 'protein', 'sugar', 'fiber'] as const) {
    const v = n[field]
    if (v != null && v < 0) {
      out.push({ field, value: v, limit: '>= 0', message: `${field} ${v} is negative` })
    }
  }

  if (n.sugar != null && n.carbs != null && n.sugar > n.carbs) {
    out.push({
      field: 'sugar',
      value: n.sugar,
      limit: `<= carbs (${n.carbs})`,
      message: `sugar ${n.sugar}g exceeds carbs ${n.carbs}g — impossible`,
    })
  }
  if (n.fiber != null && n.carbs != null && n.fiber > n.carbs) {
    out.push({
      field: 'fiber',
      value: n.fiber,
      limit: `<= carbs (${n.carbs})`,
      message: `fiber ${n.fiber}g exceeds carbs ${n.carbs}g — impossible`,
    })
  }

  return out
}

/**
 * Throws when any sanity rule is violated. `label` is included in the message
 * so the caller can log which item failed (e.g., the menu item's name).
 */
export function assertSaneNutrition(n: NutritionLike, label = 'nutrition row'): void {
  const violations = checkSaneNutrition(n)
  if (violations.length === 0) return
  const messages = violations.map((v) => v.message).join('; ')
  throw new Error(`Sanity violation for ${label}: ${messages}`)
}
