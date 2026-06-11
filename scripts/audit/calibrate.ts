/**
 * Confidence calibration back-test (multi-method).
 *
 * Measures each estimation method against GROUND TRUTH — chain-published
 * official rows (source='official', confidence>=85) — by hiding each row's
 * nutrition and estimating it from the evidence the method would have for an
 * unknown item. Leakage controls: the target row and identically-named
 * siblings are excluded from every pool.
 *
 * Methods (docs/plans/2026-06-10-002):
 *   keyword        — production sync estimator (Jaccard keyword copy)
 *   chain          — E3: median of official rows in the same food class
 *   decomposition  — E4: Groq llama-3.3-70b from name/category/description
 *                    (costs API calls; sampled, needs GROQ_API_KEY)
 *
 * Also emits:
 *   - the E1 carb-fraction table (per food class: how tightly an official
 *     calorie count pins carbs)
 *   - agreement analysis: when two independent methods agree within
 *     max(8g, 15%), is the combined estimate actually more accurate?
 *
 *   npx tsx scripts/audit/calibrate.ts                       # keyword + chain (free)
 *   npx tsx scripts/audit/calibrate.ts --all --sample 400    # + Groq decomposition
 *   npx tsx scripts/audit/calibrate.ts --method decomposition --sample 200
 */
import { writeFileSync } from 'node:fs'
import {
  estimateNutrition,
  extractKeywords,
  type NutritionPoolEntry,
} from '../sync/estimate-nutrition.js'
import type { MergedItem } from '../sync/merge.js'
import { normalizeName } from '../scrapers/utils.js'
import {
  chainClassEstimate,
  buildCarbFractionTable,
  estimatesAgree,
  type OfficialRow,
} from './calibration-methods.js'

export interface CalibrationPair {
  item: string
  predictedCarbs: number | null
  actualCarbs: number
  assignedConfidence: number | null
  category?: string
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

/** Per-category breakdown for bands with enough data to mean something. */
export function scoreByCategory(pairs: CalibrationPair[], minN = 30): Record<string, CalibrationMetrics> {
  const byCat = new Map<string, CalibrationPair[]>()
  for (const p of pairs) {
    if (!p.category) continue
    let list = byCat.get(p.category)
    if (!list) byCat.set(p.category, (list = []))
    list.push(p)
  }
  const out: Record<string, CalibrationMetrics> = {}
  for (const [cat, list] of byCat) {
    if (list.filter((p) => p.predictedCarbs != null).length >= minN) {
      out[cat] = scoreCalibrationPairs(list)
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

interface DbRow {
  id: string
  name: string
  category: string
  description: string | null
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

interface GroundTruthItem {
  id: string
  name: string
  category: string
  description: string | null
  carbs: number
  calories: number | null
}

async function runKeywordMethod(
  groundTruth: GroundTruthItem[],
  pool: NutritionPoolEntry[],
): Promise<CalibrationPair[]> {
  const pairs: CalibrationPair[] = []
  for (const gt of groundTruth) {
    const gtNorm = normalizeName(gt.name)
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
      category: gt.category,
    })
  }
  return pairs
}

function runChainMethod(groundTruth: GroundTruthItem[], officialPool: OfficialRow[]): CalibrationPair[] {
  return groundTruth.map((gt) => {
    const est = chainClassEstimate(gt, officialPool)
    return {
      item: gt.name,
      predictedCarbs: est?.carbs ?? null,
      actualCarbs: gt.carbs,
      assignedConfidence: null,
      category: gt.category,
    }
  })
}

async function runDecompositionMethod(
  groundTruth: GroundTruthItem[],
  sample: number,
): Promise<CalibrationPair[]> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    console.error('decomposition method requires GROQ_API_KEY in env — skipping')
    return []
  }
  const { default: Groq } = await import('groq-sdk')
  const groq = new Groq({ apiKey })

  // Deterministic sample: every Nth item (sorted by id upstream) spreads the
  // sample across chains without Math.random.
  const eligible = groundTruth.filter((g) => (g.description ?? '').trim().length >= 20)
  const step = Math.max(1, Math.floor(eligible.length / sample))
  const selected = eligible.filter((_, i) => i % step === 0).slice(0, sample)
  console.log(`decomposition: ${eligible.length} ground-truth items have descriptions; sampling ${selected.length}`)

  const pairs: CalibrationPair[] = []
  const BATCH = 5
  for (let i = 0; i < selected.length; i += BATCH) {
    const batch = selected.slice(i, i + BATCH)
    const itemList = batch
      .map((item, j) => `[${j + 1}] Name: ${item.name}\nCategory: ${item.category}\nDescription: ${item.description}`)
      .join('\n\n')
    // Mirrors the production E4 prompt (estimate-nutrition-ai.ts) so we
    // measure the estimator we actually ship.
    const prompt = `You are a nutritionist estimating nutrition facts for theme park food items. These are typically larger portions than home-cooked meals (1.5-2x standard restaurant portions).

For each item below, estimate nutrition per serving. Consider:
- Theme park portions are generous (burgers are 1/3-1/2 lb, fries are large, drinks are 20oz+)
- Fried items have significantly more fat and calories
- Desserts are often oversized (cupcakes ~500-800 cal, sundaes ~600-1000 cal)

Return ONLY valid JSON (no markdown, no code fences) with this exact structure:
{"items":[{"index":1,"calories":650,"carbs":45,"fat":35,"protein":28,"sugar":8,"fiber":3,"sodium":1200}]}

All values must be integers.

Items to estimate:
${itemList}`

    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a nutrition expert. Always respond with valid JSON only, no markdown formatting.' },
          { role: 'user', content: prompt },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
        max_tokens: 2048,
      })
      const text = completion.choices[0]?.message?.content || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null
      const entries: Array<{ index?: number; carbs?: number }> = Array.isArray(parsed?.items) ? parsed.items : []
      for (const item of batch) pairs.push({
        item: item.name,
        predictedCarbs: null,
        actualCarbs: item.carbs,
        assignedConfidence: 35,
        category: item.category,
      })
      for (const entry of entries) {
        const target = batch[Number(entry?.index) - 1]
        const carbs = Math.round(Number(entry?.carbs))
        if (target && Number.isFinite(carbs) && carbs >= 0 && carbs <= 500) {
          const pair = pairs.find((p) => p.item === target.name && p.predictedCarbs === null)
          if (pair) pair.predictedCarbs = carbs
        }
      }
    } catch (err) {
      console.error(`  batch ${i / BATCH + 1} failed:`, (err as Error).message)
      for (const item of batch) pairs.push({
        item: item.name, predictedCarbs: null, actualCarbs: item.carbs, assignedConfidence: 35, category: item.category,
      })
    }
    process.stdout.write(`\r  decomposition progress: ${Math.min(i + BATCH, selected.length)}/${selected.length}`)
    await new Promise((r) => setTimeout(r, 2200)) // ~27 req/min, under the 30/min cap
  }
  console.log()
  return pairs
}

