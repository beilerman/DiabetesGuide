/**
 * improve.ts — Orchestrator for the database-improvement loop.
 *
 * Drives the audit + enrich loop that raises the share of dosing-grade carb
 * data in the catalog. All decision-making (metrics, convergence, worklist
 * ordering) lives in the pure control core (control.ts); this file only
 * composes it with the impure building blocks (Supabase reads/writes, the
 * audit passes, the auto-fix batcher, and the enricher CLIs).
 *
 * Three modes:
 *   1. --from-file=PATH  offline: load items from JSON, measure once, print. No DB.
 *   2. (default)         plan: live DB READ only, measure once, print. No writes.
 *   3. --apply           live DB: run the loop, apply auto-fixes + shell enrichers.
 *
 * All DB / side-effecting work is inside main(); importing the module is inert.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import {
  DEFAULT_LOOP_OPTIONS,
  buildEnrichmentWorklist,
  computeMetrics,
  decideContinue,
  summarizeRun,
} from './control.js'
import type { LoopMetrics, LoopOptions, WorklistEntry, ContinueDecision } from './control.js'
import { buildTargetedEstimates, applyTargetedEstimates } from './targeted-enrich.js'
import type { TargetedEstimate } from './targeted-enrich.js'
import { evaluateAccuracy } from './accuracy-eval.js'
import type { CalibrationMetrics } from '../audit/calibrate.js'
import { createSupabaseClient, fetchAllItems, rootPath } from '../audit/utils.js'
import { checkAccuracy } from '../audit/accuracy.js'
import { checkCompleteness } from '../audit/completeness.js'
import { buildFixBatch } from '../audit/auto-fix.js'
import type { Item, NutData, AuditFinding } from '../audit/types.js'

// ---- CLI config ----------------------------------------------------------

interface CliConfig {
  apply: boolean
  fromFile: string | null
  skipEnrich: boolean
  enrichers: string[]
  options: LoopOptions
}

const DEFAULT_ENRICHERS = ['targeted', 'nutritionix', 'edamam', 'triangulate', 'ai']

/**
 * Enrichers run cheapest / highest-confidence first. Only the names present in
 * the selected set run, but always in this fixed order. `targeted` runs first
 * and IN-PROCESS (corroborated carb-hole fills); the rest shell out.
 */
const ENRICHER_ORDER = ['targeted', 'nutritionix', 'usda', 'edamam', 'triangulate', 'ai'] as const

function parseNum(value: string, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function parseArgs(argv: string[]): CliConfig {
  const options: LoopOptions = { ...DEFAULT_LOOP_OPTIONS }
  let apply = false
  let fromFile: string | null = null
  let skipEnrich = false
  let enrichers = [...DEFAULT_ENRICHERS]

  for (const arg of argv) {
    if (arg === '--apply') apply = true
    else if (arg === '--skip-enrich') skipEnrich = true
    else if (arg.startsWith('--from-file=')) fromFile = arg.slice('--from-file='.length)
    else if (arg.startsWith('--max-iterations='))
      options.maxIterations = parseNum(arg.slice('--max-iterations='.length), options.maxIterations)
    else if (arg.startsWith('--enrich-limit='))
      options.enrichLimit = parseNum(arg.slice('--enrich-limit='.length), options.enrichLimit)
    else if (arg.startsWith('--min-improvement='))
      options.minImprovementPct = parseNum(arg.slice('--min-improvement='.length), options.minImprovementPct)
    else if (arg.startsWith('--convergence-rounds='))
      options.convergenceRounds = parseNum(arg.slice('--convergence-rounds='.length), options.convergenceRounds)
    else if (arg.startsWith('--enrichers='))
      enrichers = arg
        .slice('--enrichers='.length)
        .split(',')
        .map((e) => e.trim())
        .filter((e) => e.length > 0)
  }

  return { apply, fromFile, skipEnrich, enrichers, options }
}

/** Keep only requested enrichers, in the fixed cheapest-first order. */
function orderEnrichers(selected: string[]): string[] {
  return ENRICHER_ORDER.filter((name) => selected.includes(name))
}

// ---- Offline item normalization -----------------------------------------

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback
}

