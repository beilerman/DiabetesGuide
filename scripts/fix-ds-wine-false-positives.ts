/**
 * Fix Disney Springs items where "white wine" in description
 * triggered wine nutrition pattern (120 cal, 4g carbs) for food items.
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Set env vars'); process.exit(1) }

const sb = createClient(url, key)

const FIXES: { name: string; restaurant: string; nutrition: { calories: number; carbs: number; fat: number; protein: number; sugar: number; fiber: number; sodium: number } }[] = [
  { name: 'PEI Mussels', restaurant: 'Paddlefish', nutrition: { calories: 350, carbs: 12, fat: 15, protein: 25, sugar: 2, fiber: 1, sodium: 800 } },
  { name: 'Ribeye', restaurant: 'Paddlefish', nutrition: { calories: 850, carbs: 20, fat: 50, protein: 65, sugar: 2, fiber: 2, sodium: 700 } },
  { name: 'Linguine and Clams', restaurant: 'Paddlefish', nutrition: { calories: 650, carbs: 65, fat: 20, protein: 30, sugar: 3, fiber: 3, sodium: 900 } },
  { name: 'Seafood Fettuccini', restaurant: 'Terralina Crafted Italian', nutrition: { calories: 700, carbs: 65, fat: 25, protein: 30, sugar: 3, fiber: 3, sodium: 850 } },
  { name: 'Linguine Alla Burrata', restaurant: "Enzo's Hideaway Tunnel Bar", nutrition: { calories: 650, carbs: 60, fat: 28, protein: 18, sugar: 3, fiber: 3, sodium: 700 } },
  { name: 'Italian Sausage Pasta', restaurant: "Enzo's Hideaway Tunnel Bar", nutrition: { calories: 650, carbs: 60, fat: 25, protein: 28, sugar: 4, fiber: 3, sodium: 900 } },
]

async function main() {
  const parkId = '54cddc44-ed3e-4475-bbfc-87369c7092c3' // Disney Springs

  for (const fix of FIXES) {
    // Find the restaurant
    const { data: rests } = await sb.from('restaurants').select('id').eq('park_id', parkId).eq('name', fix.restaurant)
    if (!rests || rests.length === 0) { console.log(`Restaurant not found: ${fix.restaurant}`); continue }

    // Find the menu item
    const { data: items } = await sb.from('menu_items').select('id').eq('restaurant_id', rests[0].id).eq('name', fix.name)
    if (!items || items.length === 0) { console.log(`Item not found: ${fix.name}`); continue }

    // Update nutrition
    const { error } = await sb.from('nutritional_data').update(fix.nutrition).eq('menu_item_id', items[0].id)
    if (error) { console.error(`Error fixing ${fix.name}:`, error.message) }
    else { console.log(`Fixed: ${fix.name} → ${fix.nutrition.calories} cal`) }
  }

  console.log('\nDone!')
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
