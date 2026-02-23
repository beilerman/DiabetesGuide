/**
 * Fix remaining HS duplicate restaurants (pass 2).
 * Handles name variants the automated pass missed:
 *   - "Hollywood & Vine" vs "Hollywood and Vine"
 *   - "The Hollywood Brown Derby" vs "Hollywood Brown Derby"
 *   - "The Hollywood Brown Derby Lounge" vs "Hollywood Brown Derby Lounge"
 *   - "Rosie's All-American" vs "Rosie's All-American Cafe"
 *   - "The Trolley Car Café" vs "The Trolley Car Café (Starbucks)" (same location)
 *   - "Min and Bill's Dockside Diner" - closed, merge with "Dockside Diner" or remove
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Set env vars'); process.exit(1) }
const sb = createClient(url, key)

const DRY_RUN = process.argv.includes('--dry-run')

interface MergeGroup {
  keep: string
  drop: string[]
  rename?: string
}

const MERGE_GROUPS: MergeGroup[] = [
  {
    keep: 'Hollywood and Vine',
    drop: ['Hollywood & Vine'],
  },
  {
    keep: 'Hollywood Brown Derby',
    drop: ['The Hollywood Brown Derby'],
    rename: 'The Hollywood Brown Derby',
  },
  {
    keep: 'Hollywood Brown Derby Lounge',
    drop: ['The Hollywood Brown Derby Lounge'],
    rename: 'The Hollywood Brown Derby Lounge',
  },
  {
    keep: "Rosie's All-American Cafe",
    drop: ["Rosie's All-American"],
    rename: "Rosie's All-American Café",
  },
  {
    keep: 'The Trolley Car Café (Starbucks)',
    drop: ['The Trolley Car Café'],
  },
  {
    // Min and Bill's closed in 2020, but items may still be available at Dockside Diner
    keep: 'Dockside Diner',
    drop: ["Min and Bill's Dockside Diner"],
  },
]

async function main() {
  const { data: park } = await sb.from('parks').select('id').eq('name', "Disney's Hollywood Studios").single()
  if (!park) { console.error('Park not found'); process.exit(1) }

  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Park ID: ${park.id}\n`)

  let totalMoved = 0, totalDeleted = 0, totalDeletedRests = 0

  for (const group of MERGE_GROUPS) {
    console.log(`\n=== ${group.keep} ===`)

    // Find keeper
    const { data: keepRests } = await sb.from('restaurants')
      .select('id, name, land')
      .eq('park_id', park.id)
      .eq('name', group.keep)

    if (!keepRests || keepRests.length === 0) {
      console.log(`  SKIP: "${group.keep}" not found`)
      continue
    }

    const keepRest = keepRests[0]
    const { data: keepItems } = await sb.from('menu_items').select('name').eq('restaurant_id', keepRest.id)
    const keepNames = new Set((keepItems ?? []).map(i => i.name.toLowerCase().trim()))
    console.log(`  Keeper: "${keepRest.name}" (${keepRest.land}) — ${keepNames.size} items`)

    for (const dropName of group.drop) {
      const { data: dropRests } = await sb.from('restaurants')
        .select('id, name, land')
        .eq('park_id', park.id)
        .eq('name', dropName)

      if (!dropRests || dropRests.length === 0) {
        console.log(`  SKIP: "${dropName}" not found`)
        continue
      }

      for (const dropRest of dropRests) {
        const { data: dropItems } = await sb.from('menu_items')
          .select('id, name, category')
          .eq('restaurant_id', dropRest.id)

        console.log(`  Drop: "${dropRest.name}" (${dropRest.land}) — ${dropItems?.length ?? 0} items`)

        for (const item of dropItems ?? []) {
          const isDupe = keepNames.has(item.name.toLowerCase().trim())

          if (isDupe) {
            console.log(`    DELETE dupe: ${item.name}`)
            if (!DRY_RUN) {
              await sb.from('nutritional_data').delete().eq('menu_item_id', item.id)
              await sb.from('allergens').delete().eq('menu_item_id', item.id)
              await sb.from('menu_items').delete().eq('id', item.id)
            }
            totalDeleted++
          } else {
            console.log(`    MOVE unique: ${item.name} [${item.category}]`)
            if (!DRY_RUN) {
              await sb.from('menu_items').update({ restaurant_id: keepRest.id }).eq('id', item.id)
            }
            keepNames.add(item.name.toLowerCase().trim())
            totalMoved++
          }
        }

        console.log(`    DELETE restaurant: "${dropRest.name}"`)
        if (!DRY_RUN) {
          await sb.from('restaurants').delete().eq('id', dropRest.id)
        }
        totalDeletedRests++
      }
    }

    // Rename if specified
    if (group.rename && keepRest.name !== group.rename) {
      console.log(`  RENAME: "${keepRest.name}" → "${group.rename}"`)
      if (!DRY_RUN) {
        await sb.from('restaurants').update({ name: group.rename }).eq('id', keepRest.id)
      }
    }

    console.log(`  Final: ${keepNames.size} unique items`)
  }

  console.log(`\n========== SUMMARY ==========`)
  console.log(`  Items moved: ${totalMoved}`)
  console.log(`  Duplicate items deleted: ${totalDeleted}`)
  console.log(`  Restaurants deleted: ${totalDeletedRests}`)
}

main().catch(err => { console.error(err); process.exit(1) })
