/**
 * Fix Animal Kingdom duplicate restaurants.
 *
 * Groups to merge:
 *   1. "Thirsty River Bar & Trek Snacks" → "Thirsty River Bar and Trek Snacks"
 *   2. "Yak & Yeti Restaurant" → "Yak and Yeti Restaurant"
 *   3. "Creature Comforts - Starbucks" + "Creature Comforts (Starbucks)" → keep larger
 *   4. "Flame Tree Barbecue" + "Flame Tree BBQ - Lunch/Dinner Updated" → "Flame Tree Barbecue"
 *   5. "Kusafiri Coffee Shop & Bakery" + "Kusafiri Coffee Shop and Bakery - Breakfast/Brunch" → "Kusafiri Coffee Shop & Bakery"
 *   6. "Eight Spoon Café" + "Eight Spoon Cafe - All-Day Updated" → "Eight Spoon Café"
 *   7. "Restaurantosaurus" + "Restaurantosaurus - CLOSED..." → "Restaurantosaurus" (keep lounge separate)
 *   8. "Tiffins" + "Tiffins Restaurant" → "Tiffins Restaurant"
 *   9. "Royal Anandapur Joffrey's..." + "Royal Anandapur Tea Company (Joffrey's)" → keep larger
 *  10. "Yak and Yeti Local Food Cafes" + "Yak & Yeti Local Foods Cafe" → "Yak & Yeti Local Food Cafes"
 *  11. Tusker House buffet station records → merge into "Tusker House Restaurant"
 *
 * Usage:
 *   npx tsx scripts/fix-ak-dupes.ts --dry-run
 *   npx tsx scripts/fix-ak-dupes.ts
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Set env vars'); process.exit(1) }
const sb = createClient(url, key)

const DRY_RUN = process.argv.includes('--dry-run')

interface MergeGroup {
  keepPattern: string        // substring match for the keeper
  dropPatterns: string[]     // substring matches for records to merge into keeper
  rename?: string            // rename keeper after merge
}

const MERGE_GROUPS: MergeGroup[] = [
  {
    keepPattern: 'Thirsty River Bar and Trek Snacks',
    dropPatterns: ['Thirsty River Bar & Trek Snacks'],
  },
  {
    keepPattern: 'Yak and Yeti Restaurant',
    dropPatterns: ['Yak & Yeti Restaurant'],
  },
  {
    keepPattern: 'Creature Comforts - Starbucks',
    dropPatterns: ['Creature Comforts (Starbucks)'],
    rename: 'Creature Comforts (Starbucks)',
  },
  {
    keepPattern: 'Flame Tree BBQ - Lunch/Dinner Updated',
    dropPatterns: ['Flame Tree Barbecue'],
    rename: 'Flame Tree Barbecue',
  },
  {
    keepPattern: 'Kusafiri Coffee Shop and Bakery - Breakfast/Brunch',
    dropPatterns: ['Kusafiri Coffee Shop & Bakery'],
    rename: 'Kusafiri Coffee Shop & Bakery',
  },
  {
    keepPattern: 'Eight Spoon Cafe - All-Day Updated',
    dropPatterns: ['Eight Spoon Café'],
    rename: 'Eight Spoon Café',
  },
  {
    keepPattern: 'Restaurantosaurus - CLOSED',
    dropPatterns: ['Restaurantosaurus'],
    rename: 'Restaurantosaurus',
  },
  {
    keepPattern: 'Tiffins Restaurant',
    dropPatterns: ['Tiffins'],  // exact "Tiffins" only, not "Tiffins Restaurant"
  },
  {
    keepPattern: 'Royal Anandapur Joffrey',
    dropPatterns: ['Royal Anandapur Tea Company'],
  },
  {
    keepPattern: 'Yak and Yeti Local Food Cafes',
    dropPatterns: ['Yak & Yeti Local Foods Cafe'],
    rename: 'Yak & Yeti Local Food Cafes',
  },
]

async function findRestaurant(parkId: string, pattern: string) {
  const { data } = await sb.from('restaurants')
    .select('id, name, land')
    .eq('park_id', parkId)
    .ilike('name', `%${pattern}%`)

  return data ?? []
}

async function main() {
  const { data: park } = await sb.from('parks').select('id, name')
    .eq('name', "Disney's Animal Kingdom").single()
  if (!park) { console.error('Park not found'); process.exit(1) }

  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Park: ${park.name} (${park.id})\n`)

  let totalMoved = 0, totalDeleted = 0, totalDeletedRests = 0

  for (const group of MERGE_GROUPS) {
    console.log(`\n=== ${group.keepPattern} ===`)

    // Find keeper
    const keepers = await findRestaurant(park.id, group.keepPattern)
    if (keepers.length === 0) {
      console.log(`  SKIP: No match for "${group.keepPattern}"`)
      continue
    }
    if (keepers.length > 1) {
      console.log(`  WARN: Multiple matches for "${group.keepPattern}": ${keepers.map(k => k.name).join(', ')}`)
    }
    const keeper = keepers[0]

    const { data: keepItems } = await sb.from('menu_items').select('name').eq('restaurant_id', keeper.id)
    const keepNames = new Set((keepItems ?? []).map(i => i.name.toLowerCase().trim()))
    console.log(`  Keeper: "${keeper.name}" (${keeper.land}) — ${keepNames.size} items`)

    for (const dropPattern of group.dropPatterns) {
      const drops = await findRestaurant(park.id, dropPattern)

      for (const dropRest of drops) {
        // Don't merge keeper with itself
        if (dropRest.id === keeper.id) continue
        // Don't merge "Restaurantosaurus Lounge" when merging Restaurantosaurus
        if (dropRest.name.includes('Lounge') && !dropPattern.includes('Lounge')) continue

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
              await sb.from('menu_items').update({ restaurant_id: keeper.id }).eq('id', item.id)
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

    if (group.rename && keeper.name !== group.rename) {
      console.log(`  RENAME: "${keeper.name}" → "${group.rename}"`)
      if (!DRY_RUN) {
        await sb.from('restaurants').update({ name: group.rename }).eq('id', keeper.id)
      }
    }

    console.log(`  Final: ${keepNames.size} unique items`)
  }

  // Handle Tusker House buffet station records
  console.log(`\n=== Tusker House Buffet Stations ===`)
  const tuskerMain = await findRestaurant(park.id, 'Tusker House Restaurant')
  if (tuskerMain.length > 0) {
    const keeper = tuskerMain[0]
    const { data: keepItems } = await sb.from('menu_items').select('name').eq('restaurant_id', keeper.id)
    const keepNames = new Set((keepItems ?? []).map(i => i.name.toLowerCase().trim()))
    console.log(`  Keeper: "${keeper.name}" — ${keepNames.size} items`)

    // Find all "Tusker House" variants except the main one
    const { data: allTusker } = await sb.from('restaurants')
      .select('id, name, land')
      .eq('park_id', park.id)
      .ilike('name', '%Tusker House%')

    for (const rest of allTusker ?? []) {
      if (rest.id === keeper.id) continue

      const { data: items } = await sb.from('menu_items')
        .select('id, name, category')
        .eq('restaurant_id', rest.id)

      console.log(`  Drop: "${rest.name}" — ${items?.length ?? 0} items`)

      for (const item of items ?? []) {
        const isDupe = keepNames.has(item.name.toLowerCase().trim())
        if (isDupe) {
          if (!DRY_RUN) {
            await sb.from('nutritional_data').delete().eq('menu_item_id', item.id)
            await sb.from('allergens').delete().eq('menu_item_id', item.id)
            await sb.from('menu_items').delete().eq('id', item.id)
          }
          totalDeleted++
        } else {
          if (!DRY_RUN) {
            await sb.from('menu_items').update({ restaurant_id: keeper.id }).eq('id', item.id)
          }
          keepNames.add(item.name.toLowerCase().trim())
          totalMoved++
        }
      }

      if (!DRY_RUN) {
        await sb.from('restaurants').delete().eq('id', rest.id)
      }
      totalDeletedRests++
    }
    console.log(`  Final: ${keepNames.size} unique items`)
  }

  console.log(`\n========== SUMMARY ==========`)
  console.log(`  Items moved: ${totalMoved}`)
  console.log(`  Duplicate items deleted: ${totalDeleted}`)
  console.log(`  Restaurant records deleted: ${totalDeletedRests}`)
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
}

main().catch(err => { console.error(err); process.exit(1) })
