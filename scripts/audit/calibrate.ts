/**
 * Confidence calibration back-test.
 *
 * The catalog's confidence_score values are heuristic assignments (keyword
 * similarity * 0.8, fixed 35 for Groq, calorie-agreement tiers for USDA…),
 * not measured accuracy. This harness measures the keyword estimator against
 * GROUND TRUTH: chain-published official rows (source='official',
 * confidence>=85). For each official item we hide its nutrition, run the same
 * estimator the weekly sync uses, and compare the predicted carbs to the
 * published carbs.
 *
 * Leakage controls: the target item itself and every pool entry with the same
 * normalized name are excluded from the matching pool (otherwise a Starbucks
 * latte would "predict" itself from an identical-name sibling).
 *
 *   npx tsx scripts/audit/calibrate.ts            # run + write audit/calibration-results.json
 *
 * The output is the evidence for setting estimator confidence caps: if
 * estimates assigned confidence >=50 are not overwhelmingly within ±10g carbs,
 * those numbers must not be allowed near the dosing-grade bar (70).
 */
import { writeFileSync } from 'node:fs'
import {
  estimateNutrition,
  extractKeywords,
  type NutritionPoolEntry,
} from '../sync/estimate-nutrition.js'
import type { MergedItem } from '../sync/merge.js'
import { normalizeName } from '../scrapers/utils.js'

export interface CalibrationPair {
  item: string
  predictedCarbs: number | null
  actualCarbs: number
  assignedConfidence: number | null
}

export interface CalibrationMetrics {
  n: number
  estimated: number
  coveragePct: number
  carbMAE: number | null
  carbMedianAE: number | null
  pctWithin5g: number | null
  pctWithin10g: number | null
  pctWithin20pct: number | null
  /** % of estimates where the published carbs exceed the prediction by >=20g —
   * the dangerous direction: a user doses for fewer carbs than they eat. */
  severeUndercountPct: number | null
  /** carb MAE expressed as insulin units at a 10g/unit carb ratio. */
  doseErrorUnitsAtICR10: number | null
}

