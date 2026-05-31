/**
 * import-researched-nutrition.ts — Apply hand-researched OFFICIAL nutrition.
 *
 * Reads data/researched-nutrition.json (source-cited values for packaged/branded
 * park items) and updates matching menu_items' nutrition. Each entry's `match`
 * regexes select items; `exclude` regexes veto false matches. Only the nutrition
 * fields present in an entry are written (others untouched), with the entry's
 * source + confidence.
 *
 * SAFE by default: dry-run (prints matches, writes nothing). Pass --apply to write.
 *
 * Usage:
 *   npx tsx scripts/import-researched-nutrition.ts            # dry-run preview
 *   npx tsx scripts/import-researched-nutrition.ts --apply    # write to DB
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

interface Entry {
  label: string
  match: string[]
  exclude?: string[]
  nutrition: Partial<Record<'calories' | 'carbs' | 'fat' | 'protein' | 'sugar' | 'fiber' | 'sodium' | 'cholesterol', number>>
  source: string
  confidence: number
  sourceUrl?: string
  note?: string
}

interface MenuItem {
  id: string
  name: string
  nutritional_data: { id: string }[]
}

async function fetchAll(): Promise<MenuItem[]> {
  const all: MenuItem[] = []
  const page = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('menu_items')
      .select('id, name, nutritional_data(id)')
      .range(from, from + page - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as unknown as MenuItem[]))
    if (data.length < page) break
    from += page
  }
  return all
}

async function main() {
  const file = resolve(__dirname, '..', 'data', 'researched-nutrition.json')
  const json = JSON.parse(readFileSync(file, 'utf-8')) as { entries: Entry[] }
  const items = await fetchAll()
  console.log(`Loaded ${json.entries.length} researched entries; ${items.length} DB items.`)
  console.log(APPLY ? '\n*** APPLYING changes ***\n' : '\n(dry-run — pass --apply to write)\n')

  let totalMatched = 0, totalWritten = 0
  const claimed = new Set<string>() // prevent one item matching two entries

  for (const entry of json.entries) {
    const matchRx = entry.match.map(m => new RegExp(m, 'i'))
    const exclRx = (entry.exclude ?? []).map(m => new RegExp(m, 'i'))
    const matches = items.filter(it => {
      if (claimed.has(it.id)) return false
      const n = it.name
      return matchRx.some(rx => rx.test(n)) && !exclRx.some(rx => rx.test(n))
    })

    console.log(`\n${entry.label}  [${entry.source}, conf ${entry.confidence}]`)
    console.log(`  ${entry.sourceUrl ?? ''}`)
    console.log(`  matched ${matches.length} item(s):`)
    for (const m of matches.slice(0, 25)) console.log(`    - ${m.name}`)
    if (matches.length > 25) console.log(`    ... and ${matches.length - 25} more`)
    totalMatched += matches.length

    if (!APPLY) {
      matches.forEach(m => claimed.add(m.id))
      continue
    }

    const fields = { ...entry.nutrition, source: entry.source, confidence_score: entry.confidence }
    for (const m of matches) {
      const ndId = m.nutritional_data?.[0]?.id
      const { error } = ndId
        ? await supabase.from('nutritional_data').update(fields).eq('id', ndId)
        : await supabase.from('nutritional_data').insert({ menu_item_id: m.id, ...fields })
      if (error) console.error(`    write failed for ${m.name}: ${error.message}`)
      else { totalWritten++; claimed.add(m.id) }
    }
  }

  console.log(`\n=== ${APPLY ? 'Applied' : 'Dry-run'}: ${totalMatched} items matched${APPLY ? `, ${totalWritten} written` : ''} ===`)
  if (!APPLY) console.log('Re-run with --apply to write these values.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
