/**
 * One-off: collapse the apostrophe-less Universal park duplicates that the
 * weekly sync re-introduced on 2026-05-04, preserving any unique items.
 *
 * For each restaurant in the duplicate park:
 *   - find the matching restaurant in the canonical park (by normalized name)
 *   - move only items that don't already exist in the canonical restaurant
 *     (delete the rest as duplicates; cascade removes their nutrition/allergens)
 *   - delete the duplicate restaurant
 * Then delete the duplicate park.
 *
 * Pairs to merge: "Universal Epic Universe" → "Universal's Epic Universe"
 *                 "Universal Volcano Bay"   → "Universal's Volcano Bay"
 *
 * Safety:
 *   - Pass --dry-run to preview every mutation without writing.
 *   - Per-pair precondition check: if the dup_park_id no longer exists, the
 *     pair is skipped cleanly (so re-runs after a successful run are no-ops).
 *   - The PostgREST API does not expose multi-statement transactions, so
 *     mid-run failures may leave a partially-merged pair. Re-run picks up
 *     where it left off because reparenting+deletion are individually idempotent
 *     and missing-source-park is treated as "already done."
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const DRY_RUN = process.argv.includes('--dry-run')
if (DRY_RUN) console.log('*** DRY RUN — no writes will be issued ***\n')

const PAIRS = [
  { dup: '096eaaa9-0dde-458b-b62b-97a353ad629c', canonical: '64a10d2d-0dfb-4458-ab90-5ecd7f325640', label: "Universal['s] Epic Universe" },
  { dup: '7440e897-bdbf-48fc-b0ab-90f7e9180a51', canonical: 'a4326c2c-26fa-446e-b843-bc3282a2f667', label: "Universal['s] Volcano Bay" },
]

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

interface Restaurant {
  id: string
  name: string
  park_id: string
}
interface MenuItem {
  id: string
  restaurant_id: string
  name: string
}

async function parkExists(id: string): Promise<boolean> {
  const { data, error } = await sb.from('parks').select('id').eq('id', id).maybeSingle()
  if (error) throw new Error(`parkExists(${id}): ${error.message}`)
  return data != null
}

async function listRestaurants(parkId: string): Promise<Restaurant[]> {
  const { data, error } = await sb.from('restaurants').select('id, name, park_id').eq('park_id', parkId)
  if (error) throw new Error(`restaurants(${parkId}): ${error.message}`)
  return (data ?? []) as Restaurant[]
}

async function listItems(restaurantId: string): Promise<MenuItem[]> {
  const { data, error } = await sb.from('menu_items').select('id, restaurant_id, name').eq('restaurant_id', restaurantId)
  if (error) throw new Error(`items(${restaurantId}): ${error.message}`)
  return (data ?? []) as MenuItem[]
}

async function deleteRestaurant(id: string, name: string): Promise<void> {
  if (DRY_RUN) { console.log(`  [dry-run] delete restaurant ${id} (${name})`); return }
  const { error } = await sb.from('restaurants').delete().eq('id', id)
  if (error) throw new Error(`delete restaurant ${id}: ${error.message}`)
}

async function deleteItem(id: string, name: string): Promise<void> {
  if (DRY_RUN) { console.log(`  [dry-run] delete item ${id} (${name})`); return }
  const { error } = await sb.from('menu_items').delete().eq('id', id)
  if (error) throw new Error(`delete item ${id}: ${error.message}`)
}

async function reparentItem(itemId: string, name: string, newRestaurantId: string): Promise<void> {
  if (DRY_RUN) { console.log(`  [dry-run] reparent item ${itemId} (${name}) -> restaurant ${newRestaurantId}`); return }
  const { error } = await sb.from('menu_items').update({ restaurant_id: newRestaurantId }).eq('id', itemId)
  if (error) throw new Error(`reparent item ${itemId}: ${error.message}`)
}

async function reparentRestaurant(restaurantId: string, name: string, newParkId: string): Promise<void> {
  if (DRY_RUN) { console.log(`  [dry-run] reparent restaurant ${restaurantId} (${name}) -> park ${newParkId}`); return }
  const { error } = await sb.from('restaurants').update({ park_id: newParkId }).eq('id', restaurantId)
  if (error) throw new Error(`reparent restaurant ${restaurantId}: ${error.message}`)
}

async function deletePark(id: string, label: string): Promise<void> {
  if (DRY_RUN) { console.log(`  [dry-run] delete park ${id} (${label})`); return }
  const { error } = await sb.from('parks').delete().eq('id', id)
  if (error) throw new Error(`delete park ${id}: ${error.message}`)
}

async function processPair(label: string, dupParkId: string, canonicalParkId: string) {
  console.log(`\n=== ${label} ===`)

  // Precondition: skip cleanly if the duplicate park is already gone.
  const [dupOK, canonOK] = await Promise.all([parkExists(dupParkId), parkExists(canonicalParkId)])
  if (!dupOK) {
    console.log(`  duplicate park ${dupParkId} not found — already deduped, skipping`)
    return
  }
  if (!canonOK) {
    console.error(`  canonical park ${canonicalParkId} missing — refusing to orphan restaurants`)
    return
  }

  const dupRests = await listRestaurants(dupParkId)
  const canonRests = await listRestaurants(canonicalParkId)
  const canonByName = new Map(canonRests.map(r => [normalize(r.name), r]))

  let movedItems = 0
  let droppedItemDupes = 0
  let reparentedRests = 0
  let droppedRests = 0

  for (const dupR of dupRests) {
    const twin = canonByName.get(normalize(dupR.name))
    if (!twin) {
      await reparentRestaurant(dupR.id, dupR.name, canonicalParkId)
      reparentedRests++
      console.log(`  reparented restaurant: ${dupR.name}`)
      continue
    }

    // Twin exists — merge items
    const dupItems = await listItems(dupR.id)
    const canonItems = await listItems(twin.id)
    const canonByItemName = new Set(canonItems.map(i => normalize(i.name)))

    for (const item of dupItems) {
      if (canonByItemName.has(normalize(item.name))) {
        await deleteItem(item.id, item.name)
        droppedItemDupes++
      } else {
        await reparentItem(item.id, item.name, twin.id)
        canonByItemName.add(normalize(item.name))
        movedItems++
      }
    }
    await deleteRestaurant(dupR.id, dupR.name)
    droppedRests++
  }

  await deletePark(dupParkId, label)
  console.log(`  Reparented restaurants: ${reparentedRests}`)
  console.log(`  Dropped duplicate restaurants: ${droppedRests}`)
  console.log(`  Items moved to canonical: ${movedItems}`)
  console.log(`  Items dropped as duplicates: ${droppedItemDupes}`)
  console.log(`  Deleted park: ${label.split(' ')[0]} (no apostrophe)`)
}

async function main() {
  for (const p of PAIRS) {
    await processPair(p.label, p.dup, p.canonical)
  }

  // Backfill empty nutrition shells for any items that are now orphaned
  console.log('\n=== Backfilling empty nutrition shells ===')
  const pageSize = 1000
  const itemIds: string[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from('menu_items').select('id').range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    for (const r of data) itemIds.push((r as { id: string }).id)
    if (data.length < pageSize) break
    from += pageSize
  }
  const nutIds = new Set<string>()
  from = 0
  while (true) {
    const { data, error } = await sb.from('nutritional_data').select('menu_item_id').range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    for (const r of data) nutIds.add((r as { menu_item_id: string }).menu_item_id)
    if (data.length < pageSize) break
    from += pageSize
  }
  const missing = itemIds.filter(id => !nutIds.has(id))
  console.log(`  Items still missing nutrition rows: ${missing.length}`)

  if (missing.length > 0) {
    if (DRY_RUN) {
      console.log(`  [dry-run] would insert ${missing.length} empty nutrition shells`)
    } else {
      const chunkSize = 100
      let inserted = 0
      for (let i = 0; i < missing.length; i += chunkSize) {
        const chunk = missing.slice(i, i + chunkSize).map(id => ({
          menu_item_id: id,
          source: 'crowdsourced',
          confidence_score: null,
        }))
        const { error } = await sb.from('nutritional_data').insert(chunk)
        if (error) console.error(`  insert chunk failed: ${error.message}`)
        else inserted += chunk.length
      }
      console.log(`  Inserted empty shells: ${inserted}`)
    }
  }

  console.log('\nDone.')
}

main().catch(err => {
  console.error('dedupe-universal-parks failed:', err)
  process.exit(1)
})
