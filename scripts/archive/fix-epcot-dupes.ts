import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Set env vars'); process.exit(1) }
const sb = createClient(url, key)

const DRY_RUN = process.argv.includes('--dry-run')

// Each group: first entry is the KEEP target, rest are DROP sources
const MERGE_GROUPS = [
  {
    keep: 'Regal Eagle Smokehouse: Crafts Drafts & Barbecue',
    drop: ['Regal Eagle Smokehouse'],
    // Outdoor Bar is a separate physical location, keep it
  },
  {
    keep: 'Boulangerie Patisserie les Halles',
    drop: ['Les Halles Boulangerie-Patisserie'],
  },
  {
    keep: 'Tangierine Cafe',
    drop: ['Tangierine Cafe: Flavors of the Medina'],
  },
  {
    keep: 'Sunshine Seasons - All-Day Updated',
    drop: ['Sunshine Seasons'],
    rename: 'Sunshine Seasons',
  },
  {
    keep: 'Connections Cafe',
    drop: ['Connections Cafe & Eatery', 'Connections Eatery - Lunch/Dinner Updated'],
    rename: 'Connections Cafe & Eatery',
  },
]

async function main() {
  const { data: park } = await sb.from('parks').select('id').eq('name', 'EPCOT').single()
  if (!park) { console.error('EPCOT not found'); process.exit(1) }

  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Park: EPCOT (${park.id})\n`)

  let totalMoved = 0
  let totalDeleted = 0
  let totalDropRestaurants = 0

  for (const group of MERGE_GROUPS) {
    console.log(`\n=== ${group.keep} ===`)

    // Find the keep restaurant
    const { data: keepRest } = await sb
      .from('restaurants')
      .select('id, name, land')
      .eq('park_id', park.id)
      .eq('name', group.keep)
      .single()

    if (!keepRest) {
      console.log(`  SKIP: "${group.keep}" not found`)
      continue
    }

    // Get existing item names in keep restaurant
    const { data: keepItems } = await sb
      .from('menu_items')
      .select('name')
      .eq('restaurant_id', keepRest.id)

    const keepNames = new Set((keepItems ?? []).map(i => i.name.toLowerCase().trim()))
    console.log(`  Keep: "${keepRest.name}" (${keepRest.land}) — ${keepNames.size} items`)

    for (const dropName of group.drop) {
      const { data: dropRest } = await sb
        .from('restaurants')
        .select('id, name, land')
        .eq('park_id', park.id)
        .eq('name', dropName)
        .single()

      if (!dropRest) {
        console.log(`  SKIP: "${dropName}" not found`)
        continue
      }

      const { data: dropItems } = await sb
        .from('menu_items')
        .select('id, name, category')
        .eq('restaurant_id', dropRest.id)

      console.log(`  Drop: "${dropRest.name}" (${dropRest.land}) — ${dropItems?.length ?? 0} items`)

      for (const item of dropItems ?? []) {
        const isDupe = keepNames.has(item.name.toLowerCase().trim())

        if (isDupe) {
          // Delete duplicate item (cascade: nutritional_data, allergens)
          console.log(`    DELETE dupe: ${item.name}`)
          if (!DRY_RUN) {
            await sb.from('nutritional_data').delete().eq('menu_item_id', item.id)
            await sb.from('allergens').delete().eq('menu_item_id', item.id)
            await sb.from('menu_items').delete().eq('id', item.id)
          }
          totalDeleted++
        } else {
          // Move unique item to keep restaurant
          console.log(`    MOVE unique: ${item.name} [${item.category}]`)
          if (!DRY_RUN) {
            await sb.from('menu_items').update({ restaurant_id: keepRest.id }).eq('id', item.id)
          }
          keepNames.add(item.name.toLowerCase().trim())
          totalMoved++
        }
      }

      // Delete the drop restaurant
      console.log(`    DELETE restaurant: "${dropRest.name}"`)
      if (!DRY_RUN) {
        await sb.from('restaurants').delete().eq('id', dropRest.id)
      }
      totalDropRestaurants++
    }

    // Rename if specified
    if (group.rename) {
      console.log(`  RENAME: "${keepRest.name}" → "${group.rename}"`)
      if (!DRY_RUN) {
        await sb.from('restaurants').update({ name: group.rename }).eq('id', keepRest.id)
      }
    }
  }

  console.log(`\n=== Summary ===`)
  console.log(`  Items moved: ${totalMoved}`)
  console.log(`  Items deleted (dupes): ${totalDeleted}`)
  console.log(`  Restaurants deleted: ${totalDropRestaurants}`)

  // Also handle Restaurant Marrakesh (permanently closed)
  console.log(`\n=== Restaurant Marrakesh (CLOSED) ===`)
  const { data: marrakesh } = await sb
    .from('restaurants')
    .select('id, name')
    .eq('park_id', park.id)
    .eq('name', 'Restaurant Marrakesh')
    .single()

  if (marrakesh) {
    const { data: mItems } = await sb
      .from('menu_items')
      .select('id, name')
      .eq('restaurant_id', marrakesh.id)

    console.log(`  Found: ${mItems?.length ?? 0} items`)
    for (const item of mItems ?? []) {
      console.log(`    DELETE: ${item.name}`)
      if (!DRY_RUN) {
        await sb.from('nutritional_data').delete().eq('menu_item_id', item.id)
        await sb.from('allergens').delete().eq('menu_item_id', item.id)
        await sb.from('menu_items').delete().eq('id', item.id)
      }
    }
    console.log(`  DELETE restaurant: "Restaurant Marrakesh"`)
    if (!DRY_RUN) {
      await sb.from('restaurants').delete().eq('id', marrakesh.id)
    }
  } else {
    console.log(`  Not found (already removed)`)
  }

  // Handle empty restaurants
  console.log(`\n=== Empty Restaurants ===`)
  const { data: allRests } = await sb
    .from('restaurants')
    .select('id, name, land')
    .eq('park_id', park.id)

  for (const rest of allRests ?? []) {
    const { count } = await sb
      .from('menu_items')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', rest.id)

    if (count === 0) {
      console.log(`  Empty: "${rest.name}" (${rest.land})`)
      // Don't auto-delete — some may be real restaurants that just need items
    }
  }
}

main().catch(err => { console.error(err); process.exit(1) })
