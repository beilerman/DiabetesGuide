/**
 * Fix Hollywood Studios duplicate restaurants.
 *
 * Problem: 463 restaurant records for ~47 unique names.
 * The AllEars scraper created one restaurant per menu item.
 *
 * Strategy:
 *   1. Group all restaurants by normalized name
 *   2. For each group: pick the record with the most items as keeper
 *   3. Move unique items from other records to keeper
 *   4. Delete duplicate items
 *   5. Delete emptied restaurant records
 *   6. Handle name-variant groups (e.g., "50's Prime Time Café" vs "'50s Prime Time Cafe")
 *
 * Usage:
 *   npx tsx scripts/fix-hs-dupes.ts --dry-run
 *   npx tsx scripts/fix-hs-dupes.ts
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(url, key)

const DRY_RUN = process.argv.includes('--dry-run')

// Normalize restaurant name for grouping
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[éè]/g, 'e')
    .replace(/[àá]/g, 'a')
    .replace(/\s+/g, ' ')
    .trim()
}

// Name-variant merge rules: map variant names to canonical name
const NAME_ALIASES: Record<string, string> = {
  "50's prime time cafe": "'50s prime time cafe",
  "50's prime time café": "'50s prime time cafe",
  "sci fi dine-in theater": "sci-fi dine-in theater",
  "the trolley car cafe - starbucks": "the trolley car cafe (starbucks)",
  "the trolley car cafe - starbucks - all-day updated": "the trolley car cafe (starbucks)",
  "trolley car cafe": "the trolley car cafe (starbucks)",
  "the trolley car café": "the trolley car cafe (starbucks)",
}

// Preferred display names for the keeper
const DISPLAY_NAMES: Record<string, string> = {
  "'50s prime time cafe": "'50s Prime Time Café",
  "sci-fi dine-in theater": "Sci-Fi Dine-In Theater Restaurant",
  "the trolley car cafe (starbucks)": "The Trolley Car Café (Starbucks)",
}

async function main() {
  const { data: park } = await sb.from('parks').select('id, name')
    .eq('name', "Disney's Hollywood Studios").single()
  if (!park) { console.error("Disney's Hollywood Studios not found"); process.exit(1) }

  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Park: ${park.name} (${park.id})\n`)

  // 1. Get ALL restaurants for this park
  const { data: allRests, error: restErr } = await sb
    .from('restaurants')
    .select('id, name, land, cuisine_type')
    .eq('park_id', park.id)

  if (restErr || !allRests) {
    console.error('Failed to fetch restaurants:', restErr?.message)
    process.exit(1)
  }

  console.log(`Total restaurant records: ${allRests.length}`)

  // 2. Get item counts for each restaurant
  const restWithCounts: { id: string; name: string; land: string | null; cuisine_type: string | null; itemCount: number }[] = []

  for (const rest of allRests) {
    const { count } = await sb
      .from('menu_items')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', rest.id)

    restWithCounts.push({ ...rest, itemCount: count ?? 0 })
  }

  // 3. Group by normalized name (with alias resolution)
  const groups = new Map<string, typeof restWithCounts>()

  for (const rest of restWithCounts) {
    let normName = normalize(rest.name)
    // Apply aliases
    if (NAME_ALIASES[normName]) {
      normName = NAME_ALIASES[normName]
    }
    if (!groups.has(normName)) groups.set(normName, [])
    groups.get(normName)!.push(rest)
  }

  console.log(`Unique names (after alias resolution): ${groups.size}\n`)

  let totalMoved = 0
  let totalDeletedItems = 0
  let totalDeletedRests = 0

  // 4. Process each group
  for (const [normName, records] of groups) {
    if (records.length === 1) continue // No duplicates

    // Sort by item count desc — highest count is keeper
    records.sort((a, b) => b.itemCount - a.itemCount)
    const keeper = records[0]
    const dupes = records.slice(1)

    const totalItems = records.reduce((s, r) => s + r.itemCount, 0)
    console.log(`\n=== ${keeper.name} === (${records.length} records, ${totalItems} total items)`)
    console.log(`  Keeper: "${keeper.name}" (${keeper.land}) — ${keeper.itemCount} items [${keeper.id}]`)

    // Get existing item names in keeper
    const { data: keeperItems } = await sb
      .from('menu_items')
      .select('name')
      .eq('restaurant_id', keeper.id)

    const keeperNames = new Set((keeperItems ?? []).map(i => i.name.toLowerCase().trim()))

    for (const dupe of dupes) {
      if (dupe.itemCount === 0) {
        // Empty record, just delete
        console.log(`  Drop empty: "${dupe.name}" [${dupe.id}]`)
        if (!DRY_RUN) {
          await sb.from('restaurants').delete().eq('id', dupe.id)
        }
        totalDeletedRests++
        continue
      }

      const { data: dupeItems } = await sb
        .from('menu_items')
        .select('id, name, category')
        .eq('restaurant_id', dupe.id)

      for (const item of dupeItems ?? []) {
        const isDupe = keeperNames.has(item.name.toLowerCase().trim())

        if (isDupe) {
          // Delete duplicate item + nutrition + allergens
          if (!DRY_RUN) {
            await sb.from('nutritional_data').delete().eq('menu_item_id', item.id)
            await sb.from('allergens').delete().eq('menu_item_id', item.id)
            await sb.from('menu_items').delete().eq('id', item.id)
          }
          totalDeletedItems++
        } else {
          // Move unique item to keeper
          if (!DRY_RUN) {
            await sb.from('menu_items').update({ restaurant_id: keeper.id }).eq('id', item.id)
          }
          keeperNames.add(item.name.toLowerCase().trim())
          totalMoved++
        }
      }

      // Delete the empty restaurant record
      if (!DRY_RUN) {
        await sb.from('restaurants').delete().eq('id', dupe.id)
      }
      totalDeletedRests++
    }

    // Rename keeper if we have a preferred display name
    const displayName = DISPLAY_NAMES[normName]
    if (displayName && keeper.name !== displayName) {
      console.log(`  Rename: "${keeper.name}" → "${displayName}"`)
      if (!DRY_RUN) {
        await sb.from('restaurants').update({ name: displayName }).eq('id', keeper.id)
      }
    }

    const finalCount = keeperNames.size
    console.log(`  Result: ${finalCount} unique items, ${dupes.length} records merged`)
  }

  // 5. Summary
  console.log(`\n========== SUMMARY ==========`)
  console.log(`  Items moved to keepers: ${totalMoved}`)
  console.log(`  Duplicate items deleted: ${totalDeletedItems}`)
  console.log(`  Restaurant records deleted: ${totalDeletedRests}`)
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no changes made)' : 'LIVE (changes applied)'}`)
}

main().catch(err => { console.error(err); process.exit(1) })
