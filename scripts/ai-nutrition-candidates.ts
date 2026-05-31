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

const CHAIN = /starbucks|panda express|cinnabon|cold stone|haagen|ben\s*&?\s*jerry|blaze|earl of sandwich|wetzel|jamba|chicken guy|sprinkles|skyline|larosa|auntie anne|subway|chipotle|shake shack|dunkin/i

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
    'id, name, description, restaurant:restaurants(name, park:parks(name)), nutritional_data(calories, carbs, confidence_score)',
  )
  const cand = items
    .filter(it => {
      const nd = it.nutritional_data?.[0]
      const r = Array.isArray(it.restaurant) ? it.restaurant[0] : it.restaurant
      return (nd?.confidence_score ?? 0) < MAX_CONF
        && it.description && it.description.trim().length > 10
        && !CHAIN.test(r?.name ?? '')
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
