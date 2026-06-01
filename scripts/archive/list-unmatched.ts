import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const { data: parks } = await sb.from('parks').select('id, name').in('name', ['Dollywood', 'Kings Island'])
  const parkIds = parks!.map(p => p.id)
  const parkMap = new Map(parks!.map(p => [p.id, p.name]))

  const { data: rests } = await sb.from('restaurants').select('id, park_id, name').in('park_id', parkIds)
  const restIds = rests!.map(r => r.id)
  const restMap = new Map(rests!.map(r => [r.id, { name: r.name, park: parkMap.get(r.park_id)! }]))

  const { data: items } = await sb.from('menu_items')
    .select('id, name, description, restaurant_id')
    .in('restaurant_id', restIds)
    .order('name')

  // Batch the nutrition check to avoid URL-too-long errors
  const itemIds = items!.map(i => i.id)
  const hasNut = new Set<string>()
  for (let i = 0; i < itemIds.length; i += 200) {
    const batch = itemIds.slice(i, i + 200)
    const { data: nutRows } = await sb.from('nutritional_data')
      .select('menu_item_id')
      .in('menu_item_id', batch)
    for (const n of nutRows || []) hasNut.add(n.menu_item_id)
  }

  const missing = items!.filter(i => !hasNut.has(i.id))

  // Unique names
  const nameSet = new Map<string, { count: number; park: string; rest: string }>()
  for (const item of missing) {
    const info = restMap.get(item.restaurant_id)!
    if (!nameSet.has(item.name)) {
      nameSet.set(item.name, { count: 1, park: info.park, rest: info.name })
    } else {
      nameSet.get(item.name)!.count++
    }
  }

  const sorted = [...nameSet.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  console.log(`Items missing nutrition: ${missing.length}`)
  console.log(`Unique item names: ${sorted.length}`)
  console.log(`Items with existing description: ${missing.filter(i => i.description).length}`)
  console.log('')
  console.log('Name | Count | Park | Restaurant')
  console.log('-'.repeat(100))
  for (const [name, info] of sorted) {
    console.log(`${name} | ${info.count}x | ${info.park} | ${info.rest}`)
  }
}

main()
