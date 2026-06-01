import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Targeted fixes for items still flagged after the bulk audit fix
const fixes: Array<{ namePattern: string; maxCal: number; target: Record<string, number> }> = [
  // Bavarian Pretzel — a pretzel is ~400-500 cal
  { namePattern: 'Bavarian Pretzel', maxCal: 700, target: { calories: 500, carbs: 80, fat: 8, protein: 12, sugar: 5, sodium: 1100, fiber: 3 } },
  // Country Fried Steak — large plate with gravy/sides, but not 2000 cal
  { namePattern: 'Country Fried Steak', maxCal: 1300, target: { calories: 1150, carbs: 65, fat: 60, protein: 45, sugar: 5, sodium: 2200, fiber: 3 } },
  // Dulce de Leche Churro — a churro even with dulce de leche is ~350-450
  { namePattern: 'Dulce de Leche Churro', maxCal: 600, target: { calories: 420, carbs: 58, fat: 18, protein: 5, sugar: 28, sodium: 200, fiber: 1 } },
  // Hibachi Steak & Shrimp — large hibachi plate, ~900-1100
  { namePattern: 'Hibachi Steak', maxCal: 1300, target: { calories: 1050, carbs: 70, fat: 50, protein: 55, sugar: 8, sodium: 1800, fiber: 4 } },
  // Steakhouse 71 Chocolate Cake — a slice of cake, ~700-900
  { namePattern: 'Steakhouse 71 Signature Chocolate Cake', maxCal: 1100, target: { calories: 850, carbs: 95, fat: 48, protein: 8, sugar: 65, sodium: 400, fiber: 3 } },
  // Super Mushroom Pizza Bowl — Epic Universe, ~800
  { namePattern: 'Super Mushroom Pizza Bowl', maxCal: 1200, target: { calories: 850, carbs: 75, fat: 42, protein: 30, sugar: 8, sodium: 1500, fiber: 4 } },
  // Thawfest Platter — How to Train Your Dragon platter at Epic, ~1200
  { namePattern: 'Thawfest Platter', maxCal: 1500, target: { calories: 1250, carbs: 80, fat: 65, protein: 55, sugar: 10, sodium: 2000, fiber: 5 } },
  // Oak-grilled Strip Steak Florentine — steak dinner, ~900-1100
  { namePattern: 'Oak-grilled Strip Steak', maxCal: 1300, target: { calories: 1050, carbs: 30, fat: 60, protein: 70, sugar: 4, sodium: 1400, fiber: 3 } },
  // Steak and Egg — breakfast steak, ~800-1000
  { namePattern: 'Steak and Egg', maxCal: 1200, target: { calories: 900, carbs: 25, fat: 55, protein: 60, sugar: 3, sodium: 1200, fiber: 2 } },
  // Trio Platter — seafood platter, ~1000-1200
  { namePattern: 'Trio Platter', maxCal: 1400, target: { calories: 1100, carbs: 80, fat: 55, protein: 50, sugar: 5, sodium: 1800, fiber: 3 } },
  // Philly Cheesesteak Loaded Fries — high cal but not 1800
  { namePattern: 'Philly Cheesesteak Loaded Fries', maxCal: 1300, target: { calories: 1100, carbs: 75, fat: 60, protein: 45, sugar: 5, sodium: 2000, fiber: 5 } },
  // Hawaiian Grilled Chicken Tenders — too low at 295
  { namePattern: 'Hawaiian Grilled Chicken Tenders', maxCal: 99999, target: { calories: 650, carbs: 35, fat: 28, protein: 45, sugar: 12, sodium: 1200, fiber: 2 } },
  // Hawaiian Longboard Pizza — too low at 210
  { namePattern: 'Hawaiian Longboard Pizza', maxCal: 99999, target: { calories: 750, carbs: 80, fat: 28, protein: 30, sugar: 10, sodium: 1400, fiber: 3 } },
  // Banana Bread Chocolate Chip Cookie (Gideon's) — half pound, ~900
  { namePattern: 'Banana Bread Chocolate Chip Cookie', maxCal: 1100, target: { calories: 900, carbs: 100, fat: 50, protein: 10, sugar: 55, sodium: 450, fiber: 2 } },
  // Pumpkin Caramel Double Frosted Cake (Gideon's) — ~800
  { namePattern: 'Pumpkin Caramel Double Frosted Cake', maxCal: 1100, target: { calories: 850, carbs: 95, fat: 48, protein: 8, sugar: 62, sodium: 400, fiber: 2 } },
  // Red Wine-braised Beef Cheeks — rich entree, ~800
  { namePattern: 'Red Wine-braised Beef Cheeks', maxCal: 1100, target: { calories: 850, carbs: 35, fat: 50, protein: 55, sugar: 8, sodium: 1400, fiber: 3 } },
]

async function main() {
  let count = 0
  for (const fix of fixes) {
    const { data } = await sb.from('menu_items')
      .select('id, name, nutritional_data(id, calories)')
      .ilike('name', `%${fix.namePattern}%`)

    for (const item of data ?? []) {
      const nd = (item as any).nutritional_data?.[0]
      if (!nd) continue
      const cal = nd.calories ?? 0

      // Only fix if currently outside range (either too high or targeted fix)
      if (cal > fix.maxCal || fix.maxCal === 99999) {
        await sb.from('nutritional_data').update({ ...fix.target, confidence_score: 45 }).eq('id', nd.id)
        console.log(`Fixed: ${(item as any).name} — ${cal} → ${fix.target.calories} cal`)
        count++
      }
    }
  }
  console.log(`\nTotal: ${count} fixes`)
}

main().catch(console.error)
