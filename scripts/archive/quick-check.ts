import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(url, key)

async function main() {
  // Find AK park
  const { data: parks } = await sb.from('parks').select('id, name').ilike('name', '%Animal Kingdom%')
  console.log('AK parks:', parks?.map(p => `${p.name} (${p.id})`))

  if (!parks || parks.length === 0) { process.exit(0) }

  const parkId = parks[0].id

  // Check for Rainforest Cafe
  const { data: rfc } = await sb.from('restaurants').select('id, name').eq('park_id', parkId).ilike('name', '%Rainforest%')
  console.log('Rainforest Cafe:', rfc?.length ? rfc.map(r => `${r.name} (${r.id})`) : 'NOT FOUND')

  if (rfc && rfc.length > 0) {
    const { count } = await sb.from('menu_items').select('id', { count: 'exact' }).eq('restaurant_id', rfc[0].id)
    console.log('  Items:', count)
  }

  // Overall AK stats
  const { count: totalRests } = await sb.from('restaurants').select('id', { count: 'exact' }).eq('park_id', parkId)
  const { count: totalItems } = await sb.from('menu_items').select('id', { count: 'exact' }).eq('restaurant_id', parkId)
  console.log(`\nAK restaurants: ${totalRests}`)

  // Get total items via restaurants
  const { data: allRests } = await sb.from('restaurants').select('id').eq('park_id', parkId)
  let itemTotal = 0
  if (allRests) {
    for (const r of allRests) {
      const { count } = await sb.from('menu_items').select('id', { count: 'exact' }).eq('restaurant_id', r.id)
      itemTotal += (count || 0)
    }
  }
  console.log(`AK total items: ${itemTotal}`)

  // Check all parks summary
  const { data: allParks } = await sb.from('parks').select('id, name, location').order('name')
  console.log('\n=== All Parks ===')
  for (const p of (allParks || [])) {
    const { count } = await sb.from('restaurants').select('id', { count: 'exact' }).eq('park_id', p.id)
    console.log(`  ${p.name} (${p.location}): ${count} restaurants`)
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
