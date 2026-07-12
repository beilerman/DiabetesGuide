/**
 * Pure estimation methods for the calibration harness (Phase 0 of the
 * unknown-food plan, docs/plans/2026-06-10-002).
 *
 * Each method produces an independent carb estimate for an item so the
 * harness can measure its error against chain-published ground truth.
 * Nothing here touches the DB — callers supply the pools.
 */
import { normalizeName } from '../scrapers/utils.js'

export interface OfficialRow {
  id: string
  name: string
  category: string
  carbs: number
  calories: number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Food-class classifier
//
// Anchored, specific-first patterns (historical lesson: /crisp/, /beer/, /wine/
// substring traps). An item that matches no class returns null — the chain
// estimator then declines to guess rather than guessing from a loose pool.
// ─────────────────────────────────────────────────────────────────────────────

const FOOD_CLASSES: Array<{ cls: string; pattern: RegExp; exclude?: RegExp }> = [
  // sweets & bakery (specific before generic)
  { cls: 'churro', pattern: /\bchurros?\b/i },
  { cls: 'pretzel', pattern: /\bpretzels?\b/i },
  { cls: 'donut', pattern: /\b(donuts?|doughnuts?)\b/i },
  { cls: 'cookie', pattern: /\bcookies?\b/i, exclude: /ice cream sandwich/i },
  { cls: 'brownie-bar', pattern: /\b(brownies?|blondies?|dessert bar)\b/i },
  { cls: 'cake-cupcake', pattern: /\b(cupcakes?|cheesecakes?|cake)\b/i, exclude: /pancake|funnel cake|crab ?cake/i },
  { cls: 'funnel-cake', pattern: /\bfunnel cakes?\b/i },
  { cls: 'pastry', pattern: /\b(muffins?|croissants?|danish|scones?|cinnamon rolls?|turnovers?|strudel)\b/i },
  { cls: 'ice-cream', pattern: /\b(ice cream|soft[- ]serve|sundaes?|gelato|sorbet|dole whip|frozen yogurt|froyo)\b/i },
  { cls: 'shake-float', pattern: /\b(milk ?shakes?|malts?|floats?)\b/i },
  // savory mains
  { cls: 'burger', pattern: /\b(cheeseburgers?|hamburgers?|burgers?)\b/i },
  { cls: 'pizza', pattern: /\b(pizzas?|flatbreads?)\b/i },
  { cls: 'hot-dog', pattern: /\b(hot ?dogs?|corn ?dogs?|footlongs?|bratwursts?)\b/i },
  { cls: 'chicken-tenders', pattern: /\b(tenders?|chicken strips?|nuggets?)\b/i },
  { cls: 'sandwich', pattern: /\b(sandwich(es)?|subs?|hoagies?|paninis?|melts?|blt)\b/i, exclude: /ice cream sandwich/i },
  { cls: 'wrap-taco', pattern: /\b(wraps?|tacos?|burritos?|quesadillas?)\b/i },
  { cls: 'pasta', pattern: /\b(pasta|spaghetti|fettuccine|penne|alfredo|lasagna|mac (and|&|n) cheese|macaroni)\b/i },
  { cls: 'bowl', pattern: /\b(rice bowl|poke bowl|grain bowl|bowls?)\b/i, exclude: /soup|chowder|chili/i },
  { cls: 'salad', pattern: /\bsalads?\b/i, exclude: /potato salad|pasta salad|macaroni salad|fruit salad/i },
  { cls: 'soup', pattern: /\b(soups?|chowders?|bisques?|chili)\b/i },
  // sides & snacks
  { cls: 'fries', pattern: /\b(french fries|fries|tater tots?|tots)\b/i },
  { cls: 'nachos', pattern: /\bnachos?\b/i },
  { cls: 'popcorn', pattern: /\bpopcorn\b/i },
  // drinks (specific before generic)
  { cls: 'coffee-drink', pattern: /\b(lattes?|mochas?|cappuccinos?|macchiatos?|frappuccinos?|cold brew|americanos?|espresso|coffee)\b/i },
  // Drink sub-classes are deliberately split: a coarse smoothie-juice class
  // mixed Starbucks Refreshers (~17g carbs) with smoothies (~70g) and
  // lemonades (~50g), and its class median produced live lemonade
  // undercounts. Thin pools decline (chainClassEstimate minPool) rather
  // than guess from the wrong analog.
  //
  // ORDER IS LOAD-BEARING (first match wins): format words before flavor
  // words, because compound names put the flavor first and the format last —
  // "Strawberry Lemonade Smoothie" is a smoothie (~70g), "Strawberry Açaí
  // Lemonade Refresher" is a refresher (~30g). Matching 'lemonade' first
  // would put both in the lemonade pool, recreating the undercount.
  { cls: 'refresher', pattern: /\brefreshers?\b/i },
  { cls: 'smoothie', pattern: /\bsmoothies?\b/i },
  { cls: 'lemonade', pattern: /\b(lemonades?|limeades?)\b/i },
  { cls: 'juice', pattern: /\bjuices?\b/i },
  { cls: 'tea-drink', pattern: /\b(teas?|chai|matcha)\b/i, exclude: /tea[- ]smoked|tea sandwich/i },
  { cls: 'soda', pattern: /\b(sodas?|cola|coke|sprite|root beer|dr\.? pepper)\b/i },
]

// Memoized: chainClassEstimate re-classifies the full official pool for every
// target (~pool² calls per calibration run), and pool names repeat across
// calls. One-shot CLI processes, so the cache is never evicted.
const classCache = new Map<string, string | null>()

/** Classify an item into a food class, or null when no anchored class fits. */
export function classifyFoodClass(name: string): string | null {
  const hit = classCache.get(name)
  if (hit !== undefined) return hit
  const n = name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  let result: string | null = null
  for (const { cls, pattern, exclude } of FOOD_CLASSES) {
    if (pattern.test(n) && !(exclude && exclude.test(n))) {
      result = cls
      break
    }
  }
  classCache.set(name, result)
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// E3 — chain-class estimator
// ─────────────────────────────────────────────────────────────────────────────

export interface ChainClassEstimate {
  carbs: number
  cls: string
  poolSize: number
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Estimate carbs for an item from the distribution of official chain rows in
 * the same food class. Leave-one-out: the target row and identically-named
 * siblings are excluded from the pool. Declines (null) when the class is
 * unknown or the pool has fewer than `minPool` independent rows.
 */
export function chainClassEstimate(
  target: { id: string; name: string },
  officialPool: OfficialRow[],
  minPool = 5,
): ChainClassEstimate | null {
  const cls = classifyFoodClass(target.name)
  if (!cls) return null
  const targetNorm = normalizeName(target.name)
  const pool = officialPool.filter(
    (r) => r.id !== target.id && normalizeName(r.name) !== targetNorm && classifyFoodClass(r.name) === cls,
  )
  if (pool.length < minPool) return null
  const carbs = median(pool.map((r) => r.carbs).sort((a, b) => a - b))
  return { carbs: Math.round(carbs), cls, poolSize: pool.length }
}

// ─────────────────────────────────────────────────────────────────────────────
// E1 prerequisite — carb-fraction table
//
// For each food class, the distribution of carb calories as a fraction of
// total calories (carbs*4 / calories) across official rows. A tight IQR means
// an official menu-board calorie count pins carbs for that class; a wide one
// means E1 can only bound, not estimate.
// ─────────────────────────────────────────────────────────────────────────────

export interface CarbFractionRow {
  cls: string
  n: number
  medianFrac: number
  p25: number
  p75: number
  /** Carb spread (g) this fraction-IQR implies for a typical item of this
   * class at its median calories — the practical E1 error bar. */
  impliedCarbSpreadAtMedianCal: number
}

export function buildCarbFractionTable(officialPool: OfficialRow[], minN = 10): CarbFractionRow[] {
  const byClass = new Map<string, Array<{ frac: number; calories: number }>>()
  for (const r of officialPool) {
    if (r.calories == null || r.calories < 50) continue // tiny/zero-cal rows make fractions meaningless
    const cls = classifyFoodClass(r.name)
    if (!cls) continue
    const frac = (r.carbs * 4) / r.calories
    if (frac < 0 || frac > 1.5) continue // data error guard
    let list = byClass.get(cls)
    if (!list) byClass.set(cls, (list = []))
    list.push({ frac, calories: r.calories })
  }

  const rows: CarbFractionRow[] = []
  for (const [cls, list] of byClass) {
    if (list.length < minN) continue
    const fracs = list.map((x) => x.frac).sort((a, b) => a - b)
    const cals = list.map((x) => x.calories).sort((a, b) => a - b)
    const q = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))]
    const p25 = q(fracs, 0.25)
    const p75 = q(fracs, 0.75)
    const medCal = median(cals)
    rows.push({
      cls,
      n: list.length,
      medianFrac: round3(median(fracs)),
      p25: round3(p25),
      p75: round3(p75),
      impliedCarbSpreadAtMedianCal: Math.round(((p75 - p25) * medCal) / 4),
    })
  }
  return rows.sort((a, b) => a.impliedCarbSpreadAtMedianCal - b.impliedCarbSpreadAtMedianCal)
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000
}

// ─────────────────────────────────────────────────────────────────────────────
// Agreement analysis
// ─────────────────────────────────────────────────────────────────────────────

/** Two estimates agree when they are within max(8g, 15% of their mean). */
export function estimatesAgree(a: number, b: number): boolean {
  const mean = (a + b) / 2
  return Math.abs(a - b) <= Math.max(8, 0.15 * mean)
}