const NUTRITION_KEYS = [
  'calories',
  'carbs',
  'fat',
  'sugar',
  'protein',
  'fiber',
  'sodium',
  'cholesterol',
] as const

function asNutData(raw: Record<string, unknown>): NutData {
  return {
    id: asString(raw.id, 'unknown'),
    calories: numOrNull(raw.calories),
    carbs: numOrNull(raw.carbs),
    fat: numOrNull(raw.fat),
    sugar: numOrNull(raw.sugar),
    protein: numOrNull(raw.protein),
    fiber: numOrNull(raw.fiber),
    sodium: numOrNull(raw.sodium),
    cholesterol: numOrNull(raw.cholesterol),
    alcohol_grams: numOrNull(raw.alcohol_grams),
    source: asString(raw.source, 'crowdsourced'),
    confidence_score: numOrNull(raw.confidence_score),
  }
}

function hasFlatNutrition(raw: Record<string, unknown>): boolean {
  return NUTRITION_KEYS.some((k) => k in raw)
}

function normalizeRestaurant(raw: unknown): { name: string; park: { name: string } } {
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    let parkName = '?'
    if (r.park && typeof r.park === 'object') {
      parkName = asString((r.park as Record<string, unknown>).name, '?')
    }
    return { name: asString(r.name, '?'), park: { name: parkName } }
  }
  return { name: '?', park: { name: '?' } }
}

/**
 * Coerce a loosely-shaped record into an Item. Tolerates: nutritional_data as
 * an array, a single object, flat nutrition fields on the record, or absent;
 * and a missing restaurant/park.
 */
function normalizeItem(raw: Record<string, unknown>): Item {
  const ndRaw = raw.nutritional_data
  let nutritional_data: NutData[]
  if (Array.isArray(ndRaw)) {
    nutritional_data = ndRaw.map((entry) => asNutData((entry ?? {}) as Record<string, unknown>))
  } else if (ndRaw && typeof ndRaw === 'object') {
    nutritional_data = [asNutData(ndRaw as Record<string, unknown>)]
  } else if (hasFlatNutrition(raw)) {
    nutritional_data = [asNutData(raw)]
  } else {
    nutritional_data = []
  }

  return {
    id: asString(raw.id, 'unknown'),
    name: asString(raw.name, '?'),
    category: asString(raw.category, 'other'),
    is_vegetarian: raw.is_vegetarian === true,
    is_fried: raw.is_fried === true,
    description: typeof raw.description === 'string' ? raw.description : null,
    restaurant: normalizeRestaurant(raw.restaurant),
    nutritional_data,
  }
}

function loadItemsFromFile(path: string): Item[] {
  const raw = JSON.parse(readFileSync(path, 'utf-8'))
  let rawItems: unknown[]
  if (Array.isArray(raw)) {
    rawItems = raw
  } else if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).items)) {
    rawItems = (raw as Record<string, unknown>).items as unknown[]
  } else {
    rawItems = []
  }
  return rawItems.map((entry) => normalizeItem((entry ?? {}) as Record<string, unknown>))
}

// ---- Measurement ---------------------------------------------------------

function tallyFindings(findings: AuditFinding[]): { high: number; medium: number; low: number } {
  let high = 0
  let medium = 0
  let low = 0
  for (const f of findings) {
    if (f.severity === 'HIGH') high++
    else if (f.severity === 'MEDIUM') medium++
    else low++
  }
  return { high, medium, low }
}

/** One audit + completeness pass, folded into metrics + a worklist. */
function measure(
  items: Item[],
  iteration: number,
  autoFixesApplied: number,
): { metrics: LoopMetrics; worklist: WorklistEntry[]; autoFixCount: number } {
  const acc = checkAccuracy(items)
  const comp = checkCompleteness(items)
  const findings = tallyFindings([...acc.findings, ...comp.findings])
  const metrics = computeMetrics(items, {
    iteration,
    findings,
    autoFixesApplied,
    enrichedThisIteration: 0,
  })
  const worklist = buildEnrichmentWorklist(items)
  return { metrics, worklist, autoFixCount: acc.autoFixes.length }
}

