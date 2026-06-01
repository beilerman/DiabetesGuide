/**
 * Universal Parks — Duplicate Restaurant Merger
 * Handles dupes across USF, IOA, Volcano Bay, and CityWalk
 *
 * Usage: npx tsx scripts/fix-universal-dupes.ts [--dry-run]
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Set env vars'); process.exit(1) }

const sb = createClient(url, key)
const DRY_RUN = process.argv.includes('--dry-run')

interface MergeGroup {
  parkPattern: string
  canonical: string
  variants: string[]
}

const GROUPS: MergeGroup[] = [
  // USF
  { parkPattern: 'Universal Studios Florida', canonical: 'San Francisco Pastry Company', variants: ['San Francisco Pastry Co.'] },
  // IOA
  { parkPattern: 'Islands of Adventure', canonical: 'Fire Eater\'s Grill', variants: ['Fire-Eater\'s Grill'] },
  // Volcano Bay
  { parkPattern: 'Volcano Bay', canonical: 'Bambu', variants: [] }, // same name, multiple records
  { parkPattern: 'Volcano Bay', canonical: 'Whakawaiwai Eats', variants: [] }, // same name, multiple records
  // CityWalk
  { parkPattern: 'CityWalk', canonical: 'The Cowfish Sushi Burger Bar', variants: ['The Cowfish'] },
]

async function mergeByNames(parkId: string, canonical: string, variants: string[]) {
  // Find all restaurants matching canonical or variant names
  const allNames = [canonical, ...variants]
  let rests: { id: string; name: string }[] = []

  if (variants.length > 0) {
    const { data } = await sb.from('restaurants').select('id, name').eq('park_id', parkId).in('name', allNames)
    rests = data || []
  } else {
    // Same name dupes — find all with this exact name
    const { data } = await sb.from('restaurants').select('id, name').eq('park_id', parkId).eq('name', canonical)
    rests = data || []
  }

  if (rests.length <= 1) return

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

  const { data: keeperItems } = await sb.from('menu_items').select('name').eq('restaurant_id', keeper!.id)
  const keeperNames = new Set((keeperItems || []).map(i => i.name.toLowerCase()))

  let totalMoved = 0, totalDupes = 0

  for (const other of others) {
    const { data: items } = await sb.from('menu_items').select('id, name').eq('restaurant_id', other.id)
    if (!items || items.length === 0) {
      if (!DRY_RUN) await sb.from('restaurants').delete().eq('id', other.id)
      console.log(`  Deleted empty: "${other.name}"`)
      continue
    }

    let moved = 0, dupes = 0
    for (const item of items) {
      if (keeperNames.has(item.name.toLowerCase())) {
        if (!DRY_RUN) {
          await sb.from('nutritional_data').delete().eq('menu_item_id', item.id)
          await sb.from('allergens').delete().eq('menu_item_id', item.id)
          await sb.from('menu_items').delete().eq('id', item.id)
        }
        dupes++
      } else {
        if (!DRY_RUN) {
          await sb.from('menu_items').update({ restaurant_id: keeper!.id }).eq('id', item.id)
        }
        keeperNames.add(item.name.toLowerCase())
        moved++
      }
    }

    if (!DRY_RUN) await sb.from('restaurants').delete().eq('id', other.id)
    console.log(`  Merged "${other.name}": ${moved} moved, ${dupes} dupes`)
    totalMoved += moved
    totalDupes += dupes
  }

  if (keeper!.name !== canonical) {
    if (!DRY_RUN) await sb.from('restaurants').update({ name: canonical }).eq('id', keeper!.id)
    console.log(`  Renamed → "${canonical}"`)
  }

  return { moved: totalMoved, dupes: totalDupes }
}

async function main() {
  console.log(`Universal Parks Dedup — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`)

  let grandMoved = 0, grandDupes = 0, grandDeleted = 0

  for (const group of GROUPS) {
    // Find the park
    const { data: parks } = await sb.from('parks').select('id, name').ilike('name', `%${group.parkPattern}%`)
    if (!parks || parks.length === 0) {
      console.log(`Park "${group.parkPattern}" not found — skipping`)
      continue
    }

    const parkId = parks[0].id
    console.log(`--- ${parks[0].name}: ${group.canonical} ---`)

    const result = await mergeByNames(parkId, group.canonical, group.variants)
    if (result) {
      grandMoved += result.moved
      grandDupes += result.dupes
      grandDeleted++
    }
    console.log('')
  }

  console.log(`\n=== Summary ===`)
  console.log(`Items moved: ${grandMoved}`)
  console.log(`Duplicate items deleted: ${grandDupes}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
