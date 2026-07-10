/**
 * accuracy-eval.ts — leakage-controlled ACCURACY back-test for the improvement
 * loop, built on the shared estimation core (estimate-core.ts) so it measures
 * the EXACT keyword+chain triangulation the loop uses to enrich.
 *
 * The method: for every official chain-published ground-truth row (source
 * 'official', confidence >= 85, carbs != null), predict its carbs LEAVE-ONE-OUT
 * — the row's own id is excluded from both estimation pools so its published
 * value can never leak into its own prediction — then pair predicted vs actual.
 * Rows the method declines to estimate are still emitted with
 * predictedCarbs = null so coverage is measured honestly (they count toward `n`
 * but not toward the error stats).
 *
 * Pairs are scored by the audit harness's own scoreCalibrationPairs so the loop
 * and the calibration CLI report accuracy the same way.
 */
import type { Item } from '../audit/types.js'
import { nd } from '../audit/utils.js'
import { buildPools, triangulateCarbs } from './estimate-core.js'
import { scoreCalibrationPairs } from '../audit/calibrate.js'
import type { CalibrationPair, CalibrationMetrics } from '../audit/calibrate.js'

/**
 * Leakage-controlled accuracy back-test. For each official ground-truth item
 * (source==='official' && confidence_score>=85 && carbs != null), predict its
 * carbs with the SAME keyword+chain triangulation used to enrich, LEAVE-ONE-OUT
 * (excludeId = the item's own id so its own value can't leak into the prediction),
 * and pair predicted-vs-actual. Items the method declines to estimate are still
 * emitted with predictedCarbs=null so coverage is measured honestly.
 */
export function buildCalibrationPairs(items: Item[]): CalibrationPair[] {
  const pools = buildPools(items)
  const pairs: CalibrationPair[] = []
  for (const item of items) {
    const n = nd(item)
    if (!n) continue
    if (n.source !== 'official' || (n.confidence_score ?? 0) < 85 || n.carbs == null) continue
    const actualCarbs = n.carbs
    const est = triangulateCarbs(item, pools, item.id)
    pairs.push({
      item: item.name,
      predictedCarbs: est ? est.carbs : null,
      actualCarbs,
      assignedConfidence: est ? est.confidence : null,
      category: item.category,
    })
  }
  return pairs
}

/** buildCalibrationPairs + scoreCalibrationPairs. */
export function evaluateAccuracy(items: Item[]): CalibrationMetrics {
  return scoreCalibrationPairs(buildCalibrationPairs(items))
}
