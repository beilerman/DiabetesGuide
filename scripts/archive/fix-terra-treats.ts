/**
 * Mark old Terra Treats items as seasonal.
 * Terra Treats revamped its menu in Feb 2026 — hot dogs replaced with ice cream.
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Set env vars'); process.exit(1) }
const sb = createClient(url, key)

async function main() {
  const { data: park } = await sb.from('parks').select('id').ilike('name', '%Animal Kingdom%').single()
  if (!park) { console.error('Park not found'); process.exit(1) }

  const { data: terra } = await sb.from('restaurants').select('id')
    .eq('park_id', park.id).eq('name', 'Terra Treats').single()
  if (!terra) { console.error('Terra Treats not found'); process.exit(1) }

  const { data: items } = await sb.from('menu_items').select('id, name')
    .eq('restaurant_id', terra.id)

  console.log('Marking old Terra Treats items as seasonal (menu revamped Feb 2026):')
  for (const i of items ?? []) {
    console.log(`  ${i.name}`)
    await sb.from('menu_items').update({ is_seasonal: true }).eq('id', i.id)
  }
  console.log(`\nMarked ${items?.length ?? 0} items as seasonal`)
}

main().catch(err => { console.error(err); process.exit(1) })
