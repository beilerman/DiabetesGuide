/**
 * enrich-nutritionix.ts — Upgrade nutrition from the Nutritionix database.
 *
 * Nutritionix has an official restaurant/branded-food database, so it resolves
 * chain items (Starbucks, Panda Express, Cinnabon, Skyline, etc.) and packaged
 * foods that USDA can't. For a carb-counting diabetes app this is the highest
 * accuracy lever: it replaces low-confidence estimates with real numbers.
 *
 * Strategy per item:
 *   1. Branded search — if a branded result's brand matches the item's
 *      restaurant, fetch its exact nutrition (source=official, confidence 88).
 *   2. Natural-language fallback — estimate from the item name
 *      (source=api_lookup, confidence 62, on par with USDA).
 *
 * Only touches items whose carbs are MISSING or LOW-confidence (< 50); it never
 * downgrades an already-trusted value.
 *
 * Requires NUTRITIONIX_APP_ID and NUTRITIONIX_API_KEY (free key at
 * https://www.nutritionix.com/business/api). Free tier is ~200 natural calls/day,
 * so the script is resumable and honors --limit.
 *
 * Usage:
 *   npx tsx scripts/enrich-nutritionix.ts            # default cap (150 items)
 *   npx tsx scripts/enrich-nutritionix.ts --limit=500
 *   npx tsx scripts/enrich-nutritionix.ts --all      # no cap (watch your quota)
 *   npx tsx scripts/enrich-nutritionix.ts --dry-run
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { normalizeName } from './scrapers/utils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ---- env (.env.local fallback for local runs) ----
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
const NX_APP_ID = process.env.NUTRITIONIX_APP_ID
const NX_API_KEY = process.env.NUTRITIONIX_API_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!NX_APP_ID || !NX_API_KEY) {
  console.log('NUTRITIONIX_APP_ID / NUTRITIONIX_API_KEY not set — nothing to do.')
  console.log('Get a free key at https://www.nutritionix.com/business/api and add both to .env.local.')
  process.exit(0)
}

const supabase = createClient(url, key)
const NX_HEADERS = { 'x-app-id': NX_APP_ID, 'x-app-key': NX_API_KEY, 'Content-Type': 'application/json' }

// CLI flags
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const ALL = args.includes('--all')
const limitArg = args.find(a => a.startsWith('--limit='))
const LIMIT = ALL ? Infinity : limitArg ? parseInt(limitArg.split('=')[1], 10) : 150
const RATE_DELAY_MS = 700 // ~85 req/min, polite for the API

// Plausible ranges (per serving) — reject obvious garbage before writing.
const RANGES: Record<string, [number, number]> = {
  calories: [0, 5000], carbs: [0, 600], fat: [0, 400], protein: [0, 300],
  sugar: [0, 400], fiber: [0, 100], sodium: [0, 20000], cholesterol: [0, 3000],
}

interface Nutrition {
  calories: number; carbs: number; fat: number; protein: number
  sugar: number; fiber: number; sodium: number; cholesterol: number
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

function clampOrNull(v: unknown, field: keyof typeof RANGES): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  const [min, max] = RANGES[field]
  if (n < min || n > max) return null
  return Math.round(n)
}

/** Build a validated Nutrition object from a Nutritionix food record, or null. */
function toNutrition(food: Record<string, any>): Nutrition | null {
  const calories = clampOrNull(food.nf_calories, 'calories')
  const carbs = clampOrNull(food.nf_total_carbohydrate, 'carbs')
  // Require at least calories + carbs — carbs is the field that matters here.
  if (calories == null || carbs == null) return null
  return {
    calories,
    carbs,
    fat: clampOrNull(food.nf_total_fat, 'fat') ?? 0,
    protein: clampOrNull(food.nf_protein, 'protein') ?? 0,
    sugar: clampOrNull(food.nf_sugars, 'sugar') ?? 0,
    fiber: clampOrNull(food.nf_dietary_fiber, 'fiber') ?? 0,
    sodium: clampOrNull(food.nf_sodium, 'sodium') ?? 0,
    cholesterol: clampOrNull(food.nf_cholesterol, 'cholesterol') ?? 0,
  }
}

