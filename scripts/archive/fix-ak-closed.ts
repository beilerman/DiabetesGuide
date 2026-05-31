/**
 * Mark permanently closed Animal Kingdom restaurants.
 *
 * DinoLand U.S.A. → Tropical Americas retheme:
 * - Dino-Bite Snacks: Permanently closed Oct 2025
 * - Trilo-Bites: Permanently closed Oct 2025
 * - Restaurantosaurus: Closed Feb 1, 2026 (menu moved to Harambe Market)
 * - Restaurantosaurus Lounge: Closed with Restaurantosaurus
 *
 * Usage:
 *   npx tsx scripts/fix-ak-closed.ts --dry-run
 *   npx tsx scripts/fix-ak-closed.ts
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Set env vars'); process.exit(1) }
const sb = createClient(url, key)

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  const { data: park } = await sb.from('parks').select('id')
    .ilike('name', '%Animal Kingdom%').single()
  if (!park) { console.error('Park not found'); process.exit(1) }

  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`)

  const closedNames = [
    'Dino-Bite Snacks',
    'Trilo-Bites',
    'Restaurantosaurus',
    'Restaurantosaurus Lounge',
  ]

  let count = 0
  for (const name of closedNames) {
    const { data: rest } = await sb.from('restaurants').select('id, name, land')
      .eq('park_id', park.id).eq('name', name).single()

    if (!rest) {
      console.log(`SKIP: "${name}" not found`)
      continue
    }

    // Mark all menu items as is_seasonal = true
    const { data: items } = await sb.from('menu_items').select('id')
      .eq('restaurant_id', rest.id)

    console.log(`CLOSE: "${rest.name}" (${rest.land}) — ${items?.length ?? 0} items`)

    if (!DRY_RUN) {
      // Mark all items as seasonal (closed)
      for (const item of items ?? []) {
        await sb.from('menu_items').update({ is_seasonal: true }).eq('id', item.id)
      }
    }
    count++
  }

  console.log(`\nTotal: ${count} restaurants marked as closed`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
}

main().catch(err => { console.error(err); process.exit(1) })
