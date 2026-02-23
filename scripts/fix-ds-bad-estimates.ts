/**
 * Fix bad keyword-estimation values from disney-springs-expansion.json import.
 * Several items got 5 cal (no match fallback) or 120 cal (wine regex false positive).
 */
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const fixes: Array<{ name: string; restaurant: string; nutrition: Record<string, number> }> = [
  // Items that got 5 cal (no keyword match → fallback)
  { name: 'Carnitas Tacos', restaurant: 'Frontera Cocina', nutrition: { calories: 650, carbs: 45, fat: 30, protein: 35, sugar: 4, fiber: 3, sodium: 1100 } },
  { name: 'Spicy Mango-Habanero Chicken', restaurant: 'Frontera Cocina', nutrition: { calories: 550, carbs: 30, fat: 22, protein: 45, sugar: 10, fiber: 3, sodium: 1000 } },
  { name: 'Ahi Poke', restaurant: 'Paddlefish', nutrition: { calories: 350, carbs: 25, fat: 12, protein: 30, sugar: 5, fiber: 2, sodium: 900 } },
  { name: 'The Cubano Americano', restaurant: 'The Edison', nutrition: { calories: 750, carbs: 55, fat: 35, protein: 40, sugar: 6, fiber: 3, sodium: 1600 } },
  { name: 'Pollo Milanese', restaurant: 'Maria & Enzo\'s Ristorante', nutrition: { calories: 650, carbs: 40, fat: 30, protein: 45, sugar: 4, fiber: 3, sodium: 1200 } },
  { name: 'Amazon Rainforest Burger', restaurant: 'Rainforest Cafe', nutrition: { calories: 850, carbs: 50, fat: 45, protein: 40, sugar: 8, fiber: 3, sodium: 1400 } },

  // Items with wine-regex values (120 cal, 4g carbs) — pasta/risotto
  { name: 'Linguine & Clams', restaurant: 'Paddlefish', nutrition: { calories: 650, carbs: 65, fat: 22, protein: 30, sugar: 4, fiber: 3, sodium: 1100 } },
  { name: 'Shrimp Scampi Fettuccini', restaurant: 'Terralina Crafted Italian', nutrition: { calories: 700, carbs: 68, fat: 28, protein: 30, sugar: 4, fiber: 3, sodium: 1200 } },
  { name: 'Risotto ai Funghi', restaurant: 'Maria & Enzo\'s Ristorante', nutrition: { calories: 550, carbs: 65, fat: 22, protein: 14, sugar: 3, fiber: 2, sodium: 900 } },

  // Items with suspiciously low calories for what they are
  { name: 'Housemade Lasagna', restaurant: 'Terralina Crafted Italian', nutrition: { calories: 750, carbs: 55, fat: 38, protein: 35, sugar: 10, fiber: 4, sodium: 1500 } },
  { name: 'Hollywood Bowl', restaurant: 'Planet Hollywood Observatory', nutrition: { calories: 550, carbs: 45, fat: 28, protein: 30, sugar: 8, fiber: 5, sodium: 1000 } },
  { name: 'Fresh Florida Mahi Mahi', restaurant: 'Planet Hollywood Observatory', nutrition: { calories: 450, carbs: 20, fat: 18, protein: 45, sugar: 3, fiber: 2, sodium: 800 } },
  { name: 'Meteor Meatloaf', restaurant: 'T-REX', nutrition: { calories: 650, carbs: 35, fat: 35, protein: 30, sugar: 8, fiber: 2, sodium: 1400 } },
  { name: 'Tuscan Chicken', restaurant: 'T-REX', nutrition: { calories: 550, carbs: 30, fat: 25, protein: 45, sugar: 4, fiber: 3, sodium: 1100 } },
  { name: 'Treetop Filet', restaurant: 'Rainforest Cafe', nutrition: { calories: 500, carbs: 15, fat: 25, protein: 55, sugar: 3, fiber: 2, sodium: 800 } },
  { name: 'Artichoke Chicken', restaurant: 'Terralina Crafted Italian', nutrition: { calories: 550, carbs: 25, fat: 28, protein: 45, sugar: 4, fiber: 4, sodium: 1000 } },
  { name: 'Mahi', restaurant: 'Paddlefish', nutrition: { calories: 450, carbs: 20, fat: 18, protein: 45, sugar: 3, fiber: 2, sodium: 800 } },
  { name: 'Crispy Shrimp', restaurant: 'Paddlefish', nutrition: { calories: 500, carbs: 35, fat: 25, protein: 25, sugar: 3, fiber: 2, sodium: 1000 } },

  // Polpettine listed at 750 cal for an appetizer — actually a small plate meatball dish
  { name: 'Polpettine', restaurant: 'Maria & Enzo\'s Ristorante', nutrition: { calories: 400, carbs: 20, fat: 22, protein: 25, sugar: 6, fiber: 2, sodium: 900 } },
]

async function main() {
  const parkId = '54cddc44-ed3e-4475-bbfc-87369c7092c3' // Disney Springs

  let count = 0
  for (const fix of fixes) {
    // Find restaurant
    const { data: rests } = await sb.from('restaurants')
      .select('id')
      .eq('park_id', parkId)
      .eq('name', fix.restaurant)

    if (!rests || rests.length === 0) {
      console.log(`  Restaurant not found: ${fix.restaurant}`)
      continue
    }

    // Find menu item
    const { data: items } = await sb.from('menu_items')
      .select('id, name, nutritional_data(id, calories, carbs)')
      .eq('restaurant_id', rests[0].id)
      .eq('name', fix.name)

    if (!items || items.length === 0) {
      console.log(`  Item not found: ${fix.name} @ ${fix.restaurant}`)
      continue
    }

    const nd = (items[0] as any).nutritional_data?.[0]
    if (!nd) continue

    const oldCal = nd.calories ?? 0
    const oldCarbs = nd.carbs ?? 0

    await sb.from('nutritional_data').update({
      ...fix.nutrition,
      confidence_score: 45,
    }).eq('id', nd.id)

    console.log(`Fixed: ${fix.name} @ ${fix.restaurant} — ${oldCal}→${fix.nutrition.calories} cal, ${oldCarbs}→${fix.nutrition.carbs}g carbs`)
    count++
  }

  console.log(`\nTotal: ${count} fixes`)
}

main().catch(console.error)