// ---- Printing ------------------------------------------------------------

function printMetrics(m: LoopMetrics): void {
  console.log('METRICS')
  console.log(`  iteration:              ${m.iteration}`)
  console.log(`  totalItems:             ${m.totalItems}`)
  console.log(`  findings:               HIGH ${m.highFindings}  MEDIUM ${m.mediumFindings}  LOW ${m.lowFindings}`)
  console.log(`  autoFixesApplied:       ${m.autoFixesApplied}`)
  console.log(`  enrichedThisIteration:  ${m.enrichedThisIteration}`)
  console.log(`  dosingGradeCarbsPct:    ${m.dosingGradeCarbsPct}%`)
  console.log(`  hasCarbsPct:            ${m.hasCarbsPct}%`)
  console.log(`  caloriesPresentPct:     ${m.caloriesPresentPct}%`)
  console.log(`  nullCaloriePct:         ${m.nullCaloriePct}%`)
  console.log(`  prioritySliceTotal:     ${m.prioritySliceTotal}`)
  console.log(`  prioritySliceDosing:    ${m.prioritySliceDosing}`)
  console.log(`  prioritySliceDosingPct: ${m.prioritySliceDosingPct}%`)
  console.log(`  gapItemCount:           ${m.gapItemCount}`)
}

function printWorklist(worklist: WorklistEntry[], limit: number): void {
  const shown = Math.min(limit, worklist.length)
  console.log(`\nWORKLIST — top ${shown} of ${worklist.length} gap items (highest dosing impact first)`)
  worklist.slice(0, limit).forEach((entry, i) => {
    const restaurant = entry.item.restaurant?.name ?? '?'
    const park = entry.item.restaurant?.park?.name ?? '?'
    const rank = String(i + 1).padStart(2)
    console.log(
      `  ${rank}. ${entry.item.name} — ${restaurant} @ ${park} — score ${entry.score.toFixed(1)} — ${entry.reason}`,
    )
  })
}

function printTargetedPreview(estimates: TargetedEstimate[]): void {
  console.log(`\nTARGETED (corroborated) estimates that would be applied — ${estimates.length}`)
  if (estimates.length === 0) {
    console.log('  (none — no two methods agreed on a carb hole)')
    return
  }
  estimates.slice(0, 10).forEach((est) => {
    console.log(`  ${est.name} — carbs ${est.carbs}g (conf ${est.confidence}, ${est.method}) — ${est.reason}`)
  })
}

/**
 * ACCURACY back-test summary: how well the loop's own keyword+chain method
 * predicts the carbs of official ground-truth rows (leave-one-out). Distinct
 * from coverage — this is dose-error, not fill rate. Only non-null stats print.
 */
function printAccuracy(acc: CalibrationMetrics): void {
  console.log('\nACCURACY BACK-TEST (method vs official ground truth, leave-one-out)')
  if (acc.n === 0) {
    console.log('  (no official ground-truth rows to back-test)')
    return
  }
  console.log(`  ground-truth rows:      ${acc.n}`)
  console.log(`  predicted:              ${acc.estimated} (${acc.coveragePct}% coverage)`)
  if (acc.carbMAE != null) console.log(`  carb MAE:               ${acc.carbMAE.toFixed(1)}g`)
  if (acc.carbMedianAE != null) console.log(`  carb median AE:         ${acc.carbMedianAE.toFixed(1)}g`)
  if (acc.pctWithin10g != null) console.log(`  within 10g:             ${acc.pctWithin10g.toFixed(1)}%`)
  if (acc.severeUndercountPct != null) console.log(`  severe undercount:      ${acc.severeUndercountPct.toFixed(1)}%`)
  if (acc.doseErrorUnitsAtICR10 != null)
    console.log(`  dose error @ICR10:      ${acc.doseErrorUnitsAtICR10.toFixed(1)} units`)
}