interface AgreementReport {
  pair: string
  bothEstimated: number
  agreeN: number
  agree: CalibrationMetrics
  disagree: CalibrationMetrics
}

/** Does cross-method agreement predict accuracy? Score the mean of each pair
 * of estimates, split by whether the two methods agreed. */
export function analyzeAgreement(
  methods: Record<string, CalibrationPair[]>,
): AgreementReport[] {
  const names = Object.keys(methods)
  const reports: AgreementReport[] = []
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = methods[names[i]]
      const b = methods[names[j]]
      const bByItem = new Map(b.filter((p) => p.predictedCarbs != null).map((p) => [p.item, p]))
      const agreePairs: CalibrationPair[] = []
      const disagreePairs: CalibrationPair[] = []
      for (const pa of a) {
        if (pa.predictedCarbs == null) continue
        const pb = bByItem.get(pa.item)
        if (!pb) continue
        const combined: CalibrationPair = {
          item: pa.item,
          predictedCarbs: Math.round((pa.predictedCarbs + pb.predictedCarbs!) / 2),
          actualCarbs: pa.actualCarbs,
          assignedConfidence: null,
          category: pa.category,
        }
        if (estimatesAgree(pa.predictedCarbs, pb.predictedCarbs!)) agreePairs.push(combined)
        else disagreePairs.push(combined)
      }
      reports.push({
        pair: `${names[i]}+${names[j]}`,
        bothEstimated: agreePairs.length + disagreePairs.length,
        agreeN: agreePairs.length,
        agree: scoreCalibrationPairs(agreePairs),
        disagree: scoreCalibrationPairs(disagreePairs),
      })
    }
  }
  return reports
}

