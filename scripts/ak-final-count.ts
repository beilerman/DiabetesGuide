import { createClient } from '@supabase/supabase-js'
const url = process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const sb = createClient(url, key)

async function main() {
  const { data: park } = await sb.from('parks').select('id').ilike('name', '%Animal Kingdom%').single()
  if (!park) { console.error('Not found'); return }
  const { data: rests } = await sb.from('restaurants').select('id, name, land')
    .eq('park_id', park.id).order('land').order('name')
  let total = 0
  for (const r of rests ?? []) {
    const { count } = await sb.from('menu_items').select('id', { count: 'exact', head: true }).eq('restaurant_id', r.id)
    total += count ?? 0
    const land = (r.land ?? '(none)').padEnd(28)
    const name = r.name.padEnd(45)
    console.log(`${land} ${name} ${count}`)
  }
  console.log(`\nTotal: ${rests?.length} restaurants, ${total} items`)
}
main()
