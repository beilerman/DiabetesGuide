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
  is_fried: boolean
  description: string | null
  restaurant: { name: string; park: { name: string } }
  nutritional_data: Array<{
    id: string
    calories: number | null
    sodium: number | null
    confidence_score: number | null
  }>
}

// Sodium estimation rules by food type
const SODIUM_RULES = [
  {
    name: 'Cured Meats (Jamón, Prosciutto)',
    pattern: /jamón|jamon|prosciutto|salami|pepperoni|chorizo(?!.*chocolate)/i,
    sodiumPerCal: 2.5,
    minSodium: 2000,
    reason: 'Cured meats are heavily salted'
  },
  {
    name: 'BBQ/Ribs/Smoked Meats',
    pattern: /rib(?!.*eye)|bbq|brisket|pulled pork|smoked (?!salmon)|carnitas/i,
    sodiumPerCal: 1.2,
    minSodium: 1200,
    reason: 'BBQ sauce + dry rub very high sodium'
  },
  {
    name: 'Fried Items',
    pattern: /fried|crispy|tempura|battered|breaded/i,
    sodiumPerCal: 1.0,
    minSodium: 600,
    reason: 'Breading + seasoning'
  },
  {
    name: 'Burgers/Sandwiches',
    pattern: /burger|sandwich|panini|wrap(?!.*crab)/i,
    sodiumPerCal: 1.0,
    minSodium: 700,
    reason: 'Bread + condiments + seasoning'
  },
  {
    name: 'Pasta/Noodles',
    pattern: /pasta|spaghetti|fettuccine|penne|ravioli|gnocchi|noodle|ramen|marinara/i,
    sodiumPerCal: 0.9,
    minSodium: 600,
    reason: 'Sauce + cheese + seasoning'
  },
  {
    name: 'Pizza',
    pattern: /pizza/i,
    sodiumPerCal: 0.8,
    minSodium: 500,
    reason: 'Cheese + sauce + dough'
  },
  {
    name: 'Mexican (Tacos/Burritos)',
    pattern: /taco|burrito|fajita|enchilada|quesadilla|nachos/i,
    sodiumPerCal: 1.0,
    minSodium: 700,
    reason: 'Seasoning + cheese + salsa'
  }
]

async function fetchLowSodiumEntrees() {
  const items: MenuItem[] = []
  let from = 0

  while (true) {
    const { data, error } = await sb
      .from('menu_items')
      .select(`
        id, name, category, is_fried, description,
        restaurant:restaurants(name, park:parks(name)),
        nutritional_data(id, calories, sodium, confidence_score)
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
console.log('           FIX LOW SODIUM IN ENTREES')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log('STRATEGY:')
console.log('  Apply calorie-based sodium estimation for highly-seasoned foods')
console.log('  Theme park food is heavily salted - USDA values are too low\n')

const items = await fetchLowSodiumEntrees()
console.log(`Found ${items.length} entrees with >200 cal but <200mg sodium\n`)

console.log('═══════════════════════════════════════════════════════════════\n')

let fixed = 0
let skipped = 0
const fixedByCategory = new Map<string, number>()

for (const item of items) {
  const nut = item.nutritional_data[0]
  const calories = nut.calories!
  const currentSodium = nut.sodium!
  const nameAndDesc = item.name + ' ' + (item.description || '')

  // Find matching rule
  let matchedRule = null
  for (const rule of SODIUM_RULES) {
    if (rule.pattern.test(nameAndDesc)) {
      matchedRule = rule
      break
    }
  }

  if (!matchedRule) {
    skipped++
    continue
  }

  // Calculate new sodium
  const estimatedSodium = Math.round(calories * matchedRule.sodiumPerCal)
  const newSodium = Math.max(estimatedSodium, matchedRule.minSodium)

  // Cap at 2500mg (very high end for theme park food)
  const cappedSodium = Math.min(newSodium, 2500)

  // Skip if change is minimal (<100mg difference)
  if (cappedSodium - currentSodium < 100) {
    skipped++
    continue
  }

  console.log(`📝 ${item.name}`)
  console.log(`   Location: ${item.restaurant.name} (${item.restaurant.park.name})`)
  console.log(`   Current: ${currentSodium}mg sodium (${calories} cal)`)
  console.log(`   Fix: ${currentSodium}mg → ${cappedSodium}mg`)
  console.log(`   Rule: ${matchedRule.name} (${matchedRule.reason})`)

  // Reduce confidence score slightly since it's estimated
  const newConfidence = Math.max(30, (nut.confidence_score || 50) - 10)

  const success = await updateNutrition(nut.id, {
    sodium: cappedSodium,
    confidence_score: newConfidence
  })

  if (success) {
    fixed++
    fixedByCategory.set(matchedRule.name, (fixedByCategory.get(matchedRule.name) || 0) + 1)
    console.log(`   ✅ Fixed`)
  }
  console.log()
}

console.log('═══════════════════════════════════════════════════════════════')
console.log('SUMMARY')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log(`Items fixed: ${fixed}`)
console.log(`Items skipped: ${skipped} (no matching rule or minimal change)\n`)

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
  console.log('✅ All fixes applied\n')
}

console.log('NOTE: Skipped items may be legitimately low sodium:')
console.log('  - Plain grilled chicken/steak (no sauce)')
console.log('  - Steamed vegetables')
console.log('  - Fresh fish (unseasoned)')
console.log('  - Desserts miscategorized as entrees\n')