function printPlan(selected: string[], enrichLimit: number, skipEnrich: boolean, label: string): void {
  console.log(`\n${label}`)
  if (skipEnrich) {
    console.log('  enrichers: (skipped via --skip-enrich)')
  } else if (selected.length === 0) {
    console.log('  enrichers: (none selected)')
  } else {
    console.log(`  enrichers (in order): ${selected.join(' -> ')}`)
  }
  console.log(`  per-iteration enrich-limit: ${enrichLimit}`)
}

function printMeasurement(items: Item[], config: CliConfig, selected: string[], planLabel: string): void {
  const { metrics, worklist } = measure(items, 0, 0)
  printMetrics(metrics)
  printWorklist(worklist, 20)
  // Preview the corroborated carb-hole fills that would be applied (pure, no DB).
  const targeted = buildTargetedEstimates(items, { limit: config.options.enrichLimit })
  printTargetedPreview(targeted)
  // Back-test the estimation method against official ground truth (pure, no DB).
  const acc = evaluateAccuracy(items)
  printAccuracy(acc)
  printPlan(selected, config.options.enrichLimit, config.skipEnrich, planLabel)
}

// ---- Enrichers (shell out, tolerant) ------------------------------------

function enricherCommand(name: string, limit: number): string | null {
  switch (name) {
    case 'nutritionix':
      return `npm run enrich:nutritionix -- --limit=${limit}`
    case 'usda':
      return 'npm run enrich:nutrition'
    case 'edamam':
      return `npm run enrich:edamam -- --limit=${limit}`
    case 'triangulate':
      return `npm run audit:triangulate -- --apply --limit=${limit}`
    case 'ai':
      return `npm run estimate:ai -- --limit=${limit}`
    default:
      return null
  }
}

function runEnrichers(selected: string[], limit: number): void {
  for (const name of selected) {
    const cmd = enricherCommand(name, limit)
    if (!cmd) continue
    console.log(`\n  -> enricher: ${name}`)
    try {
      execSync(cmd, { stdio: 'inherit', env: process.env, cwd: rootPath() })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`  enricher ${name} failed (continuing): ${message}`)
    }
  }
}

// ---- Loop-history persistence -------------------------------------------

function appendLoopHistory(
  options: LoopOptions,
  iterations: LoopMetrics[],
  accuracy: CalibrationMetrics[],
  stopReason: string,
): void {
  const path = rootPath('audit', 'loop-history.json')
  let runs: unknown[] = []
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8'))
      if (Array.isArray(parsed)) runs = parsed
    } catch {
      runs = []
    }
  }
  runs.push({
    date: new Date().toISOString().slice(0, 10),
    apply: true,
    options,
    iterations,
    accuracy,
    stopReason,
  })
  writeFileSync(path, JSON.stringify(runs, null, 2) + '\n', 'utf-8')
}

// ---- Modes ---------------------------------------------------------------

/** Mode 1: offline — no DB, no writes. */
function runOffline(path: string, config: CliConfig, selected: string[]): void {
  const items = loadItemsFromFile(path)
  console.log(`OFFLINE — loaded ${items.length} items from ${path} (no DB, no writes)\n`)
  printMeasurement(items, config, selected, 'PLAN (offline) — enrichers that would run')
}

/** Mode 2: plan — live DB READ only, no writes. */
async function runPlan(config: CliConfig, selected: string[]): Promise<void> {
  const supabase = createSupabaseClient()
  const items = await fetchAllItems(supabase)
  console.log(`PLAN (dry-run) — loaded ${items.length} items from DB (no writes)\n`)
  printMeasurement(items, config, selected, 'PLAN (dry-run) — no writes')
}

