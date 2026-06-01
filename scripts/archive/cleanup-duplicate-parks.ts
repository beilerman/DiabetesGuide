import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const supabase = createClient(url, key)

interface ParkRow {
  id: string
  name: string
  created_at: string
}

interface RestaurantRow {
  id: string
  park_id: string
}

async function main() {
  console.log('=== Park Deduplication Cleanup ===\n')

  // 1. Fetch all parks
  const { data: allParks, error: parkErr } = await supabase
    .from('parks')
    .select('id, name, created_at')
    .order('created_at')
  if (parkErr) throw parkErr

  console.log(`Total parks in DB: ${allParks.length}`)

  // 2. Fetch all restaurants (to count per park)
  const { data: allRestaurants, error: restErr } = await supabase
    .from('restaurants')
    .select('id, park_id')
  if (restErr) throw restErr

  const restaurantsByPark = new Map<string, RestaurantRow[]>()
  for (const r of allRestaurants) {
    const list = restaurantsByPark.get(r.park_id) || []
    list.push(r)
    restaurantsByPark.set(r.park_id, list)
  }

  // 3. Group parks by normalized name
  const groups = new Map<string, ParkRow[]>()
  for (const park of allParks) {
    const normalized = park.name.toLowerCase().trim()
    const list = groups.get(normalized) || []
    list.push(park)
    groups.set(normalized, list)
  }

  const duplicateGroups = [...groups.entries()].filter(([, parks]) => parks.length > 1)
  console.log(`Duplicate groups found: ${duplicateGroups.length}`)
  const totalDuplicates = duplicateGroups.reduce((sum, [, parks]) => sum + parks.length - 1, 0)
  console.log(`Total duplicate rows to remove: ${totalDuplicates}\n`)

  let reassigned = 0
  let deleted = 0

  for (const [name, parks] of duplicateGroups) {
    // Pick canonical: the one with most restaurants, ties broken by oldest created_at
    const sorted = parks.sort((a, b) => {
      const aCount = restaurantsByPark.get(a.id)?.length || 0
      const bCount = restaurantsByPark.get(b.id)?.length || 0
      if (bCount !== aCount) return bCount - aCount
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })

    const canonical = sorted[0]
    const duplicates = sorted.slice(1)
    const canonicalRestCount = restaurantsByPark.get(canonical.id)?.length || 0

    console.log(`"${name}" — keeping ${canonical.id} (${canonicalRestCount} restaurants), removing ${duplicates.length} duplicates`)

    for (const dup of duplicates) {
      const dupRestaurants = restaurantsByPark.get(dup.id) || []

      // Reassign restaurants from duplicate to canonical
      if (dupRestaurants.length > 0) {
        const dupIds = dupRestaurants.map(r => r.id)
        const { error: updateErr } = await supabase
          .from('restaurants')
          .update({ park_id: canonical.id })
          .in('id', dupIds)
        if (updateErr) {
          console.error(`  Error reassigning restaurants from ${dup.id}: ${updateErr.message}`)
          continue
        }
        reassigned += dupRestaurants.length
        console.log(`  Reassigned ${dupRestaurants.length} restaurants from ${dup.id}`)
      }

      // Delete the orphaned duplicate park
      const { error: delErr } = await supabase
        .from('parks')
        .delete()
        .eq('id', dup.id)
      if (delErr) {
        console.error(`  Error deleting ${dup.id}: ${delErr.message}`)
        continue
      }
      deleted++
    }
  }

  // 4. Clean up parks with 0 restaurants (empty shells that aren't canonical)
  console.log('\n--- Checking for empty parks (0 restaurants) ---')
  const { data: remainingParks, error: remErr } = await supabase
    .from('parks')
    .select('id, name')
  if (remErr) throw remErr

  // Refresh restaurant counts
  const { data: freshRests, error: freshErr } = await supabase
    .from('restaurants')
    .select('id, park_id')
  if (freshErr) throw freshErr

  const freshCounts = new Map<string, number>()
  for (const r of freshRests) {
    freshCounts.set(r.park_id, (freshCounts.get(r.park_id) || 0) + 1)
  }

  let emptyDeleted = 0
  for (const park of remainingParks) {
    const count = freshCounts.get(park.id) || 0
    if (count === 0) {
      console.log(`  Deleting empty park: "${park.name}" (${park.id})`)
      const { error: delErr } = await supabase
        .from('parks')
        .delete()
        .eq('id', park.id)
      if (delErr) {
        console.error(`  Error: ${delErr.message}`)
        continue
      }
      emptyDeleted++
    }
  }

  console.log('\n=== Summary ===')
  console.log(`Restaurants reassigned: ${reassigned}`)
  console.log(`Duplicate parks deleted: ${deleted}`)
  console.log(`Empty parks deleted: ${emptyDeleted}`)
  console.log(`Parks remaining: ${remainingParks.length - emptyDeleted}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
