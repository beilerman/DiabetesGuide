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

// Known name variants → canonical name they should merge into.
// The canonical name MUST match an existing park row's name exactly.
const NAME_ALIASES: Record<string, string> = {
  'hollywood studios': "disney's hollywood studios",
  'magic kingdom': 'magic kingdom park',
  'universal volcano bay': "universal's volcano bay",
}

/** Paginate through all rows of a table to bypass the 1000-row default limit */
async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const PAGE = 1000
  const all: T[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    all.push(...(data as T[]))
    if (data.length < PAGE) break
    offset += PAGE
  }
  return all
}

async function main() {
  console.log('=== Park Deduplication Cleanup (Pass 2) ===\n')

  // 1. Fetch ALL parks (paginated)
  const allParks = await fetchAll<ParkRow>('parks', 'id, name, created_at')
  console.log(`Total parks in DB: ${allParks.length}`)

  // 2. Fetch ALL restaurants (paginated)
  const allRestaurants = await fetchAll<RestaurantRow>('restaurants', 'id, park_id')
  console.log(`Total restaurants in DB: ${allRestaurants.length}`)

  const restaurantsByPark = new Map<string, RestaurantRow[]>()
  for (const r of allRestaurants) {
    const list = restaurantsByPark.get(r.park_id) || []
    list.push(r)
    restaurantsByPark.set(r.park_id, list)
  }

  // 3. Group parks by normalized name, applying aliases
  const groups = new Map<string, ParkRow[]>()
  for (const park of allParks) {
    const lower = park.name.toLowerCase().trim()
    const normalized = NAME_ALIASES[lower] || lower
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
    // Pick canonical: most restaurants, then oldest created_at
    const sorted = parks.sort((a, b) => {
      const aCount = restaurantsByPark.get(a.id)?.length || 0
      const bCount = restaurantsByPark.get(b.id)?.length || 0
      if (bCount !== aCount) return bCount - aCount
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })

    const canonical = sorted[0]
    const duplicates = sorted.slice(1)
    const canonicalRestCount = restaurantsByPark.get(canonical.id)?.length || 0

    console.log(`"${name}" — keeping "${canonical.name}" ${canonical.id} (${canonicalRestCount} rests), removing ${duplicates.length} dupes`)

    // Process in batches to avoid request limits
    for (const dup of duplicates) {
      const dupRestaurants = restaurantsByPark.get(dup.id) || []

      if (dupRestaurants.length > 0) {
        const dupIds = dupRestaurants.map(r => r.id)
        const { error: updateErr } = await supabase
          .from('restaurants')
          .update({ park_id: canonical.id })
          .in('id', dupIds)
        if (updateErr) {
          console.error(`  Error reassigning from ${dup.id}: ${updateErr.message}`)
          continue
        }
        reassigned += dupRestaurants.length
      }

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

  // 4. Clean up any remaining parks with 0 restaurants
  console.log('\n--- Checking for empty parks (0 restaurants) ---')
  const remainingParks = await fetchAll<{ id: string; name: string }>('parks', 'id, name')
  const freshRests = await fetchAll<RestaurantRow>('restaurants', 'id, park_id')

  const freshCounts = new Map<string, number>()
  for (const r of freshRests) {
    freshCounts.set(r.park_id, (freshCounts.get(r.park_id) || 0) + 1)
  }

  let emptyDeleted = 0
  for (const park of remainingParks) {
    if ((freshCounts.get(park.id) || 0) === 0) {
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

  // 5. Final count
  const finalParks = await fetchAll<{ id: string }>('parks', 'id')

  console.log('\n=== Summary ===')
  console.log(`Restaurants reassigned: ${reassigned}`)
  console.log(`Duplicate parks deleted: ${deleted}`)
  console.log(`Empty parks deleted: ${emptyDeleted}`)
  console.log(`Parks remaining: ${finalParks.length}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
