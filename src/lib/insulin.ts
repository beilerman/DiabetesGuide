/**
 * Shared insulin bolus calculation.
 *
 * Single source of truth used by both the standalone estimator page and the
 * inline Meal calculator. Centralizing the math eliminates drift between the
 * two surfaces.
 *
 * IMPORTANT clinical note on activity adjustment:
 * The exercise/activity reduction is applied to the CARB BOLUS only,
 * not to the correction component. A user who is hyperglycemic before
 * exercise still needs the full correction; reducing both halves of the
 * dose simultaneously under-treats the high BG.
 *
 * This is an educational estimator. It is not a substitute for the user's
 * own clinical judgment, their provider's instructions, or an FDA-cleared
 * dosing device. There is no insulin-on-board awareness, no max-dose
 * enforcement, and no hypoglycemia override; consumers of this output are
 * expected to apply their own gates.
 */

export type ActivityLevel = 'none' | 'mod' | 'high'

export interface BolusInputs {
  /** Carbs being dosed for, in grams. */
  carbs: number
  /** Current blood glucose in mg/dL. Optional. */
  bg?: number | null
  /** Target blood glucose in mg/dL. Default 120. */
  target?: number
  /** Insulin-to-carb ratio (1 unit per N grams). */
  icr: number
  /** Correction factor (mg/dL drop per 1 unit). Optional. */
  cf?: number | null
  /** Activity level over the next ~2 hours. */
  activity?: ActivityLevel
}

export interface BolusResult {
  /** Carb bolus in units BEFORE the activity adjustment. */
  carbBolusRaw: number
  /** Carb bolus in units AFTER the activity adjustment. */
  carbBolus: number
  /** Correction component in units (negative if BG below target). */
  correction: number
  /** Activity reduction percentage (0/25/50). */
  activityPct: number
  /** Total estimated dose, floored at 0. */
  total: number
}

const ACTIVITY_PCT: Record<ActivityLevel, number> = {
  none: 0,
  mod: 0.25,
  high: 0.5,
}

/**
 * Returns null if required inputs are missing or invalid.
 * - icr must be > 0
 * - carbs must be a finite non-negative number
 *
 * Activity reduction is applied to the carb bolus first, then the correction
 * is added. Correction may be negative when BG < target.
 */
export function calculateBolus(inputs: BolusInputs): BolusResult | null {
  const { carbs, bg, target = 120, icr, cf, activity = 'none' } = inputs

  if (!Number.isFinite(carbs) || carbs < 0) return null
  if (!Number.isFinite(icr) || icr <= 0) return null

  const carbBolusRaw = carbs / icr
  const activityPct = ACTIVITY_PCT[activity] ?? 0
  const carbBolus = carbBolusRaw * (1 - activityPct)

  const correction =
    Number.isFinite(bg) && cf != null && Number.isFinite(cf) && cf > 0
      ? ((bg as number) - target) / cf
      : 0

  const total = Math.max(0, carbBolus + correction)

  return {
    carbBolusRaw: round1(carbBolusRaw),
    carbBolus: round1(carbBolus),
    correction: round1(correction),
    activityPct: Math.round(activityPct * 100),
    total: round1(total),
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
