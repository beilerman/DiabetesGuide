import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(url, key)

interface MenuItem {
  id: string
  name: string
  category: string
  is_fried: boolean
  description: string | null
  restaurant: { name: string; park: { name: string } }
  nutritional_data: Array<{
    id: string
    calories: number | null
    carbs: number | null
    sodium: number | null
    protein: number | null
    fat: number | null
  }>
}

async function fetchLowSodiumEntrees() {
  const items: MenuItem[] = []
  let from = 0

  while (true) {
    const { data, error } = await sb
      .from('menu_items')
      .select(`
        id, name, category, is_fried, description,
        restaurant:restaurants(name, park:parks(name)),
        nutritional_data(id, calories, carbs, sodium, protein, fat)
      `)
      .eq('category', 'entree')
      .range(from, from + 499)

    if (error) {
      console.error(error)
      break
    }
    if (!data || data.length === 0) break

    // Filter for items with calories > 200 and sodium < 200mg
    const lowSodium = data.filter((item: any) => {
      const nut = item.nutritional_data?.[0]
      return nut && nut.calories && nut.calories > 200 && nut.sodium && nut.sodium < 200
    })

    items.push(...lowSodium as MenuItem[])

    if (data.length < 500) break
    from += 500
  }

  return items
}

console.log('═══════════════════════════════════════════════════════════════')
console.log('        LOW SODIUM ENTREES ANALYSIS')
console.log('═══════════════════════════════════════════════════════════════\n')

const items = await fetchLowSodiumEntrees()

console.log(`Found ${items.length} entrees with >200 cal but <200mg sodium\n`)

// Group by food type patterns
const patterns = [
  { name: 'BBQ/Ribs/Smoked', pattern: /rib|bbq|brisket|pulled pork|smoked|carnitas/i, expectedSodium: '1500-2500mg' },
  { name: 'Pasta/Noodles', pattern: /pasta|spaghetti|fettuccine|penne|ravioli|gnocchi|noodle|ramen/i, expectedSodium: '800-1500mg' },
  { name: 'Burgers/Sandwiches', pattern: /burger|sandwich|panini|wrap|sub/i, expectedSodium: '800-1800mg' },
  { name: 'Fried Items', pattern: /fried|crispy|tempura|battered/i, expectedSodium: '800-1500mg' },
  { name: 'Pizza', pattern: /pizza/i, expectedSodium: '600-1200mg' },
  { name: 'Tacos/Mexican', pattern: /taco|burrito|fajita|enchilada|quesadilla/i, expectedSodium: '800-1500mg' },
  { name: 'Seafood/Fish', pattern: /salmon|fish|shrimp|lobster|tuna|crab|scallop/i, expectedSodium: '400-1200mg' },
  { name: 'Steak/Beef', pattern: /steak|beef|ribeye|filet|sirloin|prime rib/i, expectedSodium: '100-800mg' },
  { name: 'Chicken', pattern: /chicken(?!.*salad)/i, expectedSodium: '200-1000mg' },
  { name: 'Pork', pattern: /pork chop|pork tenderloin|ham/i, expectedSodium: '400-1200mg' },
]

const grouped = new Map<string, MenuItem[]>()
const unmatched: MenuItem[] = []

for (const item of items) {
  let matched = false
  for (const p of patterns) {
    if (p.pattern.test(item.name + ' ' + (item.description || ''))) {
      if (!grouped.has(p.name)) grouped.set(p.name, [])
      grouped.get(p.name)!.push(item)
      matched = true
      break
    }
  }
  if (!matched) unmatched.push(item)
}

console.log('═══════════════════════════════════════════════════════════════')
console.log('GROUPED BY FOOD TYPE')
console.log('═══════════════════════════════════════════════════════════════\n')

for (const [type, typeItems] of [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const pattern = patterns.find(p => p.name === type)!
  console.log(`${type} (${typeItems.length} items) - Expected: ${pattern.expectedSodium}`)

  for (const item of typeItems.slice(0, 5)) {
    const nut = item.nutritional_data[0]
    console.log(`  - ${item.name}: ${nut.sodium}mg (${nut.calories} cal)`)
  }
  if (typeItems.length > 5) {
    console.log(`  ... and ${typeItems.length - 5} more`)
  }
  console.log()
}

console.log('═══════════════════════════════════════════════════════════════')
console.log(`UNMATCHED ITEMS (${unmatched.length})`)
console.log('═══════════════════════════════════════════════════════════════\n')

for (const item of unmatched.slice(0, 20)) {
  const nut = item.nutritional_data[0]
  console.log(`- ${item.name}: ${nut.sodium}mg (${nut.calories} cal)`)
}
if (unmatched.length > 20) {
  console.log(`... and ${unmatched.length - 20} more\n`)
}

console.log('\n═══════════════════════════════════════════════════════════════')
console.log('RECOMMENDATIONS')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log('Items to fix (likely under-salted in USDA data):')
console.log('  ✓ BBQ/Ribs/Smoked - highly seasoned, should be 1500-2500mg')
console.log('  ✓ Pasta/Noodles - sauce + seasoning, should be 800-1500mg')
console.log('  ✓ Fried Items - breading + seasoning, should be 800-1500mg')
console.log('  ✓ Burgers/Sandwiches - condiments + seasoning, should be 800-1800mg\n')

console.log('Items likely accurate (can be low sodium):')
console.log('  - Plain grilled chicken/steak (no sauce)')
console.log('  - Steamed vegetables')
console.log('  - Plain fish (unseasoned)\n')

console.log('FIX STRATEGY:')
console.log('  1. Apply multipliers to highly-seasoned categories (BBQ, fried, pasta)')
console.log('  2. Use calorie-based estimation: ~0.8-1.2mg sodium per calorie for theme park food')
console.log('  3. Cap at reasonable max (2500mg for most items)\n')
