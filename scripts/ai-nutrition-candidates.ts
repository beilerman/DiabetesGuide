/**
 * ai-nutrition-candidates.ts — Build batch files for Opus-grounded nutrition.
 *
 * Selects park-unique, low-confidence items that have a description (better
 * grounding) and aren't national chains, then writes them as fixed-size batch
 * JSON files under data/ai-batches/. Each batch is handed to an Opus subagent
 * (web research + copycat-recipe / ingredient-decomposition) which writes a
 * matching data/ai-nutrition*.json, then `npm run import:ai -- --apply` applies it.
 *
 * This is the FREE nutrition engine: it uses the Claude Code subscription
 * (Opus subagents) + free web/USDA data instead of a paid nutrition API.
 *
 * Usage:
 *   npx tsx scripts/ai-nutrition-candidates.ts                 # all, batches of 20
 *   npx tsx scripts/ai-nutrition-candidates.ts --batch-size=25 --max-conf=45 --limit=200
 */
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(url, key)

const args = process.argv.slice(2)
const num = (flag: string, def: number) => {
  const a = args.find(x => x.startsWith(`${flag}=`))
  return a ? parseInt(a.split('=')[1], 10) : def
}
const BATCH = num('--batch-size', 20)
const MAX_CONF = num('--max-conf', 45)
const LIMIT = num('--limit', Infinity as unknown as number)
// --flagged: target items whose CURRENT nutrition is internally inconsistent
// (definitely wrong), regardless of confidence — the highest accuracy-per-token.
const FLAGGED = args.includes('--flagged')

const CHAIN = /starbucks|panda express|cinnabon|cold stone|haagen|ben\s*&?\s*jerry|blaze|earl of sandwich|wetzel|jamba|chicken guy|sprinkles|skyline|larosa|auntie anne|subway|chipotle|shake shack|dunkin/i
// Broad alcohol detection over name + description: alcoholic drinks carry ~7
// cal/g of ethanol that the P*4+C*4+F*9 estimate can't see, so they MUST be
// exempt from the caloric-math check or they flag forever even when correct.
const ALC = /(alcohol|margarita|mojito|daiquiri|martini|cocktail|sangria|mimosa|bellini|negroni|paloma|colada|mai.?tai|michelada|tiki|spritz|\bbeer\b|\bale\b|lager|\bipa\b|pilsner|stout|porter|hefeweizen|saison|gose|radler|\bwine\b|chardonnay|cabernet|\bpinot\b|sauvignon|merlot|riesling|prosecco|champagne|ros[eé]|shiraz|tempranillo|malbec|\bcider\b|seltzer|\brum\b|vodka|tequila|whisk|bourbon|\bgin\b|\bsake\b|mezcal|liqueur|aperol|brewing|brewery|draft|draught|\babv\b|old fashioned|long island|moscow mule|highball|spirits?\b|frosé|frose)/i

/** True when the stored nutrition is physically impossible / internally inconsistent. */
function isImplausible(nd: any, text: string): boolean {
  if (!nd) return false
  const cal = nd.calories, c = nd.carbs, f = nd.fat, p = nd.protein, sg = nd.sugar, fb = nd.fiber
  if (c != null && cal != null && cal > 0 && c * 4 > cal * 1.15) return true // carbs exceed total calories
  if (sg != null && c != null && sg > c + 1) return true // sugar > carbs
  if (fb != null && c != null && fb > c + 1) return true // fiber > carbs
  if (cal != null && cal > 50 && c != null && f != null && p != null && !ALC.test(text)) {
    const est = p * 4 + c * 4 + f * 9
    if (Math.abs(cal - est) / cal > 0.45) return true // caloric-math gap (non-alcohol)
  }
  return false
}

async function fetchAll<T>(table: string, cols: string): Promise<T[]> {
  const out: T[] = []
  const page = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from(table).select(cols).range(from, from + page - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    out.push(...(data as T[]))
    if (data.length < page) break
    from += page
  }
  return out
}

async function main() {
  const items = await fetchAll<any>(
    'menu_items',
    'id, name, description, restaurant:restaurants(name, park:parks(name)), nutritional_data(calories, carbs, fat, protein, sugar, fiber, confidence_score)',
  )
  const cand = items
    .filter(it => {
      const nd = it.nutritional_data?.[0]
      const r = Array.isArray(it.restaurant) ? it.restaurant[0] : it.restaurant
      if (CHAIN.test(r?.name ?? '')) return false
      if (FLAGGED) {
        // Wrong-data targeting: implausible nutrition, not yet authoritative.
        return isImplausible(nd, `${it.name} ${it.description ?? ''}`) && (nd?.confidence_score ?? 0) < 70
      }
      return (nd?.confidence_score ?? 0) < MAX_CONF
        && it.description && it.description.trim().length > 10
    })
    .map(it => {
      const r = Array.isArray(it.restaurant) ? it.restaurant[0] : it.restaurant
      const nd = it.nutritional_data?.[0]
      return {
        id: it.id, name: it.name, description: it.description,
        restaurant: r?.name ?? '', park: r?.park?.name ?? '',
        curCal: nd?.calories ?? null, curCarbs: nd?.carbs ?? null, conf: nd?.confidence_score ?? null,
      }
    })
    .slice(0, Number.isFinite(LIMIT) ? LIMIT : undefined)

  const dir = resolve(__dirname, '..', 'data', 'ai-batches')
  if (existsSync(dir)) for (const f of readdirSync(dir)) rmSync(resolve(dir, f))
  else mkdirSync(dir, { recursive: true })

  let n = 0
  for (let i = 0; i < cand.length; i += BATCH) {
    n++
    const batch = cand.slice(i, i + BATCH)
    writeFileSync(resolve(dir, `batch-${String(n).padStart(3, '0')}.json`), JSON.stringify(batch, null, 2))
  }

  console.log(`Candidates (park-unique, conf < ${MAX_CONF}, with description, non-chain): ${cand.length}`)
  console.log(`Wrote ${n} batch file(s) of up to ${BATCH} items to data/ai-batches/`)
  console.log(`\nNext: dispatch an Opus subagent per batch to write data/ai-nutrition.json, then:`)
  console.log(`  npm run import:ai            # dry-run`)
  console.log(`  npm run import:ai -- --apply # write`)
}

main().catch(err => { console.error(err); process.exit(1) })
