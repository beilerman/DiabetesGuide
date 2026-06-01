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
    protein: number | null
    confidence_score: number | null
  }>
}

// Protein estimation from calories (protein = 4 cal/g)
function estimateProtein(item: MenuItem, calories: number): number {
  const name = item.name.toLowerCase()
  const desc = (item.description || '').toLowerCase()
  const combined = name + ' ' + desc
  const category = item.category

  // High protein foods (25-35% of calories from protein)
  if (
    /steak|beef|ribeye|sirloin|filet|brisket|prime rib|short rib|pot roast/.test(combined) ||
    /chicken breast|grilled chicken|rotisserie chicken|turkey|duck/.test(combined) ||
    /salmon|tuna|mahi|swordfish|cod|tilapia|shrimp|lobster|crab|scallop/.test(combined) ||
    /pork chop|pork tenderloin|ham(?!burger)/.test(combined) ||
    /lamb chop|lamb shank/.test(combined) ||
    /eggs benedict|omelet|frittata|quiche/.test(combined)
  ) {
    return Math.round((calories * 0.30) / 4)
  }

  // Medium-high protein (20-25% of calories)
  if (
    category === 'entree' && (
      /burger|sandwich|wrap|panini/.test(combined) ||
      /chicken(?!.*salad)|pulled pork|ribs|carnitas/.test(combined) ||
      /pasta.*meat|lasagna|bolognese/.test(combined) ||
      /chili|stew/.test(combined)
    )
  ) {
    return Math.round((calories * 0.22) / 4)
  }

  // Medium protein entrees (15-20% of calories)
  if (category === 'entree') {
    // Pizza, pasta, rice bowls
    if (/pizza|pasta|noodle|rice bowl|fried rice|pad thai/.test(combined)) {
      return Math.round((calories * 0.17) / 4)
    }
    // Default entree
    return Math.round((calories * 0.20) / 4)
  }

  // Low-medium protein snacks with meat (12-18% of calories)
  if (
    category === 'snack' && (
      /chicken tender|wing|nugget|hot dog|sausage|pretzel dog/.test(combined) ||
      /meatball|beef|pork/.test(combined)
    )
  ) {
    return Math.round((calories * 0.15) / 4)
  }

  // Low protein snacks (5-10% of calories)
  if (
    category === 'snack' ||
    /chip|fries|tots|nacho|pretzel|popcorn|cracker/.test(combined)
  ) {
    return Math.round((calories * 0.08) / 4)
  }

  // Low protein sides (5-12% of calories)
  if (category === 'side') {
    // Beans, vegetables with some protein
    if (/bean|hummus|edamame|quinoa/.test(combined)) {
      return Math.round((calories * 0.12) / 4)
    }
    return Math.round((calories * 0.07) / 4)
  }

  // Very low protein desserts (2-5% of calories)
  if (
    category === 'dessert' ||
    /cake|cookie|brownie|cupcake|ice cream|sundae|churro|donut|pastry/.test(combined)
  ) {
    return Math.round((calories * 0.04) / 4)
  }

  // Minimal protein beverages (0-3% of calories)
  if (category === 'beverage') {
    // Protein shakes, milk-based drinks
    if (/protein|milk|latte|cappuccino|mocha|shake(?!.*whip)/.test(combined)) {
      return Math.round((calories * 0.10) / 4)
    }
    // Smoothies with some fruit/yogurt
    if (/smoothie/.test(combined)) {
      return Math.round((calories * 0.05) / 4)
    }
    // Most beverages
    return Math.round((calories * 0.02) / 4)
  }

  // Default fallback (10% of calories)
  return Math.round((calories * 0.10) / 4)
}

async function fetchMissingProtein() {
  const items: MenuItem[] = []
  let from = 0

  while (true) {
    const { data, error } = await sb
      .from('menu_items')
      .select(`
        id, name, category, description,
        nutritional_data(id, calories, protein, confidence_score)
      `)
      .range(from, from + 499)

    if (error) {
      console.error(error)
      break
    }
    if (!data || data.length === 0) break

    // Filter for items with calories but missing protein
    const missingProtein = data.filter((item: any) => {
      const nut = item.nutritional_data?.[0]
      return (
        nut &&
        nut.calories &&
        nut.calories > 0 &&
        (!nut.protein || nut.protein === 0)
      )
    })

    items.push(...missingProtein as MenuItem[])

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
console.log('             FILL MISSING PROTEIN VALUES')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log('STRATEGY:')
console.log('  Estimate protein from calories using category + food type')
console.log('  - High protein meats/fish: 30% of calories (÷4 = grams)')
console.log('  - Medium protein entrees: 20% of calories')
console.log('  - Low protein snacks: 8% of calories')
console.log('  - Very low protein desserts: 4% of calories')
console.log('  - Minimal protein beverages: 2% of calories\n')

const items = await fetchMissingProtein()
console.log(`Found ${items.length} items with calories but missing protein\n`)

if (items.length === 0) {
  console.log('✅ No items need protein estimation!\n')
  process.exit(0)
}

console.log('═══════════════════════════════════════════════════════════════\n')

let fixed = 0
let failed = 0
const fixedByCategory = new Map<string, number>()

for (const item of items) {
  const nut = item.nutritional_data[0]
  const calories = nut.calories!
  const estimatedProtein = estimateProtein(item, calories)

  console.log(`📝 ${item.name}`)
  console.log(`   Category: ${item.category}`)
  console.log(`   Current: calories=${calories}, protein=null`)
  console.log(`   Estimate: protein=${estimatedProtein}g (${Math.round(estimatedProtein*4/calories*100)}% of calories)`)

  // Set confidence to 30 for keyword-based estimates
  const newConfidence = 30

  const success = await updateNutrition(nut.id, {
    protein: estimatedProtein,
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
  console.log('✅ All protein values estimated and filled\n')
  console.log('NOTE: These are estimates with confidence_score=30')
  console.log('      Based on typical protein percentages by food type\n')
}
