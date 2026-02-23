/**
 * Disney Springs — Second pass dedup for remaining duplicates
 * Merges: B.B. Wolf's Sausage Co. variants and duplicate Gideon's Bakehouse
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Set env vars'); process.exit(1) }

const sb = createClient(url, key)
const DRY_RUN = process.argv.includes('--dry-run')
const parkId = '54cddc44-ed3e-4475-bbfc-87369c7092c3'

async function mergeInto(keeperId: string, otherId: string, keeperName: string) {
  // Get keeper items for dedup check
  const { data: keeperItems } = await sb.from('menu_items').select('name').eq('restaurant_id', keeperId)
  const names = new Set((keeperItems || []).map(i => i.name.toLowerCase()))

  const { data: items } = await sb.from('menu_items').select('id, name').eq('restaurant_id', otherId)
  if (!items) return

  let moved = 0, dupes = 0
  for (const item of items) {
    if (names.has(item.name.toLowerCase())) {
      if (!DRY_RUN) {
        await sb.from('nutritional_data').delete().eq('menu_item_id', item.id)
        await sb.from('allergens').delete().eq('menu_item_id', item.id)
        await sb.from('menu_items').delete().eq('id', item.id)
      }
      dupes++
    } else {
      if (!DRY_RUN) {
        await sb.from('menu_items').update({ restaurant_id: keeperId }).eq('id', item.id)
      }
      names.add(item.name.toLowerCase())
      moved++
    }
  }

  if (!DRY_RUN) {
    await sb.from('restaurants').delete().eq('id', otherId)
  }

  console.log(`  ${keeperName}: moved ${moved}, dupes ${dupes}`)
}

async function main() {
  console.log(`Disney Springs Dedup Pass 2 — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`)

  // 1. Merge B.B. Wolf's Sausage Co. + Take-Out
  console.log('--- B.B. Wolf\'s Sausage Co. ---')
  const bbKeeper = '7b9e5a82-4048-49d1-aedd-f09e2519126b' // Take-Out (20 items)
  const bbOther = '8ef76ae8-d638-47ab-a72b-a128fad6ac8a'   // Original (4 items)
  await mergeInto(bbKeeper, bbOther, 'B.B. Wolf\'s Sausage Co.')
  // Rename to canonical
  if (!DRY_RUN) {
    await sb.from('restaurants').update({ name: 'B.B. Wolf\'s Sausage Co.' }).eq('id', bbKeeper)
  }
  console.log('  Renamed to: B.B. Wolf\'s Sausage Co.')

  // 2. Merge duplicate Gideon's Bakehouse
  console.log('\n--- Gideon\u2019s Bakehouse ---')
  const g1 = 'fdc00a87-dd0f-48d6-b1b0-48d90cbb5421' // 9 items (original)
  const g2 = '41a9c76f-3900-4d79-abe2-f6e15b5b5cf3' // 29 items (All-Day Updated, renamed)

  // Check which has more items
  const { count: c1 } = await sb.from('menu_items').select('id', { count: 'exact' }).eq('restaurant_id', g1)
  const { count: c2 } = await sb.from('menu_items').select('id', { count: 'exact' }).eq('restaurant_id', g2)
  console.log(`  Record 1: ${c1} items, Record 2: ${c2} items`)

  if ((c2 || 0) >= (c1 || 0)) {
    await mergeInto(g2, g1, 'Gideon\u2019s Bakehouse')
  } else {
    await mergeInto(g1, g2, 'Gideon\u2019s Bakehouse')
  }

  console.log('\nDone!')
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
