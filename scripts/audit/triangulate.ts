/**
 * Triangulated nutrition estimation for unknown items (Phase 2 of
 * docs/plans/2026-06-10-002).
 *
 * For the highest dosing-impact items below trust, run independent estimators
 * (keyword copy, chain-class median, Groq description decomposition), and
 * import a combined value ONLY when two independent methods agree within
 * max(8g, 15%). Confidence comes from the measured calibration tiers
 * (audit/calibration-results.json, 2026-06-10) — capped at 65, below the
 * app's dosing-grade bar, because entree-category agreement has not cleared
 * the >=90%-within-±10g gate. Disagreements go to a verification-queue file
 * for evidence research (E2).
 *
 *   npx tsx scripts/audit/triangulate.ts                 # dry run, top 300 by dosing impact
 *   npx tsx scripts/audit/triangulate.ts --limit 500     # bigger batch
 *   npx tsx scripts/audit/triangulate.ts --apply         # write (undo manifest first, fail-stop)
 *   npx tsx scripts/audit/triangulate.ts --decomp-file data/pending/claude-decomp-pilot-out.json
 *       # use precomputed decomposition estimates (e.g. Claude-generated, when
 *       # Groq's daily token budget is exhausted) instead of calling Groq
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  estimateNutrition,
  extractKeywords,
  type NutritionPoolEntry,
} from '../sync/estimate-nutrition.js'
import type { MergedItem } from '../sync/merge.js'
import { normalizeName } from '../scrapers/utils.js'
import { chainClassEstimate, estimatesAgree, type OfficialRow } from './calibration-methods.js'
import { dosingPriorityScore } from './trust.js'

// ─────────────────────────────────────────────────────────────────────────────
// Measured confidence tiers (calibration 2026-06-10, per agreement pair and
// category). Dosing-grade (>=70) requires the tier to have MEASURED >=90%
// within ±10g AND <=1% severe undercounts on ground truth:
//   - chain+decomposition  beverage: 100%  ±10g, 0%  undercut (n=205) → 72
//   - keyword+decomposition beverage: 96.3% ±10g, 0% undercut (n=562) → 70
//   - keyword+chain beverage: 93.8% ±10g but 4.6% severe undercuts → FAILS
//     the undercount gate, stays sub-dosing at 55
//   - entree-tier agreements measured 76-85% ±10g → all sub-dosing
// Beverage dosing-grade signed off by Brad, 2026-06-11. Alcohol-suspected
// items never reach these tiers (excluded from targets upstream).
//
// CAVEAT (2026-07-11): the drink-class split in calibration-methods.ts
// (smoothie-juice → lemonade/smoothie/refresher/juice) changed the chain
// estimator after these tiers were measured. The chain-involved tiers
// (chain+decomposition 72, keyword+chain 55) need `npm run audit:calibrate`
// re-run — and the numbers re-verified — before the next `--apply`.
// keyword+decomposition (70) does not use the chain method and is unaffected.
// ─────────────────────────────────────────────────────────────────────────────

export const TRIANGULATION_TIERS: Record<string, { beverage: number; other: number }> = {
  'chain+decomposition': { beverage: 72, other: 60 },
  'keyword+decomposition': { beverage: 70, other: 55 },
  'keyword+chain': { beverage: 55, other: 50 },
}

export interface FullMacros {
  calories: number | null
  fat: number | null
  protein: number | null
  sugar: number | null
  fiber: number | null
  sodium: number | null
}

export interface MethodEstimate {
  method: 'keyword' | 'chain' | 'decomposition'
  carbs: number
  full?: FullMacros
}

export interface TriangulationResult {
  carbs: number
  confidence: number
  tier: string
  agreeing: string[]
  macros: FullMacros | null
}

/** Agreement pairs in measured-quality order — the first agreeing pair wins. */
const PAIR_PRIORITY: Array<['keyword' | 'chain' | 'decomposition', 'keyword' | 'chain' | 'decomposition']> = [
  ['chain', 'decomposition'],
  ['keyword', 'decomposition'],
  ['keyword', 'chain'],
]

/**
 * Combine independent estimates into a calibrated value, or null when no two
 * independent methods agree (those items go to the verification queue).
 */
