/**
 * import-ai-nutrition.ts — Apply Opus-generated, web/recipe-grounded nutrition.
 *
 * Reads data/ai-nutrition.json (produced by Opus subagents that research copycat
 * recipes / published figures and decompose items into components) and updates
 * each item's nutrition BY ID. Honest confidence tiers come from the generator:
 *   published/official ~75, recipe-computed ~60, decomposition ~50.
 *
 * SAFE by default: dry-run (prints, writes nothing). Pass --apply to write.
 * Only overwrites items whose existing confidence is BELOW the new value, so it
 * never downgrades better data.
 *
 * Usage:
 *   npx tsx scripts/import-ai-nutrition.ts            # dry-run
 *   npx tsx scripts/import-ai-nutrition.ts --apply
 *   npx tsx scripts/import-ai-nutrition.ts --file=data/ai-nutrition-batch2.json --apply
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
// --force: overwrite even when existing confidence is >= the new value. Use for
// the flagged run, where the existing data is provably WRONG (internally
// inconsistent) regardless of its confidence label.
const FORCE = process.argv.includes('--force')
const fileArg = process.argv.find(a => a.startsWith('--file='))
const FILE = fileArg ? fileArg.split('=')[1] : 'data/ai-nutrition.json'

const RANGES: Record<string, [number, number]> = {
  calories: [0, 5000], carbs: [0, 600], fat: [0, 400], protein: [0, 300],
  sugar: [0, 400], fiber: [0, 100], sodium: [0, 20000], cholesterol: [0, 3000],
}
const NUT_FIELDS = Object.keys(RANGES) as (keyof typeof RANGES)[]

interface Entry {
  id: string
  name?: string
  calories: number; carbs: number
  fat?: number; protein?: number; sugar?: number; fiber?: number; sodium?: number; cholesterol?: number
  confidence: number
  source?: string // 'official' | 'crowdsourced'
  method?: string
  sourceUrl?: string
  note?: string
}

function sane(e: Entry): string | null {
  for (const f of NUT_FIELDS) {
    const v = (e as any)[f]
    if (v == null) continue
    if (typeof v !== 'number' || !Number.isFinite(v)) return `${f} not a number`
    const [min, max] = RANGES[f]
    if (v < min || v > max) return `${f}=${v} out of range`
  }
  if (e.calories == null || e.carbs == null) return 'missing calories/carbs'
  if (e.sugar != null && e.sugar > e.carbs + 1) return `sugar>${e.carbs} carbs`
  if (e.fiber != null && e.fiber > e.carbs + 1) return `fiber>${e.carbs} carbs`
  // Atwater plausibility — SKIP for alcoholic drinks, whose ~7 cal/g of alcohol
  // is invisible to the P*4+C*4+F*9 estimate (the documented caloric-math gap).
  // Check name AND the generator's note (creative cocktail names like
  // "Tequilasaurus"/"Uh-Oa!" don't contain a keyword, but the note does).
  const text = `${e.name ?? ''} ${e.note ?? ''}`
  const isAlcohol = /(alcohol|margarita|mojito|daiquiri|martini|cocktail|sangria|mimosa|bellini|negroni|paloma|colada|mai.?tai|michelada|tiki|spritz|jungle juice|icefall|beer|wine|cider|seltzer|\brum\b|vodka|tequila|whiskey|bourbon|\bgin\b|sake|mezcal|liqueur|aperol|prosecco|champagne|hard )/i.test(text)
  if (!isAlcohol && e.fat != null && e.protein != null) {
    const est = e.protein * 4 + e.carbs * 4 + e.fat * 9
    if (e.calories > 50 && Math.abs(e.calories - est) / e.calories > 0.45) return `caloric math off (stated ${e.calories}, macros imply ${Math.round(est)})`
  }
  return null
}

async function main() {
  const path = resolve(__dirname, '..', FILE)
  const json = JSON.parse(readFileSync(path, 'utf-8')) as { entries: Entry[] }
  console.log(`Loaded ${json.entries.length} entries from ${FILE}`)
  console.log(APPLY ? '\n*** APPLYING ***\n' : '\n(dry-run — pass --apply to write)\n')

  let written = 0, skippedBetter = 0, rejected = 0
  for (const e of json.entries) {
    const bad = sane(e)
    if (bad) { console.log(`  REJECT ${e.name ?? e.id}: ${bad}`); rejected++; continue }

    const { data: nd } = await supabase
      .from('nutritional_data').select('id, confidence_score').eq('menu_item_id', e.id).limit(1)
    const existing = nd?.[0]
    if (!FORCE && existing && (existing.confidence_score ?? 0) >= e.confidence) {
      skippedBetter++
      continue
    }

    const fields: Record<string, unknown> = {
      source: e.source ?? 'crowdsourced',
      confidence_score: e.confidence,
    }
    for (const f of NUT_FIELDS) if ((e as any)[f] != null) fields[f] = (e as any)[f]

    console.log(`  ${APPLY ? 'WRITE' : 'would write'} ${e.name ?? e.id}: ${e.calories}cal/${e.carbs}g [${e.method ?? '?'}, conf ${e.confidence}]`)
    if (APPLY) {
      const { error } = existing
        ? await supabase.from('nutritional_data').update(fields).eq('id', existing.id)
        : await supabase.from('nutritional_data').insert({ menu_item_id: e.id, ...fields })
      if (error) console.error(`    write failed: ${error.message}`)
      else written++
    } else {
      written++
    }
  }

  console.log(`\n=== ${APPLY ? 'Applied' : 'Dry-run'}: ${written} ${APPLY ? 'written' : 'to write'}, ${skippedBetter} skipped (already better), ${rejected} rejected ===`)
}

main().catch(err => { console.error(err); process.exit(1) })
