import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const { data: park } = await sb.from('parks').select('id').eq('name', "Universal's Epic Universe").single()
if (!park) { console.log('Park not found'); process.exit(1) }

const { data: rests } = await sb.from('restaurants').select('id, name, land').eq('park_id', park.id).order('name')

interface Item {
  restaurant: string
  land: string
  name: string
  description: string | null
  category: string
  price: number | null
  calories: number | null
  carbs: number | null
  fat: number | null
  protein: number | null
  sugar: number | null
  fiber: number | null
  sodium: number | null
  source: string | null
  confidence_score: number | null
}

const allItems: Item[] = []

for (const r of rests!) {
  const { data: items } = await sb
    .from('menu_items')
    .select('name, description, category, price, nutritional_data(calories, carbs, fat, protein, sugar, fiber, sodium, source, confidence_score)')
    .eq('restaurant_id', r.id)
    .order('name')

  for (const item of items || []) {
    const nd = Array.isArray(item.nutritional_data) ? item.nutritional_data[0] : item.nutritional_data
    allItems.push({
      restaurant: r.name,
      land: r.land,
      name: item.name,
      description: item.description,
      category: item.category,
      price: item.price,
      calories: nd?.calories ?? null,
      carbs: nd?.carbs ?? null,
      fat: nd?.fat ?? null,
      protein: nd?.protein ?? null,
      sugar: nd?.sugar ?? null,
      fiber: nd?.fiber ?? null,
      sodium: nd?.sodium ?? null,
      source: nd?.source ?? null,
      confidence_score: nd?.confidence_score ?? null,
    })
  }
}

writeFileSync(resolve(__dirname, '../data/eu-items-dump.json'), JSON.stringify(allItems, null, 2))
console.log(`Dumped ${allItems.length} Epic Universe items to data/eu-items-dump.json`)

// Summary by category
const cats: Record<string, number> = {}
for (const i of allItems) cats[i.category] = (cats[i.category] || 0) + 1
console.log('\nBy category:', cats)

// Items with suspicious categories
console.log('\n=== Potential category issues ===')
for (const i of allItems) {
  const n = i.name.toLowerCase()
  // Beverages classified as entree
  if (i.category === 'entree' && /\bthé\b|\btea\b|coffee|latte|cappuccino|espresso|juice|lemonade|soda|water\b/i.test(n)) {
    console.log(`  ${i.category} → beverage? ${i.name} (${i.restaurant})`)
  }
  // Food classified as beverage
  if (i.category === 'beverage' && /baguette|poulet|chicken|steak|burger|sandwich|soup|salad|pasta|quiche|crêpe(?!.*butter)/i.test(n)) {
    console.log(`  ${i.category} → entree? ${i.name} (${i.restaurant})`)
  }
  // Bakery items as entree
  if (i.category === 'entree' && /brioche|croissant|pain au|scone|muffin|almondine/i.test(n)) {
    console.log(`  ${i.category} → snack? ${i.name} (${i.restaurant})`)
  }
}
