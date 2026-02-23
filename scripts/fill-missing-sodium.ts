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
  description: string | null
  is_fried: boolean
  nutritional_data: Array<{
    id: string
    calories: number | null
    sodium: number | null
    confidence_score: number | null
  }>
}

// Sodium estimation from calories (mg per calorie)
function estimateSodium(item: MenuItem, calories: number): number {
  const name = item.name.toLowerCase()
  const desc = (item.description || '').toLowerCase()
  const combined = name + ' ' + desc
  const category = item.category

  // Very high sodium (2.0-2.5mg per calorie)
  if (
    /cured|prosciutto|salami|pepperoni|jamón|bacon|ham(?!burger)/.test(combined) ||
    /soy sauce|teriyaki|miso/.test(combined)
  ) {
    return Math.round(calories * 2.2)
  }

  // High sodium (1.2-1.8mg per calorie)
  if (
    /bbq|ribs|brisket|pulled pork|smoked|carnitas/.test(combined) ||
    /pizza/.test(combined) ||
    /soup|broth|ramen|noodle soup/.test(combined) ||
    /cheese(?!cake)|mac.*cheese|quesadilla/.test(combined) ||
    /sausage|hot dog|pretzel dog/.test(combined)
  ) {
    return Math.round(calories * 1.5)
  }

  // Medium-high sodium (0.9-1.2mg per calorie)
  if (
    category === 'entree' && (
      /burger|sandwich|panini|wrap/.test(combined) ||
      /fried|crispy|tempura|battered/.test(combined) ||
      /pasta|marinara|alfredo/.test(combined) ||
      /taco|burrito|fajita|enchilada|nacho/.test(combined)
    )
  ) {
    return Math.round(calories * 1.0)
  }

  // Medium sodium entrees (0.6-0.9mg per calorie)
  if (category === 'entree') {
    return Math.round(calories * 0.75)
  }

  // Medium sodium snacks (0.7-1.0mg per calorie)
  if (
    category === 'snack' && (
      item.is_fried ||
      /chip|fries|tots|pretzel|popcorn|cracker/.test(combined) ||
      /chicken tender|wing|nugget/.test(combined)
    )
  ) {
    return Math.round(calories * 0.85)
  }

  // Low-medium sodium snacks (0.3-0.6mg per calorie)
  if (category === 'snack') {
    return Math.round(calories * 0.45)
  }

  // Medium sodium sides (0.5-0.8mg per calorie)
  if (category === 'side') {
    return Math.round(calories * 0.65)
  }

  // Low sodium desserts (0.1-0.3mg per calorie)
  if (
    category === 'dessert' ||
    /cake|cookie|brownie|cupcake|ice cream|sundae|churro|donut|pastry/.test(combined)
  ) {
    return Math.round(calories * 0.20)
  }

  // Minimal sodium beverages (0-0.2mg per calorie)
  if (category === 'beverage') {
    // Plain beverages (water, coffee, tea, juice)
    if (
      /water|coffee|tea|juice|lemonade|soda|smoothie/.test(combined) &&
      !/protein/.test(combined)
    ) {
      return Math.round(calories * 0.05)
    }
    // Milk-based drinks slightly higher
    if (/milk|latte|cappuccino|mocha|shake/.test(combined)) {
      return Math.round(calories * 0.15)
    }
    return Math.round(calories * 0.10)
  }

  // Default fallback (0.5mg per calorie)
  return Math.round(calories * 0.50)
}

async function fetchMissingSodium() {
  const items: MenuItem[] = []
  let from = 0

  while (true) {
    const { data, error } = await sb
      .from('menu_items')
      .select(`
        id, name, category, description, is_fried,
        nutritional_data(id, calories, sodium, confidence_score)
      `)
      .range(from, from + 499)

    if (error) {
      console.error(error)
      break
    }
    if (!data || data.length === 0) break

    // Filter for items with calories but missing sodium
    const missingSodium = data.filter((item: any) => {
      const nut = item.nutritional_data?.[0]
      return (
        nut &&
        nut.calories &&
        nut.calories > 0 &&
        (!nut.sodium || nut.sodium === 0)
      )
    })

    items.push(...missingSodium as MenuItem[])

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
console.log('             FILL MISSING SODIUM VALUES')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log('STRATEGY:')
console.log('  Estimate sodium from calories using food type patterns')
console.log('  - Very high sodium (cured meats): 2.2mg per calorie')
console.log('  - High sodium (BBQ, pizza): 1.5mg per calorie')
console.log('  - Medium sodium (entrees): 0.75-1.0mg per calorie')
console.log('  - Low sodium (desserts): 0.2mg per calorie')
console.log('  - Minimal sodium (beverages): 0.05-0.15mg per calorie\n')

const items = await fetchMissingSodium()
console.log(`Found ${items.length} items with calories but missing sodium\n`)

if (items.length === 0) {
  console.log('✅ No items need sodium estimation!\n')
  process.exit(0)
}

console.log('═══════════════════════════════════════════════════════════════\n')

let fixed = 0
let failed = 0
const fixedByCategory = new Map<string, number>()

for (const item of items) {
  const nut = item.nutritional_data[0]
  const calories = nut.calories!
  const estimatedSodium = estimateSodium(item, calories)

  console.log(`📝 ${item.name}`)
  console.log(`   Category: ${item.category}`)
  console.log(`   Current: calories=${calories}, sodium=null`)
  console.log(`   Estimate: sodium=${estimatedSodium}mg (${(estimatedSodium/calories).toFixed(2)}mg per calorie)`)

  // Set confidence to 30 for keyword-based estimates
  const newConfidence = 30

  const success = await updateNutrition(nut.id, {
    sodium: estimatedSodium,
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
  console.log('✅ All sodium values estimated and filled\n')
  console.log('NOTE: These are estimates with confidence_score=30')
  console.log('      Theme park food tends to be heavily salted\n')
}
