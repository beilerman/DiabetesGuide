import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const { data: park } = await sb.from('parks').select('id').eq('name', "Universal's Epic Universe").single()
if (!park) { console.log('Park not found'); process.exit(1) }

const { data: rests } = await sb.from('restaurants').select('id').eq('park_id', park.id)
const restIds = rests!.map(r => r.id)

let allItems: any[] = []
for (const rid of restIds) {
  const { data } = await sb.from('menu_items').select('category').eq('restaurant_id', rid)
  allItems.push(...(data || []))
}

const cats: Record<string, number> = {}
for (const i of allItems) cats[i.category] = (cats[i.category] || 0) + 1
console.log('Categories after fixes:', cats)
