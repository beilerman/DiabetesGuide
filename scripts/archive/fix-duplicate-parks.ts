import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const supabase = createClient(url, key)

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`)

  // Find duplicate park pairs that should be merged
  // "Magic Kingdom" should be merged into "Magic Kingdom Park"
  // Also check for "Hollywood Studios" vs "Disney's Hollywood Studios" etc.
  const MERGE_PAIRS: { keepName: string; dropNames: string[] }[] = [
    { keepName: 'Magic Kingdom Park', dropNames: ['Magic Kingdom'] },
    { keepName: "Disney's Hollywood Studios", dropNames: ['Hollywood Studios'] },
  ]

  for (const pair of MERGE_PAIRS) {
    console.log(`\n=== Merging "${pair.dropNames.join(', ')}" → "${pair.keepName}" ===\n`)

    // Find the keep park
    const { data: keepParks } = await supabase
      .from('parks')
      .select('id, name, location')
      .eq('name', pair.keepName)

    if (!keepParks || keepParks.length === 0) {
      console.log(`  SKIP: "${pair.keepName}" not found`)
      continue
    }
    const keepPark = keepParks[0]
    console.log(`  Keep: "${keepPark.name}" (${keepPark.id})`)

    for (const dropName of pair.dropNames) {
      const { data: dropParks } = await supabase
        .from('parks')
        .select('id, name, location')
        .eq('name', dropName)

      if (!dropParks || dropParks.length === 0) {
        console.log(`  SKIP: "${dropName}" not found`)
        continue
      }

      for (const dropPark of dropParks) {
        console.log(`  Drop: "${dropPark.name}" (${dropPark.id})`)

        // Get restaurants from the drop park
        const { data: dropRestaurants } = await supabase
          .from('restaurants')
          .select('id, name, land')
          .eq('park_id', dropPark.id)

        if (!dropRestaurants || dropRestaurants.length === 0) {
          console.log('  No restaurants to move.')
        } else {
          console.log(`  Restaurants to reassign: ${dropRestaurants.length}`)

          // Check for name collisions with keep park
          const { data: keepRestaurants } = await supabase
            .from('restaurants')
            .select('id, name')
            .eq('park_id', keepPark.id)

          const keepNames = new Set((keepRestaurants ?? []).map(r => r.name.toLowerCase()))

          for (const rest of dropRestaurants) {
            const isDuplicate = keepNames.has(rest.name.toLowerCase())
            if (isDuplicate) {
              // Find the matching restaurant in the keep park
              const match = (keepRestaurants ?? []).find(
                r => r.name.toLowerCase() === rest.name.toLowerCase()
              )!

              // Get items from the duplicate restaurant
              const { data: dropItems } = await supabase
                .from('menu_items')
                .select('id, name')
                .eq('restaurant_id', rest.id)

              // Get items from the keep restaurant
              const { data: keepItems } = await supabase
                .from('menu_items')
                .select('id, name')
                .eq('restaurant_id', match.id)

              const keepItemNames = new Set((keepItems ?? []).map(i => i.name.toLowerCase()))

              // Move items that don't already exist in the keep restaurant
              const newItems = (dropItems ?? []).filter(
                i => !keepItemNames.has(i.name.toLowerCase())
              )
              const dupeItems = (dropItems ?? []).filter(
                i => keepItemNames.has(i.name.toLowerCase())
              )

              console.log(`    "${rest.name}" — DUPLICATE (${(dropItems ?? []).length} items: ${newItems.length} unique, ${dupeItems.length} dupes)`)

              if (newItems.length > 0) {
                console.log(`      Moving ${newItems.length} unique items to keep restaurant`)
                for (const item of newItems) {
                  console.log(`        → "${item.name}"`)
                  if (!DRY_RUN) {
                    await supabase
                      .from('menu_items')
                      .update({ restaurant_id: match.id })
                      .eq('id', item.id)
                  }
                }
              }

              // Delete duplicate items (nutrition + allergen data will cascade? or need manual)
              if (dupeItems.length > 0) {
                console.log(`      Deleting ${dupeItems.length} duplicate items`)
                for (const item of dupeItems) {
                  console.log(`        ✕ "${item.name}"`)
                  if (!DRY_RUN) {
                    // Delete nutritional_data first (FK)
                    await supabase
                      .from('nutritional_data')
                      .delete()
                      .eq('menu_item_id', item.id)
                    // Delete allergens (FK)
                    await supabase
                      .from('allergens')
                      .delete()
                      .eq('menu_item_id', item.id)
                    // Delete menu item
                    await supabase
                      .from('menu_items')
                      .delete()
                      .eq('id', item.id)
                  }
                }
              }

              // Delete the duplicate restaurant (now empty)
              if (!DRY_RUN) {
                await supabase
                  .from('restaurants')
                  .delete()
                  .eq('id', rest.id)
              }
              console.log(`      Restaurant "${rest.name}" deleted`)

            } else {
              // No collision - just reassign park_id
              console.log(`    "${rest.name}" — MOVING to ${keepPark.name}`)
              if (!DRY_RUN) {
                await supabase
                  .from('restaurants')
                  .update({ park_id: keepPark.id })
                  .eq('id', rest.id)
              }
            }
          }
        }

        // Delete the drop park (now empty)
        console.log(`\n  Deleting park "${dropPark.name}" (${dropPark.id})`)
        if (!DRY_RUN) {
          const { error } = await supabase
            .from('parks')
            .delete()
            .eq('id', dropPark.id)
          if (error) {
            console.error(`    ERROR: ${error.message}`)
          } else {
            console.log('    Done.')
          }
        }
      }
    }
  }

  console.log(`\n${DRY_RUN ? 'DRY RUN complete — no changes made.' : 'All merges complete.'}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
