/**
 * enrich-edamam.ts — Upgrade nutrition from the Edamam Food Database API.
 *
 * Free "Basic" tier: 1,000 requests/day, 50/min. Get app_id + app_key at
 * https://developer.edamam.com/food-database-api and add them to .env.local:
 *   EDAMAM_APP_ID=...
 *   EDAMAM_APP_KEY=...
 *
 * IMPORTANT: Edamam returns nutrients PER 100g. We scale by the food's branded
 * "Serving" measure to get per-serving values; if no serving weight is
 * available we SKIP rather than guess a portion (a wrong carb count is a wrong
 * insulin dose). Branded matches to the item's restaurant are preferred.
 *
 * Only touches items with missing or low-confidence (< 50) carbs; never
 * downgrades trusted data. Resumable, rate-limited.
 *
 * Usage:
 *   npx tsx scripts/enrich-edamam.ts             # default cap (300 items/run)
 *   npx tsx scripts/enrich-edamam.ts --limit=800
 *   npx tsx scripts/enrich-edamam.ts --all
 *   npx tsx scripts/enrich-edamam.ts --dry-run
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { normalizeName } from './scrapers/utils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnvLocal(): void {
  const p = resolve(__dirname, '..', '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (k && process.env[k] === undefined) process.env[k] = v
  }
}
loadEnvLocal()

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const ED_ID = process.env.EDAMAM_APP_ID
const ED_KEY = process.env.EDAMAM_APP_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!ED_ID || !ED_KEY) {
  console.log('EDAMAM_APP_ID / EDAMAM_APP_KEY not set — nothing to do.')
  console.log('Get a free key at https://developer.edamam.com/food-database-api and add both to .env.local.')
  process.exit(0)
}

const supabase = createClient(url, key)

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const ALL = args.includes('--all')
const limitArg = args.find(a => a.startsWith('--limit='))
const LIMIT = ALL ? Infinity : limitArg ? parseInt(limitArg.split('=')[1], 10) : 300
const RATE_DELAY_MS = 1300 // ~46 req/min, under the 50/min cap

const RANGES: Record<string, [number, number]> = {
  calories: [0, 5000], carbs: [0, 600], fat: [0, 400], protein: [0, 300],
  sugar: [0, 400], fiber: [0, 100], sodium: [0, 20000], cholesterol: [0, 3000],
}

interface Nutrition {
  calories: number; carbs: number; fat: number; protein: number
  sugar: number; fiber: number; sodium: number; cholesterol: number
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

function clampOrNull(v: number | undefined, field: keyof typeof RANGES): number | null {
  if (v == null || !Number.isFinite(v)) return null
  const [min, max] = RANGES[field]
  if (v < min || v > max) return null
  return Math.round(v)
}

interface EdamamFood {
  food: {
    label?: string
    brand?: string
    nutrients?: Record<string, number> // PER 100g
  }
  measures?: { label?: string; weight?: number }[] // weight in grams
}

/** Scale Edamam per-100g nutrients to a serving using a branded serving weight. */
function toNutritionPerServing(hint: EdamamFood): Nutrition | null {
  const n = hint.food.nutrients
  if (!n) return null
  // Find a serving weight (grams). Prefer an explicit "Serving" measure.
  const serving = hint.measures?.find(m => /serving/i.test(m.label ?? '') && (m.weight ?? 0) > 0)
  const grams = serving?.weight
  if (!grams) return null // no serving size -> don't guess the portion
  const f = grams / 100
  const calories = clampOrNull((n.ENERC_KCAL ?? NaN) * f, 'calories')
  const carbs = clampOrNull((n.CHOCDF ?? NaN) * f, 'carbs')
  if (calories == null || carbs == null) return null
  return {
    calories, carbs,
    fat: clampOrNull((n.FAT ?? 0) * f, 'fat') ?? 0,
    protein: clampOrNull((n.PROCNT ?? 0) * f, 'protein') ?? 0,
    sugar: clampOrNull((n.SUGAR ?? 0) * f, 'sugar') ?? 0,
    fiber: clampOrNull((n.FIBTG ?? 0) * f, 'fiber') ?? 0,
    sodium: clampOrNull((n.NA ?? 0) * f, 'sodium') ?? 0,
    cholesterol: clampOrNull((n.CHOLE ?? 0) * f, 'cholesterol') ?? 0,
  }
}

