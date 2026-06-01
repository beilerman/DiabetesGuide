/**
 * Remove "- All-Day Updated" and similar suffixes from restaurant names across all parks.
 * Also removes "- Lunch/Dinner Updated", "- Snacks Updated", "- Breakfast Updated".
 *
 * Usage: npx tsx scripts/fix-allday-suffix.ts [--dry-run]
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Set env vars'); process.exit(1) }

const sb = createClient(url, key)
const DRY_RUN = process.argv.includes('--dry-run')

const SUFFIXES = [
  / - All-Day Updated$/,
  / - Lunch\/Dinner Updated$/,
  / - Snacks Updated$/,
  / - Breakfast Updated$/,
  / - Take-Out$/,
  / - All Day$/,
]

async function main() {
  console.log(`Fix restaurant name suffixes — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`)

  // Get all restaurants
  const { data: restaurants, error } = await sb
    .from('restaurants')
    .select('id, name, park_id')
    .order('name')

  if (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }

  let fixed = 0
  for (const r of (restaurants || [])) {
    for (const suffix of SUFFIXES) {
      if (suffix.test(r.name)) {
        const newName = r.name.replace(suffix, '')

        // Check if the clean name already exists at this park
        const { data: existing } = await sb
          .from('restaurants')
          .select('id')
          .eq('park_id', r.park_id)
          .eq('name', newName)

        if (existing && existing.length > 0) {
          console.log(`  SKIP (would create dupe): "${r.name}" → "${newName}"`)
          continue
        }

        console.log(`  RENAME: "${r.name}" → "${newName}"`)
        if (!DRY_RUN) {
          await sb.from('restaurants').update({ name: newName }).eq('id', r.id)
        }
        fixed++
        break
      }
    }
  }

  console.log(`\nTotal renamed: ${fixed}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