export function assignTriangulation(
  estimates: MethodEstimate[],
  category: string,
): TriangulationResult | null {
  const byMethod = new Map(estimates.map((e) => [e.method, e]))
  for (const [a, b] of PAIR_PRIORITY) {
    const ea = byMethod.get(a)
    const eb = byMethod.get(b)
    if (!ea || !eb) continue
    if (!estimatesAgree(ea.carbs, eb.carbs)) continue
    const tier = `${a}+${b}`
    const conf = TRIANGULATION_TIERS[tier][category === 'beverage' ? 'beverage' : 'other']
    const carbs = Math.round((ea.carbs + eb.carbs) / 2)
    // Macros: prefer the decomposition's full set (it estimates the whole
    // panel); fall back to the keyword copy's. Clamp components to carbs.
    const fullSource = [eb, ea].find((e) => e.full)?.full ?? null
    const macros = fullSource
      ? {
          ...fullSource,
          sugar: fullSource.sugar != null ? Math.min(fullSource.sugar, carbs) : null,
          fiber: fullSource.fiber != null ? Math.min(fullSource.fiber, carbs) : null,
        }
      : null
    return { carbs, confidence: conf, tier, agreeing: [a, b], macros }
  }
  return null
}

/**
 * Items sold as multi-serving formats (a dozen doughnuts, a whole pizza, a
 * sharing platter) are excluded from triangulated import: estimators tend to
 * value a single serving while the catalog stores the item as sold, which
 * produces systematic undercounts — the dosing-dangerous direction. These go
 * to the verification queue for evidence research instead.
 */