async function edamamParse(query: string): Promise<EdamamFood[]> {
  const u = `https://api.edamam.com/api/food-database/v2/parser?app_id=${ED_ID}&app_key=${ED_KEY}&ingr=${encodeURIComponent(query)}&nutrition-type=cooking`
  const resp = await fetch(u, { signal: AbortSignal.timeout(15000) })
  if (!resp.ok) throw new Error(`Edamam ${resp.status}`)
  const json = await resp.json() as { hints?: EdamamFood[] }
  return json.hints ?? []
}

interface Candidate { id: string; name: string; restaurant: string; ndId: string | null }

async function fetchCandidates(): Promise<Candidate[]> {
  const out: Candidate[] = []
  const page = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('menu_items')
      .select('id, name, restaurant:restaurants(name), nutritional_data(id, carbs, confidence_score)')
      .range(from, from + page - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const row of data as any[]) {
      const nd = Array.isArray(row.nutritional_data) ? row.nutritional_data[0] : row.nutritional_data
      if (nd?.carbs == null || (nd?.confidence_score ?? 0) < 50) {
        const rest = Array.isArray(row.restaurant) ? row.restaurant[0] : row.restaurant
        out.push({ id: row.id, name: row.name, restaurant: rest?.name ?? '', ndId: nd?.id ?? null })
      }
    }
    if (data.length < page) break
    from += page
  }
  return out
}

/** Pick the best hint: prefer a branded food whose brand matches the restaurant. */
function pickHint(hints: EdamamFood[], restaurant: string): { hint: EdamamFood; branded: boolean } | null {
  const restTokens = new Set(normalizeName(restaurant).split(' ').filter(w => w.length > 2))
  const branded = hints.find(h => {
    const b = normalizeName(h.food.brand ?? '')
    return b && ([...restTokens].some(t => b.includes(t)) || normalizeName(restaurant).includes(b))
  })
  if (branded) return { hint: branded, branded: true }
  // else first hint that yields a serving-based nutrition (handled by caller)
  return hints[0] ? { hint: hints[0], branded: false } : null
}

async function writeNutrition(c: Candidate, nut: Nutrition, branded: boolean): Promise<boolean> {
  const fields = { ...nut, source: 'api_lookup', confidence_score: branded ? 68 : 55 }
  if (DRY_RUN) return true
  if (c.ndId) {
    const { error } = await supabase.from('nutritional_data').update(fields).eq('id', c.ndId)
    if (error) { console.error(`  update failed for ${c.name}: ${error.message}`); return false }
  } else {
    const { error } = await supabase.from('nutritional_data').insert({ menu_item_id: c.id, ...fields })
    if (error) { console.error(`  insert failed for ${c.name}: ${error.message}`); return false }
  }
  return true
}

async function main() {
  console.log('Fetching candidates (missing/low-confidence carbs)...')
  const candidates = await fetchCandidates()
  console.log(`${candidates.length} candidates; processing up to ${LIMIT === Infinity ? 'ALL' : LIMIT}${DRY_RUN ? ' (dry-run)' : ''}\n`)

  let okN = 0, missN = 0, processed = 0
  for (const c of candidates) {
    if (processed >= LIMIT) break
    processed++
    try {
      const hints = await edamamParse(c.name)
      const picked = pickHint(hints, c.restaurant)
      const nut = picked ? toNutritionPerServing(picked.hint) : null
      if (nut && await writeNutrition(c, nut, picked!.branded)) {
        okN++
        if (okN <= 40) console.log(`  [${picked!.branded ? 'branded' : 'generic'}] ${c.name}: ${nut.carbs}g carbs`)
      } else {
        missN++ // no match, or no serving size to scale safely
      }
    } catch (err) {
      missN++
      console.error(`  error on ${c.name}: ${err instanceof Error ? err.message : err}`)
    }
    await delay(RATE_DELAY_MS)
  }

  console.log(`\n=== Edamam Enrichment Complete ===`)
  console.log(`Processed:            ${processed}`)
  console.log(`Written:              ${okN}`)
  console.log(`No match / no serving: ${missN}`)
  console.log(`Remaining candidates: ${candidates.length - processed}`)
  if (candidates.length - processed > 0) console.log('Re-run to continue (free tier resets daily).')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
