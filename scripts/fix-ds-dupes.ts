/**
 * Disney Springs — Duplicate Restaurant Merger
 *
 * Identifies duplicate restaurant records and merges them:
 * - Keeps the record with the most items as the "keeper"
 * - Moves unique items from duplicate records to the keeper
 * - Deletes empty duplicate records
 *
 * Usage: npx tsx scripts/fix-ds-dupes.ts [--dry-run]
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(url, key)
const DRY_RUN = process.argv.includes('--dry-run')

// Define merge groups: [canonical name, ...variant names]
const MERGE_GROUPS: [string, ...string[]][] = [
  // House of Blues complex
  ['House of Blues Restaurant and Bar', 'House of Blues', 'The Smokehouse at House of Blues', 'The Smokehouse'],
  // Food trucks & quick service
  ['4R Cantina Barbacoa Food Truck', '4 Rivers Cantina Barbacoa Food Truck'],
  ['Pepe by Jose Andres', 'Pepe'],
  ['Sunshine Churros', 'Sunshine Churros Cart'],
  ['Chicken Guy!', 'Chicken Guy'],
  ['The Daily Poutine Gourmet Frites', 'Daily Poutine'],
  ['Salt & Straw', 'Salt & Straw - All-Day Updated'],
  ['Vivoli il Gelato', 'Vivoli Gelateria - Snacks Updated'],
  ['Blaze Fast-Fire\'d Pizza', 'Blaze Pizza'],
  ['Everglazed Donuts & Cold Brew', 'Everglazed - All-Day Updated'],
  ['Ghirardelli Soda Fountain & Chocolate Shop', 'Ghirardelli Soda Fountain', 'Ghirardelli Soda Fountain and Chocolate Shop'],
  ['Raglan Road Irish Pub', 'Raglan Road'],
  ['City Works Eatery and Pour House', 'City Works Eatery'],
  ['Paradiso 37, Taste of the Americas', 'Paradiso 37'],
  ['The Polite Pig', 'Polite Pig'],
  ['Jaleo by Jose Andres', 'Jaleo'],
  ['Maria & Enzo\'s Ristorante', 'Maria and Enzo\'s Ristorante'],
  ['Gideon\u2019s Bakehouse', 'Gideon\u2019s Bakehouse - All-Day Updated'],
  ['Homecomin\'', 'Chef Art Smith\'s Homecomin\''],
  ['Starbucks - West Side', 'Starbucks - Marketplace'],
  // Note: Starbucks locations are DIFFERENT — one in West Side, one in Marketplace
  // Don't merge these — remove from list
]

// Actually remove the Starbucks entry — they're different locations
const GROUPS = MERGE_GROUPS.filter(g => g[0] !== 'Starbucks - West Side')

async function main() {
  console.log(`Disney Springs Duplicate Merger — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`)

  // Find Disney Springs park
  const { data: parks } = await sb.from('parks').select('id, name').ilike('name', '%Disney Springs%')
  if (!parks || parks.length === 0) {
    console.error('Disney Springs not found')
    process.exit(1)
  }
  const parkId = parks[0].id
  console.log(`Park: ${parks[0].name} (${parkId})\n`)

  let totalMoved = 0
  let totalDupesDeleted = 0
  let totalRestsDeleted = 0

  for (const group of GROUPS) {
    const canonicalName = group[0]
    const variants = group.slice(1)

    // Find all matching restaurants
    const allNames = [canonicalName, ...variants]
    const { data: rests } = await sb
      .from('restaurants')
      .select('id, name')
      .eq('park_id', parkId)
      .in('name', allNames)

    if (!rests || rests.length <= 1) {
      // Check if only one exists — might need rename
      if (rests && rests.length === 1 && rests[0].name !== canonicalName) {
        console.log(`RENAME: "${rests[0].name}" → "${canonicalName}"`)
        if (!DRY_RUN) {
          await sb.from('restaurants').update({ name: canonicalName }).eq('id', rests[0].id)
        }
      }
      continue
    }

    console.log(`--- ${canonicalName} (${rests.length} records) ---`)

    // Find keeper (most items)
    let keeper: { id: string; name: string; count: number } | null = null
    const others: { id: string; name: string; count: number }[] = []

    for (const r of rests) {
      const { count } = await sb.from('menu_items').select('id', { count: 'exact' }).eq('restaurant_id', r.id)
      const c = count || 0
      if (!keeper || c > keeper.count) {
        if (keeper) others.push(keeper)
        keeper = { ...r, count: c }
      } else {
        others.push({ ...r, count: c })
      }
    }

    console.log(`  Keeper: "${keeper!.name}" (${keeper!.count} items)`)

    // Get keeper's existing item names for dedup
    const { data: keeperItems } = await sb
      .from('menu_items')
      .select('name')
      .eq('restaurant_id', keeper!.id)

    const keeperNames = new Set((keeperItems || []).map(i => i.name.toLowerCase()))

    for (const other of others) {
      console.log(`  Merging: "${other.name}" (${other.count} items)`)

      if (other.count === 0) {
        // Just delete empty record
        if (!DRY_RUN) {
          await sb.from('restaurants').delete().eq('id', other.id)
        }
        totalRestsDeleted++
        continue
      }

      // Get items from this duplicate
      const { data: items } = await sb
        .from('menu_items')
        .select('id, name')
        .eq('restaurant_id', other.id)

      if (!items) continue

      let moved = 0
      let dupes = 0

      for (const item of items) {
        if (keeperNames.has(item.name.toLowerCase())) {
          // Duplicate — delete nutrition data first, then item
          if (!DRY_RUN) {
            await sb.from('nutritional_data').delete().eq('menu_item_id', item.id)
            await sb.from('allergens').delete().eq('menu_item_id', item.id)
            await sb.from('menu_items').delete().eq('id', item.id)
          }
          dupes++
          totalDupesDeleted++
        } else {
          // Unique — move to keeper
          if (!DRY_RUN) {
            await sb.from('menu_items').update({ restaurant_id: keeper!.id }).eq('id', item.id)
          }
          keeperNames.add(item.name.toLowerCase())
          moved++
          totalMoved++
        }
      }

      console.log(`    Moved: ${moved}, Dupes deleted: ${dupes}`)

      // Delete the now-empty restaurant record
      if (!DRY_RUN) {
        await sb.from('restaurants').delete().eq('id', other.id)
      }
      totalRestsDeleted++
    }

    // Rename keeper if needed
    if (keeper!.name !== canonicalName) {
      console.log(`  Renamed: "${keeper!.name}" → "${canonicalName}"`)
      if (!DRY_RUN) {
        await sb.from('restaurants').update({ name: canonicalName }).eq('id', keeper!.id)
      }
    }

    console.log('')
  }

  console.log(`\n=== Summary ===`)
  console.log(`Items moved: ${totalMoved}`)
  console.log(`Duplicate items deleted: ${totalDupesDeleted}`)
  console.log(`Restaurant records deleted: ${totalRestsDeleted}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
