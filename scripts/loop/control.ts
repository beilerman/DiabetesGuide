/**
 * control.ts — Pure control core for the database-improvement loop.
 *
 * The loop repeatedly audits + enriches the catalog until it runs dry: every
 * function here is a pure transform over the current item set plus this
 * iteration's audit finding/action counts. No Supabase, no fs, no process, no
 * Date — those live in the (impure) driver, improve.ts. Keeping the control
 * logic pure makes the stop/continue decision and the per-iteration metrics
 * unit-testable in isolation, which matters because this loop governs how much
 * dosing-grade carb data reaches diabetic users.
 */

import type { Item } from '../audit/types.js'
import { nd } from '../audit/utils.js'
import { isDosingGrade, isPrioritySliceItem, dosingPriorityScore } from '../audit/trust.js'

export interface LoopMetrics {
  iteration: number
  totalItems: number
  highFindings: number
  mediumFindings: number
  lowFindings: number
  autoFixesApplied: number
  enrichedThisIteration: number
  dosingGradeCarbsPct: number
  hasCarbsPct: number
  caloriesPresentPct: number
  nullCaloriePct: number
  prioritySliceTotal: number
  prioritySliceDosing: number
  prioritySliceDosingPct: number
  gapItemCount: number
}

export interface LoopOptions {
  maxIterations: number
  minImprovementPct: number
  convergenceRounds: number
  enrichLimit: number
}

export const DEFAULT_LOOP_OPTIONS: LoopOptions = {
  maxIterations: 6,
  minImprovementPct: 0.5,
  convergenceRounds: 2,
  enrichLimit: 200,
}

export interface WorklistEntry {
  item: Item
  score: number
  reason: string
}

/** Round to 1 decimal place, guarding a zero denominator (→ 0). */
function pct(value: number, total: number): number {
  if (total === 0) return 0
  return Math.round((value / total) * 1000) / 10
}

/**
 * An item still needing work: no nutrition row, or carbs null, or carbs not
 * dosing-grade, or calories null.
 */
export function isGapItem(item: Item): boolean {
  const n = nd(item)
  return (
    n == null ||
    n.carbs == null ||
    !isDosingGrade(n.carbs, n.confidence_score) ||
    n.calories == null
  )
}

/** The most severe gap describing why an item is on the worklist. */
function gapReason(item: Item): string {
  const n = nd(item)
  if (n == null) return 'no nutrition row'
  if (n.carbs == null) return 'carbs missing'
  if (!isDosingGrade(n.carbs, n.confidence_score)) return 'carbs not dosing-grade'
  return 'calories missing'
}

/**
 * Gap items ordered by dosing-impact (dosingPriorityScore) descending. reason
 * describes the most severe gap for each item.
 */
export function buildEnrichmentWorklist(items: Item[]): WorklistEntry[] {
  return items
    .filter(isGapItem)
    .map((item) => ({
      item,
      score: dosingPriorityScore(
        item.category,
        item.restaurant?.park?.name ?? null,
        nd(item)?.carbs ?? null,
      ),
      reason: gapReason(item),
    }))
    .sort((a, b) => b.score - a.score)
}

/**
 * Pure snapshot from the current item set + this iteration's audit finding
 * counts and action counts.
 */
export function computeMetrics(
  items: Item[],
  ctx: {
    iteration: number
    findings: { high: number; medium: number; low: number }
    autoFixesApplied: number
    enrichedThisIteration: number
  },
): LoopMetrics {
  const totalItems = items.length

  let hasCarbs = 0
  let dosingGrade = 0
  let caloriesPresent = 0
  let nullCalorie = 0
  let prioritySliceTotal = 0
  let prioritySliceDosing = 0
  let gapItemCount = 0

  for (const item of items) {
    const n = nd(item)
    if (n && n.carbs != null) hasCarbs++
    const dg = isDosingGrade(n?.carbs ?? null, n?.confidence_score ?? null)
    if (dg) dosingGrade++
    if (n != null && n.calories != null && n.calories > 0) caloriesPresent++
    if (n == null || n.calories == null) nullCalorie++
    if (isGapItem(item)) gapItemCount++

    if (isPrioritySliceItem(item.category, item.restaurant?.park?.name ?? null)) {
      prioritySliceTotal++
      if (dg) prioritySliceDosing++
    }
  }

  return {
    iteration: ctx.iteration,
    totalItems,
    highFindings: ctx.findings.high,
    mediumFindings: ctx.findings.medium,
    lowFindings: ctx.findings.low,
    autoFixesApplied: ctx.autoFixesApplied,
    enrichedThisIteration: ctx.enrichedThisIteration,
    dosingGradeCarbsPct: pct(dosingGrade, totalItems),
    hasCarbsPct: pct(hasCarbs, totalItems),
    caloriesPresentPct: pct(caloriesPresent, totalItems),
    nullCaloriePct: pct(nullCalorie, totalItems),
    prioritySliceTotal,
    prioritySliceDosing,
    prioritySliceDosingPct: pct(prioritySliceDosing, prioritySliceTotal),
    gapItemCount,
  }
}

export interface ContinueDecision {
  continue: boolean
  reason: string
}

/**
 * Loop-until-dry controller. Stop when: reached maxIterations; no gaps AND no
 * HIGH findings; or `convergenceRounds` consecutive iterations each improved
 * dosingGradeCarbsPct by < minImprovementPct AND did not reduce HIGH findings.
 */
export function decideContinue(history: LoopMetrics[], opts: LoopOptions): ContinueDecision {
  if (history.length === 0) return { continue: true, reason: 'starting' }

  const last = history[history.length - 1]!

  if (last.iteration >= opts.maxIterations) {
    return { continue: false, reason: `reached max iterations (${opts.maxIterations})` }
  }

  if (last.gapItemCount === 0 && last.highFindings === 0) {
    return { continue: false, reason: 'no gaps or HIGH findings remain' }
  }

  // Count trailing non-improving iterations, walking from the end.
  let nonImproving = 0
  for (let i = history.length - 1; i > 0; i--) {
    const curr = history[i]!
    const prev = history[i - 1]!
    const improved =
      curr.dosingGradeCarbsPct - prev.dosingGradeCarbsPct >= opts.minImprovementPct ||
      curr.highFindings < prev.highFindings
    if (improved) break
    nonImproving++
  }

  if (nonImproving >= opts.convergenceRounds) {
    return {
      continue: false,
      reason: `converged: ${nonImproving} rounds with < ${opts.minImprovementPct}% carb-trust gain and no HIGH reduction`,
    }
  }

  return { continue: true, reason: 'continuing' }
}

/**
 * Human-readable multi-line summary of the run (per-iteration deltas + final
 * stop reason placeholder).
 */
export function summarizeRun(history: LoopMetrics[]): string {
  const lines: string[] = []
  for (let i = 0; i < history.length; i++) {
    const m = history[i]!
    const prev = history[i - 1]
    const delta = prev ? m.dosingGradeCarbsPct - prev.dosingGradeCarbsPct : 0
    const sign = delta >= 0 ? '+' : ''
    lines.push(
      `iter ${m.iteration}: carb-trust ${m.dosingGradeCarbsPct.toFixed(1)}% (${sign}${delta.toFixed(1)}) | ` +
        `HIGH ${m.highFindings} MED ${m.mediumFindings} LOW ${m.lowFindings} | ` +
        `fixes ${m.autoFixesApplied} enriched ${m.enrichedThisIteration} | ` +
        `gaps ${m.gapItemCount}`,
    )
  }
  return lines.join('\n')
}
