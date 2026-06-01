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
    calories: number | null
    carbs: number | null
    sugar: number | null
    protein: number | null
    fiber: number | null
    sodium: number | null
    confidence_score: number | null
  }>
}

async function fetchEdgeCases() {
  const items: MenuItem[] = []
  let from = 0

  while (true) {
    const { data, error } = await sb
      .from('menu_items')
      .select(`
        id, name, category, description,
        nutritional_data(id, calories, carbs, sugar, protein, fiber, sodium, confidence_score)
      `)
      .range(from, from + 499)

    if (error) {
      console.error(error)
      break
    }
    if (!data || data.length === 0) break

    items.push(...data as MenuItem[])

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

function estimateSugar(item: MenuItem, carbs: number): number {
  const name = item.name.toLowerCase()
  const category = item.category

  // Use same logic as fill-missing-sugar.ts
  if (category === 'dessert' || /cake|cookie|brownie|cupcake|frosting|icing|chocolate|fudge|caramel|candy|sweet|sugar|honey|syrup|glaze/.test(name)) {
    return Math.round(carbs * 0.70)
  }
  if (/smoothie|juice|fruit cup|berry|apple|orange|grape|pineapple|mango|strawberry|banana|watermelon/.test(name)) {
    return Math.round(carbs * 0.75)
  }
  if (category === 'beverage' && /soda|lemonade|tea|coffee|mocha|latte|frappuccino|milkshake|shake/.test(name)) {
    if (/black coffee|hot coffee|espresso|black tea|hot tea/.test(name)) {
      return Math.round(carbs * 0.05)
    }
    return Math.round(carbs * 0.50)
  }
  if (category === 'beverage' && /water|sparkling|seltzer|club soda|unsweetened|diet/.test(name)) {
    return Math.round(carbs * 0.02)
  }
  if (/beer|wine|cocktail|margarita|sangria|mojito|martini|whiskey|rum|vodka|gin|tequila|bourbon/.test(name)) {
    return Math.round(carbs * 0.30)
  }
  if (category === 'entree') {
    if (/teriyaki|sweet and sour|orange chicken|general tso|hoisin|glazed/.test(name)) {
      return Math.round(carbs * 0.35)
    }
    if (/bbq|barbecue|pulled pork|ribs|brisket|smoked/.test(name)) {
      return Math.round(carbs * 0.30)
    }
    return Math.round(carbs * 0.20)
  }
  return Math.round(carbs * 0.20)
}

function estimateFiber(item: MenuItem, carbs: number): number {
  const name = item.name.toLowerCase()
  const category = item.category

  // Most beverages have 0 fiber
  if (category === 'beverage') {
    // Smoothies with fruit might have some fiber
    if (/smoothie/.test(name)) {
      return Math.round(carbs * 0.05)
    }
    return 0
  }

  // Use same logic as fill-missing-fiber.ts for other categories
  if (/bean|lentil|chickpea|quinoa|farro|barley|bulgur|bran|whole wheat|whole grain|multi-grain/.test(name)) {
    return Math.round(carbs * 0.20)
  }
  if (/vegetable|broccoli|cauliflower|brussels sprout|kale|spinach|artichoke|sweet potato|yam|apple|pear|berry|oatmeal|oat|salad(?!.*dressing)/.test(name)) {
    return Math.round(carbs * 0.12)
  }
  if (category === 'entree') {
    if (/salad|bowl|veggie|vegetable|rice|grain/.test(name)) {
      return Math.round(carbs * 0.07)
    }
    if (/pasta|pizza|sandwich|burger|wrap/.test(name)) {
      return Math.round(carbs * 0.05)
    }
    return Math.round(carbs * 0.05)
  }
  if (category === 'snack') {
    if (/chip|pretzel|cracker|popcorn/.test(name)) {
      return Math.round(carbs * 0.04)
    }
    return Math.round(carbs * 0.03)
  }
  if (category === 'dessert') {
    return Math.round(carbs * 0.02)
  }
  return Math.round(carbs * 0.03)
}

console.log('═══════════════════════════════════════════════════════════════')
console.log('           FILL REMAINING EDGE CASE VALUES')
console.log('═══════════════════════════════════════════════════════════════\n')

const allItems = await fetchEdgeCases()

let totalFixed = 0
let totalFailed = 0

// Fix 1: Items with carbs but missing sugar
console.log('1. FILLING MISSING SUGAR (items with carbs but no sugar)\\n')
let sugarFixed = 0
for (const item of allItems) {
  const nut = item.nutritional_data?.[0]
  if (nut && nut.carbs && nut.carbs > 0 && (!nut.sugar || nut.sugar === 0)) {
    const estimatedSugar = estimateSugar(item, nut.carbs)
    console.log(`  ${item.name}: ${nut.carbs}g carbs → ${estimatedSugar}g sugar`)
    const success = await updateNutrition(nut.id, { sugar: estimatedSugar, confidence_score: 30 })
    if (success) sugarFixed++
  }
}
console.log(`  Fixed ${sugarFixed} items\\n`)
totalFixed += sugarFixed

// Fix 2: Items with carbs but missing fiber
console.log('2. FILLING MISSING FIBER (items with carbs but no fiber)\\n')
let fiberFixed = 0
for (const item of allItems) {
  const nut = item.nutritional_data?.[0]
  if (nut && nut.carbs && nut.carbs > 0 && (!nut.fiber || nut.fiber === 0)) {
    const estimatedFiber = estimateFiber(item, nut.carbs)
    console.log(`  ${item.name}: ${nut.carbs}g carbs → ${estimatedFiber}g fiber`)
    const success = await updateNutrition(nut.id, { fiber: estimatedFiber, confidence_score: 30 })
    if (success) fiberFixed++
  }
}
console.log(`  Fixed ${fiberFixed} items\\n`)
totalFixed += fiberFixed

// Fix 3: Very low-calorie items (<5 cal) missing protein/sodium
console.log('3. FILLING VERY LOW-CALORIE ITEMS (<5 cal) with 0 protein/sodium\\n')
let lowCalFixed = 0
for (const item of allItems) {
  const nut = item.nutritional_data?.[0]
  if (nut && nut.calories && nut.calories > 0 && nut.calories < 5) {
    const updates: Record<string, number> = {}
    if (!nut.protein || nut.protein === 0) {
      updates.protein = 0
    }
    if (!nut.sodium || nut.sodium === 0) {
      updates.sodium = 0
    }
    if (Object.keys(updates).length > 0) {
      updates.confidence_score = 30
      console.log(`  ${item.name}: ${nut.calories} cal → protein=0, sodium=0`)
      const success = await updateNutrition(nut.id, updates)
      if (success) lowCalFixed++
    }
  }
}
console.log(`  Fixed ${lowCalFixed} items\\n`)
totalFixed += lowCalFixed

// Fix 4: Items with calories but no carbs - set sugar and fiber to 0
console.log('4. ITEMS WITH CALORIES BUT NO CARBS (setting sugar/fiber to 0)\\n')
let noCarbs = 0
for (const item of allItems) {
  const nut = item.nutritional_data?.[0]
  if (nut && nut.calories && nut.calories > 0 && (!nut.carbs || nut.carbs === 0)) {
    const updates: Record<string, number> = {}
    if (!nut.sugar || nut.sugar === 0) {
      updates.sugar = 0
    }
    if (!nut.fiber || nut.fiber === 0) {
      updates.fiber = 0
    }
    if (Object.keys(updates).length > 0) {
      updates.confidence_score = 30
      console.log(`  ${item.name}: 0 carbs → sugar=0, fiber=0`)
      const success = await updateNutrition(nut.id, updates)
      if (success) noCarbs++
    }
  }
}
console.log(`  Fixed ${noCarbs} items\\n`)
totalFixed += noCarbs

console.log('═══════════════════════════════════════════════════════════════')
console.log('SUMMARY')
console.log('═══════════════════════════════════════════════════════════════\\n')

console.log(`Total items fixed: ${totalFixed}`)
console.log(`Total items failed: ${totalFailed}\\n`)

if (DRY_RUN) {
  console.log('🔍 DRY RUN MODE - No changes were made')
  console.log('   Run without --dry-run to apply fixes\\n')
} else {
  console.log('✅ All edge case values filled\\n')
}