async function main() {
  const { createSupabaseClient, rootPath } = await import('./utils.js')
  const supabase = createSupabaseClient()

  const argv = process.argv.slice(2)
  const all = argv.includes('--all')
  const methodArgs = new Set(
    argv.flatMap((a, i) => (a === '--method' && argv[i + 1] ? [argv[i + 1]] : [])),
  )
  const sampleArg = argv.flatMap((a, i) => (a === '--sample' && argv[i + 1] ? [Number(argv[i + 1])] : []))[0] ?? 400
  const runKeyword = all || methodArgs.size === 0 || methodArgs.has('keyword')
  const runChain = all || methodArgs.size === 0 || methodArgs.has('chain')
  const runDecomp = all || methodArgs.has('decomposition')

  console.log('Fetching catalog (items + nutrition)…')
  const rows: DbRow[] = []
  const page = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('menu_items')
      .select(
        'id, name, category, description, nutritional_data(calories, carbs, fat, protein, sugar, fiber, sodium, source, confidence_score)',
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

  const pool: NutritionPoolEntry[] = []
  const officialPool: OfficialRow[] = []
  const groundTruth: GroundTruthItem[] = []
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
        id: row.id, name: row.name, category: row.category,
        calories: n.calories, carbs: n.carbs, fat: n.fat, protein: n.protein,
        sugar: n.sugar, fiber: n.fiber, sodium: n.sodium,
        keywords: extractKeywords(row.name),
      })
    }
    if (n.source === 'official' && (n.confidence_score ?? 0) >= 85 && n.carbs != null) {
      const gt = {
        id: row.id, name: row.name, category: row.category,
        description: row.description, carbs: n.carbs, calories: n.calories,
      }
      groundTruth.push(gt)
      officialPool.push({ id: gt.id, name: gt.name, category: gt.category, carbs: gt.carbs, calories: gt.calories })
    }
  }
  console.log(`Pool: ${pool.length} items with full core macros`)
  console.log(`Ground truth: ${groundTruth.length} official rows (conf >= 85)\n`)

  const methodPairs: Record<string, CalibrationPair[]> = {}
  if (runKeyword) {
    console.log('Running method: keyword…')
    methodPairs.keyword = await runKeywordMethod(groundTruth, pool)
  }
  if (runChain) {
    console.log('Running method: chain…')
    methodPairs.chain = runChainMethod(groundTruth, officialPool)
  }
  if (runDecomp) {
    console.log('Running method: decomposition (Groq)…')
    methodPairs.decomposition = await runDecompositionMethod(groundTruth, sampleArg)
  }

  const methods: Record<string, { overall: CalibrationMetrics; byCategory: Record<string, CalibrationMetrics> }> = {}
  for (const [name, pairs] of Object.entries(methodPairs)) {
    methods[name] = { overall: scoreCalibrationPairs(pairs), byCategory: scoreByCategory(pairs) }
    printMetrics(`METHOD ${name}`, methods[name].overall)
    for (const [cat, m] of Object.entries(methods[name].byCategory)) {
      console.log(`    ${cat}: MAE ${m.carbMAE}g, ±10g ${m.pctWithin10g}%, n=${m.estimated}`)
    }
  }

  const agreement = analyzeAgreement(methodPairs)
  for (const rep of agreement) {
    console.log(`\nAGREEMENT ${rep.pair}: both estimated ${rep.bothEstimated}, agree ${rep.agreeN}`)
    if (rep.agree.carbMAE != null) console.log(`  when AGREE:    MAE ${rep.agree.carbMAE}g, ±10g ${rep.agree.pctWithin10g}%, undercut ${rep.agree.severeUndercountPct}%`)
    if (rep.disagree.carbMAE != null) console.log(`  when DISAGREE: MAE ${rep.disagree.carbMAE}g, ±10g ${rep.disagree.pctWithin10g}%, undercut ${rep.disagree.severeUndercountPct}%`)
  }

  const carbFractionTable = buildCarbFractionTable(officialPool)
  console.log('\nE1 carb-fraction table (official rows; tighter spread = calorie anchor works):')
  for (const r of carbFractionTable) {
    console.log(`  ${r.cls.padEnd(16)} n=${String(r.n).padStart(4)} medianFrac=${r.medianFrac} IQR=[${r.p25},${r.p75}] → ±${r.impliedCarbSpreadAtMedianCal}g at median cal`)
  }

  const out = {
    date: new Date().toISOString().slice(0, 10),
    groundTruthSize: groundTruth.length,
    poolSize: pool.length,
    methods,
    agreement,
    carbFractionTable,
    note:
      'Leakage-controlled back-test: target item and identically-named siblings excluded from every pool. ' +
      'severeUndercountPct is the dosing-dangerous direction (published carbs exceed prediction by >=20g). ' +
      'Agreement = two methods within max(8g, 15%); the agree/disagree split tests whether triangulation earns confidence.',
  }
  const outPath = rootPath('audit', 'calibration-results.json')
  writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf-8')
  console.log(`\nWritten to ${outPath}`)
}

function printMetrics(label: string, m: CalibrationMetrics) {
  console.log(`\n${label}`)
  console.log(`  n=${m.n} estimated=${m.estimated} (coverage ${m.coveragePct}%)`)
  if (m.carbMAE == null) {
    console.log('  no estimates')
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
