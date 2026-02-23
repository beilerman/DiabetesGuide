import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(url, key)
const DRY_RUN = process.argv.includes('--dry-run')

interface MenuItem {
  id: string
  name: string
  category: string
  nutritional_data: Array<{
    id: string
    calories: number | null
    carbs: number | null
    sugar: number | null
    confidence_score: number | null
  }>
}

// Sugar estimation rules by food type and category
function estimateSugar(item: MenuItem, carbs: number): number {
  const name = item.name.toLowerCase()
  const category = item.category

  // High sugar foods (70-80% of carbs)
  if (
    category === 'dessert' ||
    /cake|cookie|brownie|cupcake|frosting|icing|chocolate|fudge|caramel|candy|sweet|sugar|honey|syrup|glaze/.test(name)
  ) {
    return Math.round(carbs * 0.70)
  }

  // Fruit-based items (60-80% of carbs)
  if (
    /smoothie|juice|fruit cup|berry|apple|orange|grape|pineapple|mango|strawberry|banana|watermelon/.test(name)
  ) {
    return Math.round(carbs * 0.75)
  }

  // Beverages with added sugar (40-60% of carbs)
  if (
    category === 'beverage' &&
    /soda|lemonade|tea|coffee|mocha|latte|frappuccino|milkshake|shake/.test(name)
  ) {
    // Black coffee/tea → minimal sugar
    if (/black coffee|hot coffee|espresso|black tea|hot tea/.test(name)) {
      return Math.round(carbs * 0.05)
    }
    return Math.round(carbs * 0.50)
  }

  // Plain beverages (0-5% of carbs)
  if (
    category === 'beverage' &&
    /water|sparkling|seltzer|club soda|unsweetened|diet/.test(name)
  ) {
    return Math.round(carbs * 0.02)
  }

  // Alcoholic beverages (20-40% of carbs)
  if (/beer|wine|cocktail|margarita|sangria|mojito|martini|whiskey|rum|vodka|gin|tequila|bourbon/.test(name)) {
    return Math.round(carbs * 0.30)
  }

  // Breads and baked goods (10-25% of carbs)
  if (
    /bread|bun|roll|biscuit|croissant|danish|muffin|scone|bagel|toast|waffle|pancake/.test(name) &&
    category !== 'dessert'
  ) {
    return Math.round(carbs * 0.15)
  }

  // Snacks - savory (5-15% of carbs)
  if (
    category === 'snack' &&
    /chip|pretzel|cracker|popcorn|nacho|fries|tots/.test(name)
  ) {
    return Math.round(carbs * 0.10)
  }

  // Entrees - savory (15-25% of carbs)
  if (category === 'entree') {
    // Asian sauces tend to have more sugar
    if (/teriyaki|sweet and sour|orange chicken|general tso|hoisin|glazed/.test(name)) {
      return Math.round(carbs * 0.35)
    }
    // BBQ and smoked meats
    if (/bbq|barbecue|pulled pork|ribs|brisket|smoked/.test(name)) {
      return Math.round(carbs * 0.30)
    }
    // Standard savory entrees
    return Math.round(carbs * 0.20)
  }

  // Sides (10-20% of carbs)
  if (category === 'side') {
    return Math.round(carbs * 0.15)
  }

  // Default fallback
  return Math.round(carbs * 0.20)
}

async function fetchMissingSugar() {
  const items: MenuItem[] = []
  let from = 0

  while (true) {
    const { data, error } = await sb
      .from('menu_items')
      .select(`
        id, name, category,
        nutritional_data(id, calories, carbs, sugar, confidence_score)
      `)
      .range(from, from + 499)

    if (error) {
      console.error(error)
      break
    }
    if (!data || data.length === 0) break

    // Filter for items with calories and carbs but missing sugar
    const missingSugar = data.filter((item: any) => {
      const nut = item.nutritional_data?.[0]
      return (
        nut &&
        nut.calories &&
        nut.calories > 0 &&
        nut.carbs &&
        nut.carbs > 0 &&
        (!nut.sugar || nut.sugar === 0)
      )
    })

    items.push(...missingSugar as MenuItem[])

    if (data.length < 500) break
    from += 500
  }

  return items
}

async function updateNutrition(nutId: string, updates: Record<string, number>) {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would update nutrition ${nutId}:`, updates)
    return true
  }

  const { error } = await sb
    .from('nutritional_data')
    .update(updates)
    .eq('id', nutId)

  if (error) {
    console.error(`  ❌ Failed to update: ${error.message}`)
    return false
  }

  return true
}

console.log('═══════════════════════════════════════════════════════════════')
console.log('              FILL MISSING SUGAR VALUES')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log('STRATEGY:')
console.log('  Estimate sugar from carbs using category + keyword patterns')
console.log('  - Desserts/Sweets: 70% of carbs')
console.log('  - Fruit/Smoothies: 75% of carbs')
console.log('  - Sweet beverages: 50% of carbs')
console.log('  - Alcoholic drinks: 30% of carbs')
console.log('  - Savory entrees: 20% of carbs')
console.log('  - Savory snacks: 10% of carbs\n')

const items = await fetchMissingSugar()
console.log(`Found ${items.length} items with carbs but missing sugar\n`)

if (items.length === 0) {
  console.log('✅ No items need sugar estimation!\n')
  process.exit(0)
}

console.log('═══════════════════════════════════════════════════════════════\n')

let fixed = 0
let failed = 0
const fixedByCategory = new Map<string, number>()

for (const item of items) {
  const nut = item.nutritional_data[0]
  const carbs = nut.carbs!
  const estimatedSugar = estimateSugar(item, carbs)

  console.log(`📝 ${item.name}`)
  console.log(`   Category: ${item.category}`)
  console.log(`   Current: carbs=${carbs}g, sugar=null`)
  console.log(`   Estimate: sugar=${estimatedSugar}g (${Math.round(estimatedSugar/carbs*100)}% of carbs)`)

  // Set confidence to 30 for keyword-based estimates
  const newConfidence = 30

  const success = await updateNutrition(nut.id, {
    sugar: estimatedSugar,
    confidence_score: newConfidence
  })

  if (success) {
    fixed++
    fixedByCategory.set(item.category, (fixedByCategory.get(item.category) || 0) + 1)
    console.log(`   ✅ Fixed`)
  } else {
    failed++
  }
  console.log()
}

console.log('═══════════════════════════════════════════════════════════════')
console.log('SUMMARY')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log(`Items fixed: ${fixed}`)
console.log(`Items failed: ${failed}\n`)

if (fixedByCategory.size > 0) {
  console.log('Fixed by category:')
  for (const [cat, count] of [...fixedByCategory.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count} items`)
  }
  console.log()
}

if (DRY_RUN) {
  console.log('🔍 DRY RUN MODE - No changes were made')
  console.log('   Run without --dry-run to apply fixes\n')
} else {
  console.log('✅ All sugar values estimated and filled\n')
  console.log('NOTE: These are estimates with confidence_score=30')
  console.log('      Users should verify for critical insulin dosing\n')
}
