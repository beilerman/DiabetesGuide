/**
 * Fix remaining Epic Universe audit findings.
 *
 * Post-audit fixes for items flagged by audit-nutrition.ts:
 * - Carved Staked Steak: 200 cal → 700 cal (steak was too low)
 * - Gigglewater: false positive (it's a themed soda, not water — 139 cal is correct)
 * - 59 alcohol caloric-math flags: expected false positives (alcohol cal = 7 cal/g, not tracked in macros)
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, key)
const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  console.log(`Epic Universe Audit Fix — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`)

  // Fix 1: Carved Staked Steak — a steak entree at 200 cal is way too low
  const { data: steakItems } = await supabase
    .from('menu_items')
    .select('id, name, nutritional_data(id, calories)')
    .ilike('name', '%Carved Staked Steak%')

  for (const item of steakItems || []) {
    const nd = Array.isArray(item.nutritional_data) ? item.nutritional_data[0] : item.nutritional_data
    if (!nd) continue
    const nutId = (nd as any).id
    const oldCal = (nd as any).calories

    if (DRY_RUN) {
      console.log(`FIX: "${item.name}" — ${oldCal} cal → 700 cal (steak entree too low)`)
    } else {
      const { error } = await supabase.from('nutritional_data').update({
        calories: 700, carbs: 10, fat: 35, protein: 55, sugar: 2, fiber: 1, sodium: 900,
        confidence_score: 40
      }).eq('id', nutId)
      if (error) console.error(`Error fixing ${item.name}:`, error.message)
      else console.log(`FIX: "${item.name}" — ${oldCal} cal → 700 cal`)
    }
  }

  console.log('\nNOTE: 59 HIGH caloric-math flags for alcoholic drinks are EXPECTED false positives.')
  console.log('NOTE: Gigglewater flagged as "water" is actually a themed soda — 139 cal is correct.')
  console.log(`\nMode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