/** Branded lookup: returns official nutrition if a brand matches the restaurant. */
async function brandedLookup(itemName: string, restaurantName: string): Promise<Nutrition | null> {
  const q = encodeURIComponent(itemName)
  const resp = await fetch(`https://trackapi.nutritionix.com/v2/search/instant?query=${q}&branded=true&common=false`, {
    headers: NX_HEADERS, signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) return null
  const json = await resp.json() as { branded?: { nix_item_id: string; brand_name?: string; food_name?: string }[] }
  const restTokens = new Set(normalizeName(restaurantName).split(' ').filter(w => w.length > 2))
  const hit = (json.branded ?? []).find(b => {
    const brand = normalizeName(b.brand_name ?? '')
    // brand matches restaurant if they share a meaningful token
    return [...restTokens].some(t => brand.includes(t)) || normalizeName(restaurantName).includes(brand)
  })
  if (!hit) return null

  const detail = await fetch(`https://trackapi.nutritionix.com/v2/search/item?nix_item_id=${hit.nix_item_id}`, {
    headers: NX_HEADERS, signal: AbortSignal.timeout(15000),
  })
  if (!detail.ok) return null
  const dj = await detail.json() as { foods?: Record<string, any>[] }
  const food = dj.foods?.[0]
  return food ? toNutrition(food) : null
}

/** Natural-language estimate from the item name. */
async function naturalLookup(itemName: string): Promise<Nutrition | null> {
  const resp = await fetch('https://trackapi.nutritionix.com/v2/natural/nutrients', {
    method: 'POST', headers: NX_HEADERS,
    body: JSON.stringify({ query: itemName }), signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) return null
  const json = await resp.json() as { foods?: Record<string, any>[] }
  const food = json.foods?.[0]
  return food ? toNutrition(food) : null
}

interface Candidate {
  id: string
  name: string
  restaurant: string
  ndId: string | null
}

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
      const carbs = nd?.carbs
      const conf = nd?.confidence_score ?? 0
      // Needs work: no carbs, or low-confidence carbs.
      if (carbs == null || conf < 50) {
        const rest = Array.isArray(row.restaurant) ? row.restaurant[0] : row.restaurant
        out.push({ id: row.id, name: row.name, restaurant: rest?.name ?? '', ndId: nd?.id ?? null })
      }
    }
    if (data.length < page) break
    from += page
  }
  return out
}

async function writeNutrition(c: Candidate, nut: Nutrition, official: boolean): Promise<boolean> {
  const fields = {
    ...nut,
    source: official ? 'official' : 'api_lookup',
    confidence_score: official ? 88 : 62,
  }
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
  console.log(`Fetching candidates (missing or low-confidence carbs)...`)
  const candidates = await fetchCandidates()
  console.log(`${candidates.length} candidate items; processing up to ${LIMIT === Infinity ? 'ALL' : LIMIT}${DRY_RUN ? ' (dry-run)' : ''}\n`)

  let officialN = 0, estimateN = 0, missN = 0, processed = 0
  for (const c of candidates) {
    if (processed >= LIMIT) break
    processed++
    try {
      let nut = await brandedLookup(c.name, c.restaurant)
      let official = false
      if (nut) {
        official = true
      } else {
        await delay(RATE_DELAY_MS)
        nut = await naturalLookup(c.name)
      }

      if (nut && await writeNutrition(c, nut, official)) {
        if (official) { officialN++; console.log(`  [official] ${c.restaurant} — ${c.name}: ${nut.carbs}g carbs`) }
        else { estimateN++; if (estimateN <= 30) console.log(`  [est] ${c.name}: ${nut.carbs}g carbs`) }
      } else {
        missN++
      }
    } catch (err) {
      missN++
      console.error(`  error on ${c.name}: ${err instanceof Error ? err.message : err}`)
    }
    await delay(RATE_DELAY_MS)
  }

  console.log(`\n=== Nutritionix Enrichment Complete ===`)
  console.log(`Processed:        ${processed}`)
  console.log(`Official (chain): ${officialN}`)
  console.log(`Estimated:        ${estimateN}`)
  console.log(`No match:         ${missN}`)
  console.log(`Remaining candidates: ${candidates.length - processed}`)
  if (candidates.length - processed > 0) {
    console.log(`Re-run to continue (already-trusted items are skipped automatically).`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