/** Mode 3: apply — run the improvement loop against the live DB. */
async function runApplyLoop(config: CliConfig, selected: string[]): Promise<void> {
  const opts = config.options
  const supabase = createSupabaseClient()
  const history: LoopMetrics[] = []
  const accuracyHistory: CalibrationMetrics[] = []
  let appliedLastIter = 0
  let decision: ContinueDecision = { continue: true, reason: 'starting' }

  for (let i = 0; i < opts.maxIterations; i++) {
    const items = await fetchAllItems(supabase)
    const acc = checkAccuracy(items)
    const comp = checkCompleteness(items)
    const findings = tallyFindings([...acc.findings, ...comp.findings])
    const base = computeMetrics(items, {
      iteration: i,
      findings,
      autoFixesApplied: appliedLastIter,
      enrichedThisIteration: 0,
    })
    const prev = history[history.length - 1]
    const enriched = prev ? Math.max(0, prev.gapItemCount - base.gapItemCount) : 0
    const metrics: LoopMetrics = { ...base, enrichedThisIteration: enriched }
    history.push(metrics)

    console.log(
      `iter ${metrics.iteration}: carb-trust ${metrics.dosingGradeCarbsPct.toFixed(1)}% | ` +
        `HIGH ${metrics.highFindings} MED ${metrics.mediumFindings} LOW ${metrics.lowFindings} | ` +
        `fixes ${metrics.autoFixesApplied} enriched ${metrics.enrichedThisIteration} | gaps ${metrics.gapItemCount}`,
    )

    // ACCURACY (reported, not gating): back-test the method against official
    // ground truth, leave-one-out. Collected parallel to `history`.
    const accMetrics = evaluateAccuracy(items)
    accuracyHistory.push(accMetrics)
    const accParts: string[] = []
    if (accMetrics.carbMAE != null) accParts.push(`MAE ${accMetrics.carbMAE.toFixed(1)}g`)
    if (accMetrics.pctWithin10g != null) accParts.push(`${accMetrics.pctWithin10g.toFixed(1)}% within 10g`)
    if (accMetrics.doseErrorUnitsAtICR10 != null)
      accParts.push(`${accMetrics.doseErrorUnitsAtICR10.toFixed(1)} dose-units off @ICR10`)
    accParts.push(`ground-truth n=${accMetrics.n}`)
    console.log(`  accuracy: ${accParts.join(' | ')}`)

    decision = decideContinue(history, opts)
    if (!decision.continue) break

    // ACT — apply auto-fixes for this iteration's accuracy findings.
    const batch = buildFixBatch(acc.autoFixes)
    let applied = 0
    for (const entry of batch) {
      const { error } = await supabase.from('nutritional_data').update(entry.updates).eq('id', entry.id)
      if (!error) applied++
    }
    appliedLastIter = applied
    console.log(`  applied ${applied}/${batch.length} auto-fix record(s)`)

    // ACT — targeted corroborated carb-hole fills. Runs FIRST and IN-PROCESS
    // (buildTargetedEstimates is pure; applyTargetedEstimates is the only writer),
    // before shelling the CLI enrichers.
    if (!config.skipEnrich && selected.includes('targeted')) {
      const targeted = buildTargetedEstimates(items, { limit: opts.enrichLimit })
      if (targeted.length) {
        const res = await applyTargetedEstimates(supabase, targeted)
        console.log(
          `  targeted: ${res.updated} updated, ${res.inserted} inserted, ${res.failed} failed (corroborated carb-hole fills)`,
        )
      } else {
        console.log('  targeted: no corroborated carb-hole estimates this iteration')
      }
    }

    // ACT — enrich (each enricher self-selects candidates and self-skips if keys
    // absent). `targeted` is handled in-process above and shells nothing.
    if (!config.skipEnrich) runEnrichers(selected, opts.enrichLimit)
  }

  appendLoopHistory(opts, history, accuracyHistory, decision.reason)
  console.log('\n=== RUN SUMMARY ===')
  console.log(summarizeRun(history))
  console.log(`Stop reason: ${decision.reason}`)
}

// ---- Entry point ---------------------------------------------------------

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2))
  const selected = orderEnrichers(config.enrichers)

  if (config.fromFile) {
    runOffline(config.fromFile, config, selected)
    return
  }
  if (!config.apply) {
    await runPlan(config, selected)
    return
  }
  await runApplyLoop(config, selected)
}

if (process.argv[1]?.endsWith('improve.ts') || process.argv[1]?.endsWith('improve.js')) {
  main().catch((err) => {
    console.error('improve loop failed:', err)
    process.exit(1)
  })
}
