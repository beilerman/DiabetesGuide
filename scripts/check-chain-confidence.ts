import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const chains = [
    { name: 'Starbucks', pattern: 'starbucks' },
    { name: 'Chicken Guy!', pattern: 'chicken guy' },
    { name: 'Blaze Pizza', pattern: 'blaze pizza' },
    { name: 'Jamba', pattern: 'jamba' },
    { name: "Auntie Anne's", pattern: 'auntie anne' },
    { name: "Wetzel's Pretzels", pattern: 'wetzel' },
    { name: 'Earl of Sandwich', pattern: 'earl of sandwich' },
  ]

  for (const chain of chains) {
    const { data: rests } = await sb.from('restaurants')
      .select('id, name, park:parks(name)')
      .ilike('name', `%${chain.pattern}%`)
    if (!rests?.length) { console.log(`${chain.name}: no restaurants found`); continue }

    let total = 0, highConf = 0, lowConf = 0
    for (const r of rests) {
      const { data: items } = await sb.from('menu_items')
        .select('nutritional_data(confidence_score)')
        .eq('restaurant_id', r.id)
      for (const i of items ?? []) {
        const conf = (i.nutritional_data as any)?.[0]?.confidence_score ?? 0
        total++
        if (conf >= 70) highConf++
        else lowConf++
      }
    }

    const parks = rests.map((r: any) => r.park?.name ?? '?').join(', ')
    console.log(`${chain.name}: ${total} items (${highConf} at conf≥70, ${lowConf} upgradeable) | ${parks}`)
  }
}
main().catch(console.error)
