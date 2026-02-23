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
  nutritional_data: Array<{
    id: string
    carbs: number | null
    fiber: number | null
    confidence_score: number | null
  }>
}

// Fiber estimation from carbs
function estimateFiber(item: MenuItem, carbs: number): number {
  const name = item.name.toLowerCase()
  const desc = (item.description || '').toLowerCase()
  const combined = name + ' ' + desc
  const category = item.category

  // Very high fiber foods (15-25% of carbs)
  if (
    /bean|lentil|chickpea|black bean|pinto bean|kidney bean/.test(combined) ||
    /quinoa|farro|barley|bulgur/.test(combined) ||
    /bran|whole wheat|whole grain|multi-grain/.test(combined)
  ) {
    return Math.round(carbs * 0.20)
  }

  // High fiber foods (10-15% of carbs)
  if (
    /vegetable|broccoli|cauliflower|brussels sprout|kale|spinach|artichoke/.test(combined) ||
    /sweet potato|yam/.test(combined) ||
    /apple|pear|berry|raspberry|blackberry|strawberry/.test(combined) ||
    /oatmeal|oat/.test(combined) ||
    /salad(?!.*dressing)/.test(combined)
  ) {
    return Math.round(carbs * 0.12)
  }

  // Medium fiber foods (8-12% of carbs)
  if (
    /fruit|orange|banana|grape|peach|plum|mango|pineapple/.test(combined) ||
    /brown rice|wild rice/.test(combined) ||
    /corn|peas|carrot/.test(combined) ||
    /nuts|almond|walnut|pecan|peanut/.test(combined)
  ) {
    return Math.round(carbs * 0.10)
  }

  // Low-medium fiber entrees with vegetables (5-8% of carbs)
  if (
    category === 'entree' && (
      /salad|bowl|veggie|vegetable/.test(combined) ||
      /rice|grain/.test(combined)
    )
  ) {
    return Math.round(carbs * 0.07)
  }

  // Low fiber entrees (3-6% of carbs)
  if (category === 'entree') {
    // Pasta, pizza, sandwiches
    if (/pasta|pizza|sandwich|burger|wrap/.test(combined)) {
      return Math.round(carbs * 0.05)
    }
    // Meat-heavy dishes
    if (/steak|chicken|pork|beef|fish|seafood/.test(combined)) {
      return Math.round(carbs * 0.04)
    }
    // Default entree
    return Math.round(carbs * 0.05)
  }

  // Low fiber snacks (2-5% of carbs)
  if (category === 'snack') {
    // Chips, pretzels (slightly higher fiber)
    if (/chip|pretzel|cracker|popcorn/.test(combined)) {
      return Math.round(carbs * 0.04)
    }
    // Fried items (very low fiber)
    if (/fried|nugget|tender|wing/.test(combined)) {
      return Math.round(carbs * 0.02)
    }
    return Math.round(carbs * 0.03)
  }

  // Low fiber sides (3-7% of carbs)
  if (category === 'side') {
    // Vegetable sides
    if (/vegetable|veggie|slaw|salad|green/.test(combined)) {
      return Math.round(carbs * 0.10)
    }
    // Potato dishes
    if (/potato|fries|tots|hash/.test(combined)) {
      return Math.round(carbs * 0.05)
    }
    return Math.round(carbs * 0.04)
  }

  // Very low fiber desserts (1-3% of carbs)
  if (
    category === 'dessert' ||
    /cake|cookie|brownie|cupcake|ice cream|sundae|churro|donut|pastry/.test(combined)
  ) {
    // Fruit-based desserts slightly higher
    if (/apple|berry|fruit/.test(combined)) {
      return Math.round(carbs * 0.04)
    }
    return Math.round(carbs * 0.02)
  }

  // Minimal fiber beverages (0-2% of carbs)
  if (category === 'beverage') {
    // Smoothies with fruit
    if (/smoothie/.test(combined)) {
      return Math.round(carbs * 0.05)
    }
    // Juice
    if (/juice/.test(combined)) {
      return Math.round(carbs * 0.02)
    }
    // Most beverages have no fiber
    return 0
  }

  // Default fallback (3% of carbs)
  return Math.round(carbs * 0.03)
}

async function fetchMissingFiber() {
  const items: MenuItem[] = []
  let from = 0

  while (true) {
    const { data, error } = await sb
      .from('menu_items')
      .select(`
        id, name, category, description,
        nutritional_data(id, carbs, fiber, confidence_score)
      `)
      .range(from, from + 499)

    if (error) {
      console.error(error)
      break
    }
    if (!data || data.length === 0) break

    // Filter for items with carbs but missing fiber
    const missingFiber = data.filter((item: any) => {
      const nut = item.nutritional_data?.[0]
      return (
        nut &&
        nut.carbs &&
        nut.carbs > 0 &&
        (!nut.fiber || nut.fiber === 0)
      )
    })

    items.push(...missingFiber as MenuItem[])

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
console.log('              FILL MISSING FIBER VALUES')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log('STRATEGY:')
console.log('  Estimate fiber from carbs using food type patterns')
console.log('  - High fiber (beans, whole grains): 20% of carbs')
console.log('  - Medium fiber (vegetables, fruits): 10-12% of carbs')
console.log('  - Low fiber (entrees, snacks): 3-7% of carbs')
console.log('  - Very low fiber (desserts): 2% of carbs')
console.log('  - Minimal fiber (beverages): 0-2% of carbs\n')

const items = await fetchMissingFiber()
console.log(`Found ${items.length} items with carbs but missing fiber\n`)

if (items.length === 0) {
  console.log('✅ No items need fiber estimation!\n')
  process.exit(0)
}

console.log('═══════════════════════════════════════════════════════════════\n')

let fixed = 0
let failed = 0
const fixedByCategory = new Map<string, number>()

for (const item of items) {
  const nut = item.nutritional_data[0]
  const carbs = nut.carbs!
  const estimatedFiber = estimateFiber(item, carbs)

  console.log(`📝 ${item.name}`)
  console.log(`   Category: ${item.category}`)
  console.log(`   Current: carbs=${carbs}g, fiber=null`)
  console.log(`   Estimate: fiber=${estimatedFiber}g (${Math.round(estimatedFiber/carbs*100)}% of carbs)`)

  // Set confidence to 30 for keyword-based estimates
  const newConfidence = 30

  const success = await updateNutrition(nut.id, {
    fiber: estimatedFiber,
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
  console.log('✅ All fiber values estimated and filled\n')
  console.log('NOTE: These are estimates with confidence_score=30')
  console.log('      Important for net carb calculations\n')
}
