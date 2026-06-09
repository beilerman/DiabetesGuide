/**
 * import-researched-nutrition.ts — Apply hand-researched OFFICIAL nutrition.
 *
 * Reads a researched-nutrition JSON file (source-cited values for packaged/branded
 * park items) and updates matching menu_items' nutrition. Each entry's `match`
 * regexes select items by name; `exclude` regexes veto false matches; optional
 * `restaurantMatch`/`restaurantExclude` regexes scope matching to specific
 * restaurants (REQUIRED for chain imports — "Caramel Frappuccino" must only
 * match at Starbucks locations). Only the nutrition fields present in an entry
 * are written (others untouched), with the entry's source + confidence and a
 * source_detail citation.
 *
 * SAFE by default: dry-run (prints matches, writes nothing). Pass --apply to
 * write. Never downgrades: rows whose existing confidence is >= the entry's
 * are skipped.
 *
 * Usage:
 *   npx tsx scripts/import-researched-nutrition.ts                                   # dry-run preview
 *   npx tsx scripts/import-researched-nutrition.ts --apply                           # write to DB
 *   npx tsx scripts/import-researched-nutrition.ts --file=data/chains/starbucks.json # per-chain file
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
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
const APPLY = process.argv.includes('--apply')
const fileArg = process.argv.find(a => a.startsWith('--file='))
const FILE = fileArg ? fileArg.split('=')[1] : 'data/researched-nutrition.json'

interface Entry {
  label: string
  match: string[]
  exclude?: string[]
  /** Restaurant-name regexes; when present, only items at matching restaurants are considered. */
  restaurantMatch?: string[]
  restaurantExclude?: string[]
  nutrition: Partial<Record<'calories' | 'carbs' | 'fat' | 'protein' | 'sugar' | 'fiber' | 'sodium' | 'cholesterol', number>>
  source: string
  confidence: number
  sourceUrl?: string
  note?: string
}

interface MenuItem {
  id: string
  name: string
  restaurant: { name: string } | null
  nutritional_data: { id: string; confidence_score: number | null }[]
}

async function fetchAll(): Promise<MenuItem[]> {
  const all: MenuItem[] = []
  const page = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('menu_items')
      .select('id, name, restaurant:restaurants(name), nutritional_data(id, confidence_score)')
      .range(from, from + page - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as unknown as MenuItem[]))
    if (data.length < page) break
    from += page
  }
  return all
}

function buildSourceDetail(entry: Entry): string | null {
  const parts = [entry.sourceUrl ? `source: ${entry.sourceUrl}` : '', entry.note].filter(Boolean)
  return parts.length > 0 ? parts.join(' | ') : null
}

async function main() {
  const file = resolve(__dirname, '..', FILE)
  const json = JSON.parse(readFileSync(file, 'utf-8')) as { entries: Entry[] }
  const items = await fetchAll()
  console.log(`Loaded ${json.entries.length} researched entries from ${FILE}; ${items.length} DB items.`)
  console.log(APPLY ? '\n*** APPLYING changes ***\n' : '\n(dry-run — pass --apply to write)\n')

  let totalMatched = 0, totalWritten = 0, skippedBetter = 0
  const claimed = new Set<string>() // prevent one item matching two entries

  for (const entry of json.entries) {
    const matchRx = entry.match.map(m => new RegExp(m, 'i'))
    const exclRx = (entry.exclude ?? []).map(m => new RegExp(m, 'i'))
    const restRx = (entry.restaurantMatch ?? []).map(m => new RegExp(m, 'i'))
    const restExclRx = (entry.restaurantExclude ?? []).map(m => new RegExp(m, 'i'))
    const matches = items.filter(it => {
      if (claimed.has(it.id)) return false
      const restaurantName = it.restaurant?.name ?? ''
      if (restRx.length > 0 && !restRx.some(rx => rx.test(restaurantName))) return false
      if (restExclRx.some(rx => rx.test(restaurantName))) return false
      const n = it.name
      return matchRx.some(rx => rx.test(n)) && !exclRx.some(rx => rx.test(n))
    })

    console.log(`\n${entry.label}  [${entry.source}, conf ${entry.confidence}]${entry.restaurantMatch ? `  @ ${entry.restaurantMatch.join(', ')}` : ''}`)
    console.log(`  ${entry.sourceUrl ?? ''}`)
    console.log(`  matched ${matches.length} item(s):`)
    for (const m of matches.slice(0, 25)) console.log(`    - ${m.name}  (${m.restaurant?.name ?? 'unknown restaurant'})`)
    if (matches.length > 25) console.log(`    ... and ${matches.length - 25} more`)
    totalMatched += matches.length

    if (!APPLY) {
      matches.forEach(m => claimed.add(m.id))
      continue
    }

    const fields: Record<string, unknown> = { ...entry.nutrition, source: entry.source, confidence_score: entry.confidence }
    const sourceDetail = buildSourceDetail(entry)
    if (sourceDetail) fields.source_detail = sourceDetail
    for (const m of matches) {
      const existing = m.nutritional_data?.[0]
      // Never downgrade: skip rows whose data is already at least this confident.
      if (existing && (existing.confidence_score ?? 0) >= entry.confidence) {
        claimed.add(m.id)
        skippedBetter++
        continue
      }
      const { error } = existing
        ? await supabase.from('nutritional_data').update(fields).eq('id', existing.id)
        : await supabase.from('nutritional_data').insert({ menu_item_id: m.id, ...fields })
      if (error) console.error(`    write failed for ${m.name}: ${error.message}`)
      else { totalWritten++; claimed.add(m.id) }
    }
  }

  console.log(`\n=== ${APPLY ? 'Applied' : 'Dry-run'}: ${totalMatched} items matched${APPLY ? `, ${totalWritten} written, ${skippedBetter} skipped (already better)` : ''} ===`)
  if (!APPLY) console.log('Re-run with --apply to write these values.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
