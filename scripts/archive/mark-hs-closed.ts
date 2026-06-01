import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const { data: park } = await sb.from('parks').select('id').eq('name', "Disney's Hollywood Studios").single()
  if (!park) { console.log('Park not found'); return }

  const closedRests = ['PizzeRizzo', "Mama Melrose's Ristorante Italiano"]
  for (const name of closedRests) {
    const { data: rests } = await sb.from('restaurants').select('id').eq('park_id', park.id).eq('name', name)
    if (!rests || rests.length === 0) { console.log(`${name}: NOT FOUND`); continue }
    const { data, error } = await sb.from('menu_items')
      .update({ is_seasonal: true })
      .eq('restaurant_id', rests[0].id)
      .select('id')
    if (error) console.log(`${name}: ERROR ${error.message}`)
    else console.log(`${name}: marked ${data.length} items as seasonal (closed June/May 2025)`)
  }
}
main()