export function scoreCalibrationPairs(pairs: CalibrationPair[]): CalibrationMetrics {
  const n = pairs.length
  const withPrediction = pairs.filter((p) => p.predictedCarbs != null)
  const estimated = withPrediction.length
  if (estimated === 0) {
    return {
      n, estimated, coveragePct: 0,
      carbMAE: null, carbMedianAE: null,
      pctWithin5g: null, pctWithin10g: null, pctWithin20pct: null,
      severeUndercountPct: null, doseErrorUnitsAtICR10: null,
    }
  }
  const absErrors = withPrediction
    .map((p) => Math.abs(p.predictedCarbs! - p.actualCarbs))
    .sort((a, b) => a - b)
  const mae = absErrors.reduce((s, e) => s + e, 0) / estimated
  const median = absErrors[Math.floor(estimated / 2)]
  const within = (g: number) =>
    (withPrediction.filter((p) => Math.abs(p.predictedCarbs! - p.actualCarbs) <= g).length / estimated) * 100
  const within20pct =
    (withPrediction.filter((p) => {
      if (p.actualCarbs === 0) return p.predictedCarbs === 0
      return Math.abs(p.predictedCarbs! - p.actualCarbs) / p.actualCarbs <= 0.2
    }).length / estimated) * 100
  const severeUndercount =
    (withPrediction.filter((p) => p.actualCarbs - p.predictedCarbs! >= 20).length / estimated) * 100

  return {
    n,
    estimated,
    coveragePct: round1((estimated / n) * 100),
    carbMAE: round1(mae),
    carbMedianAE: round1(median),
    pctWithin5g: round1(within(5)),
    pctWithin10g: round1(within(10)),
    pctWithin20pct: round1(within20pct),
    severeUndercountPct: round1(severeUndercount),
    doseErrorUnitsAtICR10: round1(mae / 10),
  }
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

interface DbRow {
  id: string
  name: string
  category: string
  nutritional_data: Array<{
    calories: number | null
    carbs: number | null
    fat: number | null
    protein: number | null
    sugar: number | null
    fiber: number | null
    sodium: number | null
    source: string | null
    confidence_score: number | null
  }>
}

async function main() {
  const { createSupabaseClient, rootPath } = await import('./utils.js')
  const supabase = createSupabaseClient()

  console.log('Fetching catalog (items + nutrition)…')
  const rows: DbRow[] = []
  const page = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('menu_items')
      .select(
        'id, name, category, nutritional_data(calories, carbs, fat, protein, sugar, fiber, sodium, source, confidence_score)',
      )
      .order('id')
      .range(from, from + page - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...(data as unknown as DbRow[]))
    if (data.length < page) break
    from += page
  }
  console.log(`Fetched ${rows.length} items`)

  // Pool: every item with full numeric core macros (what production matching uses).
  const pool: NutritionPoolEntry[] = []
  const groundTruth: Array<{ id: string; name: string; category: string; carbs: number }> = []
  for (const row of rows) {
    const n = Array.isArray(row.nutritional_data) ? row.nutritional_data[0] : row.nutritional_data
    if (!n) continue
    if (
      typeof n.calories === 'number' &&
      typeof n.carbs === 'number' &&
      typeof n.fat === 'number' &&
      typeof n.protein === 'number'
    ) {
      pool.push({
        id: row.id,
        name: row.name,
        category: row.category,
        calories: n.calories,
        carbs: n.carbs,
        fat: n.fat,
        protein: n.protein,
        sugar: n.sugar,
        fiber: n.fiber,
        sodium: n.sodium,
        keywords: extractKeywords(row.name),
      })
    }
    if (n.source === 'official' && (n.confidence_score ?? 0) >= 85 && n.carbs != null) {
      groundTruth.push({ id: row.id, name: row.name, category: row.category, carbs: n.carbs })
    }
  }
  console.log(`Pool: ${pool.length} items with full core macros`)
  console.log(`Ground truth: ${groundTruth.length} official rows (conf >= 85)\n`)

  const pairs: CalibrationPair[] = []
  for (const gt of groundTruth) {
    const gtNorm = normalizeName(gt.name)
    // Leakage control: drop the item itself and all identically-named siblings.
    const candidatePool = pool.filter((p) => p.id !== gt.id && normalizeName(p.name) !== gtNorm)
    const mergedItem = {
      itemName: gt.name,
      category: gt.category,
      restaurantName: '',
      parkName: '',
      sources: [],
      confidence: 100,
      isNew: true,
    } as unknown as MergedItem
    const est = estimateNutrition(mergedItem, candidatePool)
    pairs.push({
      item: gt.name,
      predictedCarbs: est?.carbs ?? null,
      actualCarbs: gt.carbs,
      assignedConfidence: est?.confidence ?? null,
    })
  }

  const overall = scoreCalibrationPairs(pairs)
  const bands: Array<[string, (c: number | null) => boolean]> = [
    ['conf < 50 (deferred for review)', (c) => c != null && c < 50],
    ['conf 50-64 (auto-approvable)', (c) => c != null && c >= 50 && c < 65],
    ['conf 65 (at cap)', (c) => c != null && c >= 65],
  ]
  const byBand = bands.map(([label, test]) => ({
    band: label,
    metrics: scoreCalibrationPairs(pairs.filter((p) => p.predictedCarbs != null && test(p.assignedConfidence))),
  }))

  console.log('=== Keyword-estimator calibration vs chain-published ground truth ===')
  printMetrics('OVERALL', overall)
  for (const { band, metrics } of byBand) printMetrics(band, metrics)

  const out = {
    date: new Date().toISOString().slice(0, 10),
    method: 'keyword',
    groundTruthSize: groundTruth.length,
    poolSize: pool.length,
    overall,
    byConfidenceBand: byBand,
    note:
      'Leakage-controlled back-test: target item and identically-named siblings excluded from the matching pool. ' +
      'severeUndercountPct is the dosing-dangerous direction (published carbs exceed prediction by >=20g).',
  }
  const outPath = rootPath('audit', 'calibration-results.json')
  writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf-8')
  console.log(`\nWritten to ${outPath}`)
}

function printMetrics(label: string, m: CalibrationMetrics) {
  console.log(`\n${label}`)
  console.log(`  n=${m.n} estimated=${m.estimated} (coverage ${m.coveragePct}%)`)
  if (m.carbMAE == null) {
    console.log('  no estimates in this band')
    return
  }
  console.log(`  carb MAE: ${m.carbMAE}g (median ${m.carbMedianAE}g) — ~${m.doseErrorUnitsAtICR10}u at ICR 10`)
  console.log(`  within ±5g: ${m.pctWithin5g}%   within ±10g: ${m.pctWithin10g}%   within ±20%: ${m.pctWithin20pct}%`)
  console.log(`  severe undercount (>=20g low): ${m.severeUndercountPct}%`)
}

const isDirectRun =
  process.argv[1]?.endsWith('calibrate.ts') || process.argv[1]?.endsWith('calibrate.js')
if (isDirectRun) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
