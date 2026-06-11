/** One-off: score the Claude-decomposition calibration outputs against the
 * ground-truth answer key. No DB access. */
import { readFileSync } from 'node:fs'
import { scoreCalibrationPairs, type CalibrationPair } from './calibrate.js'

interface Est { id: string; carbs: number }
const key = new Map<string, number>(
  (JSON.parse(readFileSync('data/pending/claude-decomp-calibration-key.json', 'utf-8')) as Est[]).map((k) => [k.id, k.carbs]),
)
const blind = JSON.parse(readFileSync('data/pending/claude-decomp-calibration-blind.json', 'utf-8')) as Array<{ id: string; name: string; category: string }>
const catById = new Map(blind.map((b) => [b.id, b.category]))

const estimates: Est[] = []
for (const n of [1, 2, 3]) {
  try {
    estimates.push(...(JSON.parse(readFileSync(`data/pending/claude-decomp-calibration-out-${n}.json`, 'utf-8')) as Est[]))
  } catch {
    console.error(`slice ${n} missing/unreadable`)
  }
}

const seen = new Set<string>()
const pairs: CalibrationPair[] = []
for (const e of estimates) {
  if (!key.has(e.id) || seen.has(e.id)) continue
  seen.add(e.id)
  const carbs = Math.round(Number(e.carbs))
  pairs.push({
    item: e.id,
    predictedCarbs: Number.isFinite(carbs) && carbs >= 0 && carbs <= 500 ? carbs : null,
    actualCarbs: key.get(e.id)!,
    assignedConfidence: null,
    category: catById.get(e.id),
  })
}
// Items the agents skipped count against coverage
for (const [id, actual] of key) {
  if (!seen.has(id)) pairs.push({ item: id, predictedCarbs: null, actualCarbs: actual, assignedConfidence: null, category: catById.get(id) })
}

const overall = scoreCalibrationPairs(pairs)
console.log('Claude-decomposition vs ground truth:')
console.log(JSON.stringify(overall, null, 2))
const cats = ['beverage', 'entree', 'dessert', 'snack', 'side']
for (const c of cats) {
  const sub = pairs.filter((p) => p.category === c)
  if (sub.filter((p) => p.predictedCarbs != null).length >= 10) {
    const m = scoreCalibrationPairs(sub)
    console.log(`  ${c}: MAE ${m.carbMAE}g, ±10g ${m.pctWithin10g}%, undercut ${m.severeUndercountPct}%, n=${m.estimated}`)
  }
}
console.log('\nGroq baseline (measured): MAE 14.8g, ±10g 50.1%, undercut 9.3%')
console.log('Proceed bar: MAE <= 14.8g AND ±10g >= 50.1%')