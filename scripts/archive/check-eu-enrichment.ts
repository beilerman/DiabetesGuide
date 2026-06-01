import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const { data: park } = await sb.from('parks').select('id').eq('name', "Universal's Epic Universe").single()
if (!park) { console.log('Park not found'); process.exit(1) }

const { data: rests } = await sb.from('restaurants').select('id').eq('park_id', park.id)
const restIds = rests!.map(r => r.id)

let allItems: any[] = []
for (const rid of restIds) {
  const { data } = await sb.from('menu_items').select('id').eq('restaurant_id', rid)
  allItems = allItems.concat(data || [])
}
console.log('Total EU items:', allItems.length)

// Check nutrition in batches of 200 (Supabase .in() limit)
const sources: Record<string, number> = {}
const confs: Record<number, number> = {}
let nullCal = 0
let totalNutr = 0

for (let i = 0; i < allItems.length; i += 200) {
  const batch = allItems.slice(i, i + 200).map(item => item.id)
  const { data: nutr } = await sb.from('nutritional_data').select('menu_item_id, calories, source, confidence_score').in('menu_item_id', batch)
  for (const n of nutr || []) {
    sources[n.source] = (sources[n.source] || 0) + 1
    confs[n.confidence_score] = (confs[n.confidence_score] || 0) + 1
    if (n.calories === null || n.calories === 0) nullCal++
    totalNutr++
  }
}

console.log('\nNutrition sources:', sources)
console.log('Confidence scores:', confs)
console.log(`Null/zero calories: ${nullCal} / ${totalNutr}`)
console.log(`Has calories: ${totalNutr - nullCal} / ${totalNutr}`)

// Check allergens
let totalAllergens = 0
for (let i = 0; i < allItems.length; i += 200) {
  const batch = allItems.slice(i, i + 200).map(item => item.id)
  const { count } = await sb.from('allergens').select('id', { count: 'exact', head: true }).in('menu_item_id', batch)
  totalAllergens += count || 0
}
console.log(`\nAllergen records: ${totalAllergens}`)