export const MULTI_SERVING_PATTERN =
  /\b(dozen|whole|platter|family|shar(e|ing|eable)|bucket|tray|party|baker'?s|jumbo|giant|colossal|footlong)\b|signature .*cake|celebration cake/i

// Food words that suggest a 'beverage' row is actually food. Kept in sync by
// hand with FOOD_CONTEXT in recategorize.ts and FOOD_CLASSES in
// calibration-methods.ts — full unification is pending, so when adding a word
// check all three lists.
const BEVERAGE_SUSPECT_FOOD =
  /\b(cookies?|brownies?|cakes?|cupcakes?|muffins?|croissants?|pastry|pastries|pretzels?|popcorn|donuts?|doughnuts?|sundaes?|pies?|churros?|cinnamon rolls?|ice cream|funnel cakes?|nachos?|fries|waffles?|crepes?)\b/i

// Drink formats whose names legitimately carry dessert flavor words
// ("Birthday Cake Shake", "Cookie Butter Cold Brew") — these ARE beverages
// and must keep access to the beverage agreement tiers.
const BEVERAGE_DRINK_CONTEXT =
  /\b(milk ?shakes?|shakes?|floats?|smoothies?|lattes?|mochas?|frapp\w*|cold brew|cocoa|hot chocolate|lemonades?|refreshers?|sodas?|slush\w*|icees?|boba|juices?|ciders?|punch)\b/i

/**
 * Items whose stored category is 'beverage' but whose name is clearly food
 * (the Coffee Cake Cookie trap) are category-contaminated rows. They must not
 * receive the beverage agreement tiers — those were measured on actual drinks
 * — so they route to the queue and should be recategorized first. Names with
 * an explicit drink format are exempt: a flavor word ("cake", "cookie") in a
 * shake or latte name does not make the row food.
 */
export function isBeverageCategorySuspect(category: string | null, name: string): boolean {
  if (category !== 'beverage') return false
  if (BEVERAGE_DRINK_CONTEXT.test(name)) return false
  return BEVERAGE_SUSPECT_FOOD.test(name)
}

/** Basic import-safety validation mirroring the import-ai gates. */
export function isImportable(r: TriangulationResult): boolean {
  if (r.carbs < 0 || r.carbs > 500) return false
  const m = r.macros
  if (m) {
    if (m.calories != null && (m.calories < 0 || m.calories > 5000)) return false
    for (const v of [m.fat, m.protein, m.sugar, m.fiber]) {
      if (v != null && (v < 0 || v > 500)) return false
    }
    if (m.sodium != null && (m.sodium < 0 || m.sodium > 10000)) return false
  }
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

interface DbRow {
  id: string
  name: string
  category: string
  description: string | null
  restaurant: { name: string; park: { name: string; location: string | null } | null } | null
  nutritional_data: Array<{
    id: string
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
  const { createSupabaseClient, rootPath, isLikelyAlcoholic } = await import('./utils.js')
  const supabase = createSupabaseClient()
  const argv = process.argv.slice(2)
  const apply = argv.includes('--apply')
  const limit = Number(argv.flatMap((a, i) => (a === '--limit' && argv[i + 1] ? [argv[i + 1]] : []))[0] ?? 300)
  const categoryFilter = argv.flatMap((a, i) => (a === '--category' && argv[i + 1] ? [argv[i + 1]] : []))[0]

  console.log(`=== Triangulated estimation — ${apply ? 'APPLY' : 'DRY RUN'} (limit ${limit}${categoryFilter ? `, category ${categoryFilter}` : ''}) ===`)
  console.log('Fetching catalog…')
  const rows: DbRow[] = []
  const page = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('menu_items')
      .select(
        `id, name, category, description,
         restaurant:restaurants(name, park:parks(name, location)),
         nutritional_data(id, calories, carbs, fat, protein, sugar, fiber, sodium, source, confidence_score)`,
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

  // Pools
  const pool: NutritionPoolEntry[] = []
  const officialPool: OfficialRow[] = []
  for (const row of rows) {
    const n = Array.isArray(row.nutritional_data) ? row.nutritional_data[0] : row.nutritional_data
    if (!n) continue
    if (
      typeof n.calories === 'number' && typeof n.carbs === 'number' &&
      typeof n.fat === 'number' && typeof n.protein === 'number'
    ) {
      pool.push({
        id: row.id, name: row.name, category: row.category,
        calories: n.calories, carbs: n.carbs, fat: n.fat, protein: n.protein,
        sugar: n.sugar, fiber: n.fiber, sodium: n.sodium,
        keywords: extractKeywords(row.name),
      })
    }
    if (n.source === 'official' && (n.confidence_score ?? 0) >= 85 && n.carbs != null) {
      officialPool.push({ id: row.id, name: row.name, category: row.category, carbs: n.carbs, calories: n.calories })
    }
  }

  // Targets: improvable rows (no carbs, or confidence below what agreement can
  // assign), never official, never alcohol-suspected (the estimators have no
  // alcohol model), ranked by dosing impact.
  const targets = rows
    .filter((row) => {
      if (categoryFilter && row.category !== categoryFilter) return false
      const n = Array.isArray(row.nutritional_data) ? row.nutritional_data[0] : row.nutritional_data
      if (!n || n.source === 'official') return false
      // Improvable = below dosing grade; the never-downgrade check at plan
      // time decides whether a given tier actually beats the existing row.
      if (n.carbs != null && (n.confidence_score ?? 0) >= 70) return false
      if (isLikelyAlcoholic(row.name, { category: row.category, description: row.description } as never)) return false
      return true
    })
    .map((row) => ({
      row,
      priority: dosingPriorityScore(
        row.category,
        row.restaurant?.park?.location ?? null,
        (Array.isArray(row.nutritional_data) ? row.nutritional_data[0] : row.nutritional_data)?.carbs ?? null,
      ),
    }))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit)
    .map((t) => t.row)
  console.log(`Targets: ${targets.length} improvable items by dosing impact`)

  // Method 1+2: keyword + chain (free, local)
  const estimatesByItem = new Map<string, MethodEstimate[]>()
  for (const t of targets) {
    const list: MethodEstimate[] = []
    const tNorm = normalizeName(t.name)
    const candidatePool = pool.filter((p) => p.id !== t.id && normalizeName(p.name) !== tNorm)
    const kw = estimateNutrition(
      { itemName: t.name, category: t.category, restaurantName: '', parkName: '', sources: [], confidence: 100, isNew: true } as unknown as MergedItem,
      candidatePool,
    )
    if (kw && Number.isFinite(kw.carbs)) {
      list.push({
        method: 'keyword', carbs: kw.carbs,
        full: { calories: kw.calories, fat: kw.fat, protein: kw.protein, sugar: kw.sugar ?? null, fiber: kw.fiber ?? null, sodium: kw.sodium ?? null },
      })
    }
    const chain = chainClassEstimate(t, officialPool)
    if (chain) list.push({ method: 'chain', carbs: chain.carbs })
    estimatesByItem.set(t.id, list)
  }

  // Method 3: decomposition — precomputed file takes precedence over Groq
  const decompFile = argv.flatMap((a, i) => (a === '--decomp-file' && argv[i + 1] ? [argv[i + 1]] : []))[0]
  const groqKey = process.env.GROQ_API_KEY
  const decompTargets = targets.filter((t) => (t.description ?? '').trim().length >= 20)
  if (decompFile) {
    const { readFileSync } = await import('node:fs')
    const entries: Array<{ id: string; carbs: number; calories?: number; fat?: number; protein?: number; sugar?: number; fiber?: number; sodium?: number }> =
      JSON.parse(readFileSync(decompFile, 'utf-8'))
    let used = 0
    const num = (v: unknown) => {
      const x = Math.round(Number(v))
      return Number.isFinite(x) && x >= 0 ? x : null
    }
    for (const e of entries) {
      const carbs = Math.round(Number(e.carbs))
      if (!estimatesByItem.has(e.id) || !Number.isFinite(carbs) || carbs < 0 || carbs > 500) continue
      estimatesByItem.get(e.id)!.push({
        method: 'decomposition', carbs,
        full: { calories: num(e.calories), fat: num(e.fat), protein: num(e.protein), sugar: num(e.sugar), fiber: num(e.fiber), sodium: num(e.sodium) },
      })
      used++
    }
    console.log(`Decomposition: loaded ${used} precomputed estimates from ${decompFile}`)
  } else if (groqKey && decompTargets.length > 0) {
    const { default: Groq } = await import('groq-sdk')
    const groq = new Groq({ apiKey: groqKey })
    console.log(`Decomposition (Groq): ${decompTargets.length} targets with descriptions`)
    const BATCH = 5
    for (let i = 0; i < decompTargets.length; i += BATCH) {
      const batch = decompTargets.slice(i, i + BATCH)
      const itemList = batch
        .map((item, j) => `[${j + 1}] Name: ${item.name}\nCategory: ${item.category}\nDescription: ${item.description}`)
        .join('\n\n')
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
        const entries: Array<Record<string, unknown>> = Array.isArray(parsed?.items) ? parsed.items : []
        for (const entry of entries) {
          const target = batch[Number(entry?.index) - 1]
          const carbs = Math.round(Number(entry?.carbs))
          if (!target || !Number.isFinite(carbs) || carbs < 0 || carbs > 500) continue
          const num = (k: string) => {
            const v = Math.round(Number(entry?.[k]))
            return Number.isFinite(v) && v >= 0 ? v : null
          }
          estimatesByItem.get(target.id)?.push({
            method: 'decomposition', carbs,
            full: { calories: num('calories'), fat: num('fat'), protein: num('protein'), sugar: num('sugar'), fiber: num('fiber'), sodium: num('sodium') },
          })
        }
      } catch (err) {
        console.error(`  batch ${i / BATCH + 1} failed:`, (err as Error).message)
      }
      process.stdout.write(`\r  decomposition: ${Math.min(i + BATCH, decompTargets.length)}/${decompTargets.length}`)
      await new Promise((r) => setTimeout(r, 2200))
    }
    console.log()
  } else if (!groqKey) {
    console.warn('GROQ_API_KEY not set — running without the decomposition method (agreement yield will drop)')
  }

  // Triangulate
  interface PlannedUpdate {
    nutritionDataId: string
    itemId: string
    name: string
    category: string
    park: string
    tier: string
    confidence: number
    before: { carbs: number | null; confidence: number | null }
    update: Record<string, number | string>
  }
  const planned: PlannedUpdate[] = []
  const queue: Array<{ id: string; name: string; category: string; park: string; reasons: string[]; estimates: MethodEstimate[]; priority: number }> = []
  let noEstimates = 0

  for (const t of targets) {
    const ests = estimatesByItem.get(t.id) ?? []
    const n = Array.isArray(t.nutritional_data) ? t.nutritional_data[0] : t.nutritional_data
    if (!n) continue
    const park = t.restaurant?.park?.name ?? '?'
    if (ests.length < 2) {
      noEstimates++
      continue
    }
    const result = assignTriangulation(ests, t.category)
    // Why the item was queued, so the E2 consumer can route it: category-suspect
    // rows need recategorization, not carb research.
    const reasons = [
      ...(!result ? ['no-agreement'] : []),
      ...(result && !isImportable(result) ? ['not-importable'] : []),
      ...(MULTI_SERVING_PATTERN.test(t.name) ? ['multi-serving'] : []),
      ...(isBeverageCategorySuspect(t.category, t.name) ? ['category-suspect'] : []),
    ]
    if (!result || reasons.length > 0) {
      queue.push({
        id: t.id, name: t.name, category: t.category, park,
        reasons,
        estimates: ests,
        priority: dosingPriorityScore(t.category, t.restaurant?.park?.location ?? null, n.carbs),
      })
      continue
    }
    // Never-downgrade: only when the new confidence beats the existing one.
    if (n.carbs != null && (n.confidence_score ?? 0) >= result.confidence) continue
    const update: Record<string, number | string> = {
      carbs: result.carbs,
      confidence_score: result.confidence,
      source_detail: `triangulated ${result.tier} agree (${result.agreeing.join('/')}); calibrated tier; 2026-06-10`,
    }
    if (result.macros) {
      for (const [k, v] of Object.entries(result.macros)) {
        if (v != null) update[k] = v
      }
    }
    planned.push({
      nutritionDataId: n.id, itemId: t.id, name: t.name, category: t.category, park,
      tier: result.tier, confidence: result.confidence,
      before: { carbs: n.carbs, confidence: n.confidence_score },
      update,
    })
  }

  // Report
  const byTier = new Map<string, PlannedUpdate[]>()
  for (const p of planned) {
    const key = `${p.tier} → conf ${p.confidence}`
    if (!byTier.has(key)) byTier.set(key, [])
    byTier.get(key)!.push(p)
  }
  console.log(`\n=== Triangulation plan ===`)
  console.log(`agreement imports: ${planned.length}   verification queue: ${queue.length}   <2 estimates: ${noEstimates}`)
  for (const [key, group] of [...byTier.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n  ${key} — ${group.length} items`)
    for (const p of group.slice(0, 8)) {
      console.log(`    • ${p.name} @ ${p.park} [${p.category}] carbs ${p.before.carbs ?? '∅'}→${p.update.carbs} (conf ${p.before.confidence ?? '∅'}→${p.confidence})`)
    }
    if (group.length > 8) console.log(`    … and ${group.length - 8} more`)
  }

  // Verification queue file (for E2 research) — always written
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const pendingDir = join(__dirname, '..', '..', 'data', 'pending')
  mkdirSync(pendingDir, { recursive: true })
  const queuePath = join(pendingDir, `verification-queue-${new Date().toISOString().slice(0, 10)}.json`)
  writeFileSync(queuePath, JSON.stringify(queue.sort((a, b) => b.priority - a.priority), null, 2) + '\n')
  console.log(`\nVerification queue written: ${queuePath} (${queue.length} items)`)

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to write the agreement imports.')
    return
  }

  // Undo manifest BEFORE any write
  const undoDir = rootPath('audit')
  const undoPath = join(undoDir, `triangulate-undo-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(undoPath, JSON.stringify(planned, null, 2) + '\n')
  console.log(`Undo manifest written: ${undoPath}`)

  let applied = 0
  for (const p of planned) {
    const { error } = await supabase.from('nutritional_data').update(p.update).eq('id', p.nutritionDataId)
    if (error) {
      console.error(`\nFAILED at ${applied}/${planned.length} on "${p.name}": ${error.message}`)
      console.error(`Applied rows are the first ${applied} entries of ${undoPath}.`)
      process.exit(1)
    }
    applied++
  }
  console.log(`Applied ${applied}/${planned.length} triangulated estimates.`)
}

const isDirectRun =
  process.argv[1]?.endsWith('triangulate.ts') || process.argv[1]?.endsWith('triangulate.js')
if (isDirectRun) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
