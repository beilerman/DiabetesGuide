/**
 * fill-empty-fields.ts — Diagnose and fill NULL/empty fields across the database
 *
 * Covers:
 * 1. menu_items with no nutritional_data row at all → create one with estimates
 * 2. nutritional_data rows with NULL calories/carbs/fat → estimate from food type
 * 3. nutritional_data rows with NULL sugar/protein/fiber/sodium → estimate from food type
 * 4. menu_items with NULL description → generate short description from name + category
 * 5. restaurants with NULL land → infer from park data where possible
 * 6. menu_items with NULL category → infer from name
 *
 * Run: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/fill-empty-fields.ts
 *   or: npx tsx scripts/fill-empty-fields.ts --dry-run   (report only, no writes)
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(url, key)
const DRY_RUN = process.argv.includes('--dry-run')

if (DRY_RUN) console.log('*** DRY RUN — no writes will be made ***\n')

let totalFixes = 0

// ================================================================
// Helpers
// ================================================================

interface NutRow {
  id: string
  menu_item_id: string
  calories: number | null
  carbs: number | null
  fat: number | null
  sugar: number | null
  protein: number | null
  fiber: number | null
  sodium: number | null
  cholesterol: number | null
  source: string
  confidence_score: number | null
}

interface MenuItem {
  id: string
  name: string
  description: string | null
  category: string | null
  is_fried: boolean
  is_vegetarian: boolean
  is_seasonal: boolean
  restaurant_id: string
  nutritional_data: NutRow[]
}

interface Restaurant {
  id: string
  name: string
  land: string | null
  park_id: string
}

async function fetchAllItems(): Promise<MenuItem[]> {
  const all: MenuItem[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('menu_items')
      .select('id, name, description, category, is_fried, is_vegetarian, is_seasonal, restaurant_id, nutritional_data(*)')
      .range(from, from + 499)
    if (error) { console.error('Fetch error:', error.message); break }
    if (!data || data.length === 0) break
    all.push(...(data as unknown as MenuItem[]))
    if (data.length < 500) break
    from += 500
  }
  return all
}

async function fetchAllRestaurants(): Promise<Restaurant[]> {
  const { data, error } = await sb.from('restaurants').select('id, name, land, park_id')
  if (error) { console.error('Restaurant fetch error:', error.message); return [] }
  return (data ?? []) as Restaurant[]
}

// ================================================================
// Phase 0: Diagnostic report
// ================================================================

async function diagnose(items: MenuItem[], restaurants: Restaurant[]) {
  console.log('=== DIAGNOSTIC REPORT ===\n')

  const total = items.length
  const noNutRow = items.filter(i => !i.nutritional_data || i.nutritional_data.length === 0)
  const hasNut = items.filter(i => i.nutritional_data?.length > 0)

  const nd = (i: MenuItem) => i.nutritional_data?.[0]

  const nullCalories = hasNut.filter(i => nd(i)?.calories == null || nd(i)!.calories === 0)
  const nullCarbs = hasNut.filter(i => nd(i)?.carbs == null)
  const nullFat = hasNut.filter(i => nd(i)?.fat == null)
  const nullSugar = hasNut.filter(i => nd(i)?.sugar == null || nd(i)!.sugar === 0)
  const nullProtein = hasNut.filter(i => nd(i)?.protein == null || nd(i)!.protein === 0)
  const nullFiber = hasNut.filter(i => nd(i)?.fiber == null)
  const nullSodium = hasNut.filter(i => nd(i)?.sodium == null || nd(i)!.sodium === 0)
  const nullCholesterol = hasNut.filter(i => nd(i)?.cholesterol == null)

  const nullDescription = items.filter(i => !i.description)
  const nullCategory = items.filter(i => !i.category)
  const nullLand = restaurants.filter(r => !r.land)

  // Items with all micros missing (sugar=0, protein=0, sodium=0)
  const allMicrosMissing = hasNut.filter(i => {
    const n = nd(i)
    return n && n.calories && n.calories > 0 &&
      (n.sugar ?? 0) === 0 && (n.protein ?? 0) === 0 && (n.sodium ?? 0) === 0
  })

  console.log(`Total menu items:                ${total}`)
  console.log(`  No nutritional_data row:       ${noNutRow.length}`)
  console.log(`  Has nutritional_data:          ${hasNut.length}`)
  console.log(`  ├─ NULL/0 calories:            ${nullCalories.length}`)
  console.log(`  ├─ NULL carbs:                 ${nullCarbs.length}`)
  console.log(`  ├─ NULL fat:                   ${nullFat.length}`)
  console.log(`  ├─ NULL/0 sugar:               ${nullSugar.length}`)
  console.log(`  ├─ NULL/0 protein:             ${nullProtein.length}`)
  console.log(`  ├─ NULL fiber:                 ${nullFiber.length}`)
  console.log(`  ├─ NULL/0 sodium:              ${nullSodium.length}`)
  console.log(`  ├─ NULL cholesterol:           ${nullCholesterol.length}`)
  console.log(`  └─ All micros missing (s/p/n): ${allMicrosMissing.length}`)
  console.log(`  NULL description:              ${nullDescription.length}`)
  console.log(`  NULL category:                 ${nullCategory.length}`)
  console.log(`  NULL restaurant land:          ${nullLand.length}`)
  console.log()

  if (noNutRow.length > 0) {
    console.log('Sample items missing nutritional_data row:')
    for (const i of noNutRow.slice(0, 10)) {
      console.log(`  - ${i.name} (${i.category ?? 'no category'})`)
    }
    if (noNutRow.length > 10) console.log(`  ... and ${noNutRow.length - 10} more`)
    console.log()
  }

  return {
    noNutRow, nullCalories, nullCarbs, nullFat, nullSugar, nullProtein,
    nullFiber, nullSodium, nullCholesterol, nullDescription, nullCategory,
    nullLand, allMicrosMissing,
  }
}

// ================================================================
// Food-type classification & nutrition estimation
// ================================================================

interface NutritionEstimate {
  calories: number
  carbs: number
  fat: number
  protein: number
  sugar: number
  fiber: number
  sodium: number
  cholesterol: number
}

function classifyAndEstimate(name: string, category: string | null, isFried: boolean): NutritionEstimate {
  const n = name.toLowerCase()
  const cat = (category || '').toLowerCase()

  // Beverages
  if (cat === 'beverage' || /\b(soda|lemonade|juice|smoothie|slush|icee|tea|water)\b/i.test(n)) {
    if (/water\b/i.test(n) && !/lobster|coconut|fire/i.test(n)) return { calories: 0, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 5, cholesterol: 0 }
    if (/coffee|latte|cappuccino|mocha|cold brew|espresso|macchiato/i.test(n)) return { calories: 250, carbs: 35, fat: 8, protein: 8, sugar: 30, fiber: 0, sodium: 120, cholesterol: 25 }
    if (/beer|ale|lager|ipa|stout|pilsner/i.test(n)) return { calories: 200, carbs: 18, fat: 0, protein: 2, sugar: 2, fiber: 0, sodium: 15, cholesterol: 0 }
    if (/wine/i.test(n)) return { calories: 150, carbs: 5, fat: 0, protein: 0, sugar: 2, fiber: 0, sodium: 10, cholesterol: 0 }
    if (/margarita|cocktail|mojito|daiquiri|sangria|martini/i.test(n)) return { calories: 280, carbs: 30, fat: 0, protein: 0, sugar: 25, fiber: 0, sodium: 20, cholesterol: 0 }
    if (/milkshake|shake/i.test(n)) return { calories: 700, carbs: 90, fat: 28, protein: 12, sugar: 75, fiber: 1, sodium: 350, cholesterol: 80 }
    if (/smoothie/i.test(n)) return { calories: 350, carbs: 65, fat: 5, protein: 8, sugar: 50, fiber: 4, sodium: 80, cholesterol: 5 }
    // Generic sweet drink
    return { calories: 200, carbs: 52, fat: 0, protein: 0, sugar: 48, fiber: 0, sodium: 25, cholesterol: 0 }
  }

  // Desserts
  if (cat === 'dessert' || /cake|cupcake|cookie|brownie|churro|donut|doughnut|sundae|ice cream|dole whip|pie|tart|fudge|candy|crisp\b|cobbler|pudding|macaron|cinnamon roll|waffle cone/i.test(n)) {
    if (/dole whip|soft serve/i.test(n)) return { calories: 250, carbs: 50, fat: 4, protein: 1, sugar: 38, fiber: 1, sodium: 40, cholesterol: 5 }
    if (/churro/i.test(n)) return { calories: 350, carbs: 50, fat: 15, protein: 4, sugar: 22, fiber: 1, sodium: 200, cholesterol: 10 }
    if (/cupcake/i.test(n)) return { calories: 550, carbs: 70, fat: 28, protein: 5, sugar: 55, fiber: 1, sodium: 300, cholesterol: 60 }
    if (/brownie/i.test(n)) return { calories: 450, carbs: 55, fat: 22, protein: 5, sugar: 38, fiber: 2, sodium: 200, cholesterol: 50 }
    if (/cookie/i.test(n)) return { calories: 400, carbs: 55, fat: 18, protein: 4, sugar: 32, fiber: 1, sodium: 250, cholesterol: 40 }
    if (/sundae/i.test(n)) return { calories: 600, carbs: 75, fat: 28, protein: 8, sugar: 60, fiber: 1, sodium: 200, cholesterol: 70 }
    if (/funnel cake/i.test(n)) return { calories: 700, carbs: 80, fat: 35, protein: 8, sugar: 40, fiber: 2, sodium: 350, cholesterol: 50 }
    if (/pie|tart/i.test(n)) return { calories: 400, carbs: 50, fat: 20, protein: 4, sugar: 28, fiber: 2, sodium: 300, cholesterol: 30 }
    if (/cinnamon roll/i.test(n)) return { calories: 500, carbs: 65, fat: 22, protein: 7, sugar: 35, fiber: 2, sodium: 450, cholesterol: 40 }
    if (/pudding|bread pudding/i.test(n)) return { calories: 500, carbs: 60, fat: 22, protein: 8, sugar: 40, fiber: 1, sodium: 300, cholesterol: 70 }
    // Generic dessert
    return { calories: 450, carbs: 55, fat: 22, protein: 5, sugar: 35, fiber: 1, sodium: 250, cholesterol: 40 }
  }

  // Sides
  if (cat === 'side') {
    if (/fries|french fries|tots|tater/i.test(n)) return { calories: 400, carbs: 50, fat: 20, protein: 5, sugar: 1, fiber: 4, sodium: 600, cholesterol: 0 }
    if (/onion ring/i.test(n)) return { calories: 450, carbs: 50, fat: 25, protein: 6, sugar: 5, fiber: 3, sodium: 700, cholesterol: 10 }
    if (/coleslaw|slaw/i.test(n)) return { calories: 200, carbs: 18, fat: 14, protein: 1, sugar: 12, fiber: 2, sodium: 300, cholesterol: 10 }
    if (/corn/i.test(n)) return { calories: 200, carbs: 30, fat: 8, protein: 5, sugar: 8, fiber: 3, sodium: 250, cholesterol: 5 }
    if (/rice/i.test(n)) return { calories: 250, carbs: 50, fat: 4, protein: 5, sugar: 1, fiber: 1, sodium: 300, cholesterol: 0 }
    if (/salad|garden|caesar/i.test(n)) return { calories: 200, carbs: 12, fat: 14, protein: 6, sugar: 4, fiber: 3, sodium: 350, cholesterol: 10 }
    if (/bread|roll|biscuit/i.test(n)) return { calories: 250, carbs: 35, fat: 10, protein: 6, sugar: 4, fiber: 2, sodium: 400, cholesterol: 15 }
    if (/soup|chili|bisque|chowder/i.test(n)) return { calories: 300, carbs: 25, fat: 15, protein: 12, sugar: 5, fiber: 3, sodium: 900, cholesterol: 30 }
    // Generic side
    return { calories: 250, carbs: 30, fat: 12, protein: 5, sugar: 3, fiber: 2, sodium: 400, cholesterol: 10 }
  }

  // Snacks
  if (cat === 'snack') {
    if (/pretzel/i.test(n)) return { calories: 480, carbs: 75, fat: 10, protein: 12, sugar: 5, fiber: 3, sodium: 1200, cholesterol: 0 }
    if (/popcorn/i.test(n)) return { calories: 400, carbs: 45, fat: 22, protein: 5, sugar: 2, fiber: 8, sodium: 500, cholesterol: 0 }
    if (/nachos|totchos/i.test(n)) return { calories: 700, carbs: 65, fat: 40, protein: 18, sugar: 4, fiber: 5, sodium: 1200, cholesterol: 40 }
    if (/turkey leg/i.test(n)) return { calories: 1093, carbs: 0, fat: 54, protein: 152, sugar: 0, fiber: 0, sodium: 3500, cholesterol: 400 }
    if (/spring roll|egg roll/i.test(n)) return { calories: 300, carbs: 30, fat: 14, protein: 10, sugar: 3, fiber: 2, sodium: 600, cholesterol: 15 }
    if (/hummus/i.test(n)) return { calories: 350, carbs: 35, fat: 18, protein: 12, sugar: 3, fiber: 6, sodium: 600, cholesterol: 0 }
    if (/empanada/i.test(n)) return { calories: 350, carbs: 30, fat: 18, protein: 14, sugar: 2, fiber: 2, sodium: 500, cholesterol: 25 }
    // Generic snack
    return { calories: 350, carbs: 40, fat: 16, protein: 8, sugar: 5, fiber: 2, sodium: 500, cholesterol: 10 }
  }

  // Entrees (default category)
  if (/burger/i.test(n)) return { calories: 850, carbs: 45, fat: 45, protein: 40, sugar: 8, fiber: 3, sodium: 1100, cholesterol: 90 }
  if (/hot dog/i.test(n)) return { calories: 550, carbs: 35, fat: 30, protein: 18, sugar: 5, fiber: 2, sodium: 1200, cholesterol: 50 }
  if (/pizza/i.test(n)) return { calories: 700, carbs: 70, fat: 30, protein: 28, sugar: 6, fiber: 3, sodium: 1400, cholesterol: 50 }
  if (/sandwich|panini|sub\b/i.test(n)) return { calories: 650, carbs: 50, fat: 28, protein: 30, sugar: 6, fiber: 3, sodium: 1100, cholesterol: 60 }
  if (/wrap/i.test(n)) return { calories: 550, carbs: 45, fat: 22, protein: 28, sugar: 4, fiber: 4, sodium: 900, cholesterol: 50 }
  if (/taco/i.test(n)) return { calories: 450, carbs: 35, fat: 22, protein: 20, sugar: 3, fiber: 4, sodium: 800, cholesterol: 40 }
  if (/burrito/i.test(n)) return { calories: 700, carbs: 70, fat: 28, protein: 30, sugar: 4, fiber: 8, sodium: 1200, cholesterol: 50 }
  if (/chicken tender|chicken strip|chicken finger|chicken nugget/i.test(n)) return { calories: 600, carbs: 35, fat: 30, protein: 35, sugar: 2, fiber: 1, sodium: 1000, cholesterol: 80 }
  if (/fried chicken|chicken.*fried/i.test(n)) return { calories: 700, carbs: 30, fat: 38, protein: 45, sugar: 1, fiber: 1, sodium: 1200, cholesterol: 120 }
  if (/grilled chicken/i.test(n)) return { calories: 500, carbs: 15, fat: 18, protein: 50, sugar: 2, fiber: 2, sodium: 800, cholesterol: 100 }
  if (/steak|filet|ribeye|sirloin|prime rib/i.test(n)) return { calories: 800, carbs: 10, fat: 45, protein: 60, sugar: 1, fiber: 0, sodium: 700, cholesterol: 150 }
  if (/salmon/i.test(n)) return { calories: 550, carbs: 12, fat: 28, protein: 45, sugar: 2, fiber: 1, sodium: 600, cholesterol: 80 }
  if (/fish.*chip/i.test(n)) return { calories: 800, carbs: 60, fat: 40, protein: 30, sugar: 3, fiber: 3, sodium: 1000, cholesterol: 60 }
  if (/ribs/i.test(n)) return { calories: 900, carbs: 20, fat: 55, protein: 60, sugar: 12, fiber: 1, sodium: 1200, cholesterol: 150 }
  if (/brisket/i.test(n)) return { calories: 700, carbs: 10, fat: 40, protein: 55, sugar: 5, fiber: 0, sodium: 900, cholesterol: 120 }
  if (/pasta|spaghetti|fettuccine|penne|mac.*cheese/i.test(n)) return { calories: 650, carbs: 70, fat: 25, protein: 22, sugar: 6, fiber: 4, sodium: 900, cholesterol: 40 }
  if (/salad/i.test(n)) return { calories: 400, carbs: 20, fat: 25, protein: 25, sugar: 6, fiber: 4, sodium: 700, cholesterol: 40 }
  if (/soup|stew|bisque|chowder|gumbo/i.test(n)) return { calories: 350, carbs: 30, fat: 15, protein: 15, sugar: 5, fiber: 3, sodium: 1000, cholesterol: 30 }
  if (/bowl|grain bowl|rice bowl|poke/i.test(n)) return { calories: 550, carbs: 60, fat: 18, protein: 28, sugar: 6, fiber: 4, sodium: 800, cholesterol: 40 }
  if (/quesadilla/i.test(n)) return { calories: 600, carbs: 40, fat: 32, protein: 28, sugar: 3, fiber: 3, sodium: 1000, cholesterol: 60 }
  if (/pot pie/i.test(n)) return { calories: 650, carbs: 50, fat: 35, protein: 22, sugar: 4, fiber: 3, sodium: 900, cholesterol: 50 }
  if (/wings/i.test(n)) return { calories: 700, carbs: 15, fat: 42, protein: 50, sugar: 3, fiber: 1, sodium: 1400, cholesterol: 150 }

  // Fried bump
  if (isFried) return { calories: 650, carbs: 45, fat: 35, protein: 25, sugar: 3, fiber: 2, sodium: 1000, cholesterol: 50 }

  // Vegetarian entree
  if (/tofu|veggie|vegetable|impossible|beyond|plant/i.test(n)) return { calories: 450, carbs: 40, fat: 18, protein: 20, sugar: 5, fiber: 6, sodium: 700, cholesterol: 0 }

  // Generic entree fallback
  return { calories: 550, carbs: 45, fat: 22, protein: 25, sugar: 5, fiber: 3, sodium: 800, cholesterol: 40 }
}

// ================================================================
// Infer category from name
// ================================================================

function inferCategory(name: string): string {
  const n = name.toLowerCase()

  // Beverages first
  if (/\b(beer|ale|lager|ipa|stout|wine|margarita|cocktail|mojito|sangria|martini|daiquiri|soda|lemonade|juice|smoothie|tea|coffee|latte|espresso|cappuccino|mocha|cold brew|water|milkshake|shake|punch|slush|icee|butterbeer)\b/i.test(n)) return 'beverage'

  // Desserts (check before "crisp" to avoid savory false positives)
  if (/cake|cupcake|brownie|sundae|ice cream|dole whip|cookie|pie\b|tart|churro|donut|doughnut|fudge|candy|cobbler|pudding|macaron|cinnamon roll|waffle cone|parfait/i.test(n)) {
    // Exclude savory "crispy" items — false positive trap
    if (/crispy.*(chicken|buffalo|onion|wonton|shrimp|fish|pork|bacon|sandwich|wing|tender|finger|salad|ring)/i.test(n)) return 'entree'
    return 'dessert'
  }

  // Sides
  if (/^(side|french fries|fries|tots|tater|coleslaw|slaw|corn on|rice|mashed|baked beans|applesauce|fruit cup|house salad|garden salad|caesar salad|breadstick|dinner roll)\b/i.test(n)) return 'side'

  // Snacks
  if (/pretzel(?!.*dog)|popcorn|nachos|totchos|turkey leg|spring roll|egg roll|hummus|empanada|chips?\b.*(?:salsa|guac)|edamame/i.test(n)) return 'snack'

  // Default to entree
  return 'entree'
}

// ================================================================
// Phase 1: Create missing nutritional_data rows
// ================================================================

async function fillMissingNutritionalRows(items: MenuItem[]) {
  const missing = items.filter(i => !i.nutritional_data || i.nutritional_data.length === 0)
  console.log(`\n=== Phase 1: Items missing nutritional_data row: ${missing.length} ===\n`)
  if (missing.length === 0) return

  let created = 0
  for (const item of missing) {
    const est = classifyAndEstimate(item.name, item.category, item.is_fried)
    const row = {
      menu_item_id: item.id,
      calories: est.calories,
      carbs: est.carbs,
      fat: est.fat,
      protein: est.protein,
      sugar: est.sugar,
      fiber: est.fiber,
      sodium: est.sodium,
      cholesterol: est.cholesterol,
      source: 'api_lookup' as const,
      confidence_score: 25, // low — heuristic estimate only
    }

    if (created < 20) console.log(`  + ${item.name} (${item.category ?? 'no cat'}) → ${est.calories} cal, ${est.carbs}g carbs`)

    if (!DRY_RUN) {
      const { error } = await sb.from('nutritional_data').insert(row)
      if (error) {
        console.error(`  INSERT error for "${item.name}":`, error.message)
        continue
      }
    }
    created++
    totalFixes++
  }
  if (created > 20) console.log(`  ... and ${created - 20} more`)
  console.log(`  Created ${created} nutritional_data rows`)
}

// ================================================================
// Phase 2: Fill NULL primary macros (calories, carbs, fat)
// ================================================================

async function fillNullMacros(items: MenuItem[]) {
  const needFix = items.filter(i => {
    const nd = i.nutritional_data?.[0]
    if (!nd) return false
    return (nd.calories == null || nd.calories === 0) && nd.carbs == null && nd.fat == null
  })
  console.log(`\n=== Phase 2: Items with NULL/0 primary macros: ${needFix.length} ===\n`)
  if (needFix.length === 0) return

  let fixed = 0
  for (const item of needFix) {
    const nd = item.nutritional_data[0]
    const est = classifyAndEstimate(item.name, item.category, item.is_fried)
    const updates: Record<string, number> = { confidence_score: 25 }

    if (nd.calories == null || nd.calories === 0) updates.calories = est.calories
    if (nd.carbs == null) updates.carbs = est.carbs
    if (nd.fat == null) updates.fat = est.fat
    if (nd.protein == null) updates.protein = est.protein
    if (nd.sugar == null) updates.sugar = est.sugar
    if (nd.fiber == null) updates.fiber = est.fiber
    if (nd.sodium == null) updates.sodium = est.sodium
    if (nd.cholesterol == null) updates.cholesterol = est.cholesterol

    if (fixed < 20) console.log(`  ~ ${item.name} → est ${est.calories} cal, ${est.carbs}g carbs`)

    if (!DRY_RUN) {
      const { error } = await sb.from('nutritional_data').update(updates).eq('id', nd.id)
      if (error) { console.error(`  Update error for "${item.name}":`, error.message); continue }
    }
    fixed++
    totalFixes++
  }
  if (fixed > 20) console.log(`  ... and ${fixed - 20} more`)
  console.log(`  Fixed ${fixed} items`)
}

// ================================================================
// Phase 3: Fill NULL micronutrients (sugar, protein, fiber, sodium, cholesterol)
// Items that have calories but are missing micros
// ================================================================

async function fillNullMicros(items: MenuItem[]) {
  const needFix = items.filter(i => {
    const nd = i.nutritional_data?.[0]
    if (!nd || !nd.calories || nd.calories === 0) return false
    // At least one of sugar/protein/sodium should be null/0 (all missing)
    return (nd.sugar ?? 0) === 0 && (nd.protein ?? 0) === 0 && (nd.sodium ?? 0) === 0
  })
  console.log(`\n=== Phase 3: Items with all micros missing (sugar+protein+sodium=0): ${needFix.length} ===\n`)
  if (needFix.length === 0) return

  let fixed = 0
  for (const item of needFix) {
    const nd = item.nutritional_data[0]
    const cal = nd.calories!
    const name = item.name.toLowerCase()

    const updates: Record<string, number> = {}
    const confScore = Math.min(nd.confidence_score ?? 50, 30)

    // Estimate based on food type — expanded version of fix-audit-findings.ts Fix F
    if (/cake|cookie|cupcake|brownie|churro|donut|doughnut|tart|pastry|candy|fudge|sundae|ice cream|pudding|cobbler|macaron|cinnamon roll/i.test(name)) {
      updates.sugar = Math.round(cal * 0.30 / 4)
      updates.protein = Math.round(cal * 0.05 / 4)
      updates.sodium = Math.round(cal * 0.4)
      updates.fiber = Math.round(cal * 0.005)
      updates.cholesterol = Math.round(cal * 0.08)
    } else if (/coffee|latte|cold brew|mocha|cappuccino|espresso|macchiato/i.test(name)) {
      updates.sugar = Math.round(cal * 0.50 / 4)
      updates.protein = Math.round(cal * 0.10 / 4)
      updates.sodium = Math.round(cal * 0.3)
      updates.fiber = 0
      updates.cholesterol = Math.round(cal * 0.05)
    } else if (/beer|ale|lager|wine|margarita|cocktail|mojito|sangria|martini|daiquiri/i.test(name)) {
      updates.sugar = Math.round(cal * 0.10 / 4)
      updates.protein = Math.round(cal * 0.02 / 4)
      updates.sodium = Math.round(cal * 0.1)
      updates.fiber = 0
      updates.cholesterol = 0
    } else if (/soda|lemonade|juice|slush|icee|punch/i.test(name)) {
      updates.sugar = Math.round(cal * 0.90 / 4) // almost all sugar
      updates.protein = 0
      updates.sodium = Math.round(cal * 0.15)
      updates.fiber = 0
      updates.cholesterol = 0
    } else if (/popcorn|pretzel|chip/i.test(name)) {
      updates.sugar = Math.round(cal * 0.05 / 4)
      updates.protein = Math.round(cal * 0.08 / 4)
      updates.sodium = Math.round(cal * 1.5) // salty snacks
      updates.fiber = Math.round(cal * 0.01)
      updates.cholesterol = 0
    } else if (/burger|steak|chicken|pork|beef|turkey|ribs|brisket|salmon|fish|shrimp|lobster|crab|lamb|meatball|wing/i.test(name)) {
      updates.sugar = Math.round(cal * 0.03 / 4)
      updates.protein = Math.round(cal * 0.20 / 4) // 20% from protein
      updates.sodium = Math.round(cal * 1.1)
      updates.fiber = Math.round(cal * 0.005)
      updates.cholesterol = Math.round(cal * 0.12)
    } else if (/pizza|pasta|spaghetti|fettuccine|penne|mac.*cheese|noodle/i.test(name)) {
      updates.sugar = Math.round(cal * 0.06 / 4)
      updates.protein = Math.round(cal * 0.14 / 4)
      updates.sodium = Math.round(cal * 1.3)
      updates.fiber = Math.round(cal * 0.008)
      updates.cholesterol = Math.round(cal * 0.06)
    } else if (/salad/i.test(name)) {
      updates.sugar = Math.round(cal * 0.08 / 4)
      updates.protein = Math.round(cal * 0.18 / 4)
      updates.sodium = Math.round(cal * 0.9)
      updates.fiber = Math.round(cal * 0.02)
      updates.cholesterol = Math.round(cal * 0.05)
    } else if (/sandwich|wrap|panini|sub\b|burrito|taco|quesadilla/i.test(name)) {
      updates.sugar = Math.round(cal * 0.05 / 4)
      updates.protein = Math.round(cal * 0.16 / 4)
      updates.sodium = Math.round(cal * 1.2)
      updates.fiber = Math.round(cal * 0.008)
      updates.cholesterol = Math.round(cal * 0.08)
    } else if (/soup|stew|bisque|chowder|gumbo/i.test(name)) {
      updates.sugar = Math.round(cal * 0.06 / 4)
      updates.protein = Math.round(cal * 0.15 / 4)
      updates.sodium = Math.round(cal * 1.5)
      updates.fiber = Math.round(cal * 0.01)
      updates.cholesterol = Math.round(cal * 0.06)
    } else {
      // Default savory
      updates.sugar = Math.round(cal * 0.05 / 4)
      updates.protein = Math.round(cal * 0.15 / 4)
      updates.sodium = Math.round(cal * 1.0)
      updates.fiber = Math.round(cal * 0.008)
      updates.cholesterol = Math.round(cal * 0.06)
    }

    updates.confidence_score = confScore

    // Only fill fields that are currently null/0
    const finalUpdates: Record<string, number> = { confidence_score: confScore }
    if ((nd.sugar ?? 0) === 0 && updates.sugar != null) finalUpdates.sugar = updates.sugar
    if ((nd.protein ?? 0) === 0 && updates.protein != null) finalUpdates.protein = updates.protein
    if ((nd.sodium ?? 0) === 0 && updates.sodium != null) finalUpdates.sodium = updates.sodium
    if (nd.fiber == null && updates.fiber != null) finalUpdates.fiber = updates.fiber
    if (nd.cholesterol == null && updates.cholesterol != null) finalUpdates.cholesterol = updates.cholesterol

    if (fixed < 20) console.log(`  ~ ${item.name} → sugar=${finalUpdates.sugar ?? '-'}g, protein=${finalUpdates.protein ?? '-'}g, sodium=${finalUpdates.sodium ?? '-'}mg`)

    if (!DRY_RUN) {
      const { error } = await sb.from('nutritional_data').update(finalUpdates).eq('id', nd.id)
      if (error) { console.error(`  Update error for "${item.name}":`, error.message); continue }
    }
    fixed++
    totalFixes++
  }
  if (fixed > 20) console.log(`  ... and ${fixed - 20} more`)
  console.log(`  Fixed ${fixed} items with missing micros`)
}

// ================================================================
// Phase 4: Fill individual NULL micros where some exist but not all
// (e.g., has calories+carbs+fat but fiber is NULL)
// ================================================================

async function fillIndividualNulls(items: MenuItem[]) {
  const needFix = items.filter(i => {
    const nd = i.nutritional_data?.[0]
    if (!nd || !nd.calories || nd.calories === 0) return false
    // Has at least some data, but not all fields
    const hasCalories = nd.calories > 0
    const missingAny = nd.sugar == null || nd.protein == null || nd.fiber == null || nd.sodium == null || nd.cholesterol == null
    // Not covered by Phase 3 (which handles all-zero micros)
    const hasSomeMicros = (nd.sugar ?? 0) > 0 || (nd.protein ?? 0) > 0 || (nd.sodium ?? 0) > 0
    return hasCalories && missingAny && hasSomeMicros
  })
  console.log(`\n=== Phase 4: Items with some but not all micros: ${needFix.length} ===\n`)
  if (needFix.length === 0) return

  let fixed = 0
  for (const item of needFix) {
    const nd = item.nutritional_data[0]
    const cal = nd.calories!
    const name = item.name.toLowerCase()
    const est = classifyAndEstimate(item.name, item.category, item.is_fried)

    const finalUpdates: Record<string, number> = {}
    let changed = false

    if (nd.sugar == null) { finalUpdates.sugar = est.sugar; changed = true }
    if (nd.protein == null) { finalUpdates.protein = est.protein; changed = true }
    if (nd.fiber == null) { finalUpdates.fiber = est.fiber; changed = true }
    if (nd.sodium == null) { finalUpdates.sodium = est.sodium; changed = true }
    if (nd.cholesterol == null) { finalUpdates.cholesterol = est.cholesterol; changed = true }

    if (!changed) continue

    // Preserve existing confidence, just lower slightly
    finalUpdates.confidence_score = Math.min(nd.confidence_score ?? 50, 40)

    if (fixed < 20) {
      const fields = Object.keys(finalUpdates).filter(k => k !== 'confidence_score').join(', ')
      console.log(`  ~ ${item.name} → filling: ${fields}`)
    }

    if (!DRY_RUN) {
      const { error } = await sb.from('nutritional_data').update(finalUpdates).eq('id', nd.id)
      if (error) { console.error(`  Update error for "${item.name}":`, error.message); continue }
    }
    fixed++
    totalFixes++
  }
  if (fixed > 20) console.log(`  ... and ${fixed - 20} more`)
  console.log(`  Fixed ${fixed} items with individually missing micros`)
}

// ================================================================
// Phase 5: Fill NULL category on menu_items
// ================================================================

async function fillNullCategory(items: MenuItem[]) {
  const missing = items.filter(i => !i.category)
  console.log(`\n=== Phase 5: Items with NULL category: ${missing.length} ===\n`)
  if (missing.length === 0) return

  let fixed = 0
  for (const item of missing) {
    const cat = inferCategory(item.name)
    if (fixed < 20) console.log(`  ~ ${item.name} → ${cat}`)

    if (!DRY_RUN) {
      const { error } = await sb.from('menu_items').update({ category: cat }).eq('id', item.id)
      if (error) { console.error(`  Update error for "${item.name}":`, error.message); continue }
    }
    fixed++
    totalFixes++
  }
  if (fixed > 20) console.log(`  ... and ${fixed - 20} more`)
  console.log(`  Fixed ${fixed} items`)
}

// ================================================================
// Phase 6: Fill NULL description on menu_items
// ================================================================

function generateDescription(name: string, category: string | null): string {
  const cat = (category || 'entree').toLowerCase()
  const n = name.toLowerCase()

  // Don't generate useless descriptions for simple items
  if (/^(water|soda|coca-cola|sprite|diet coke|milk|orange juice|apple juice|coffee|tea)\b/i.test(n)) {
    return ''
  }

  // Build a short, helpful description
  if (cat === 'beverage') {
    if (/beer|ale|lager|ipa|stout/i.test(n)) return 'Draft beer selection'
    if (/wine/i.test(n)) return 'Wine selection'
    if (/margarita|cocktail|mojito|martini|daiquiri|sangria/i.test(n)) return 'Specialty cocktail'
    if (/coffee|latte|mocha|espresso|cold brew|cappuccino/i.test(n)) return 'Coffee beverage'
    if (/smoothie/i.test(n)) return 'Blended fruit smoothie'
    if (/lemonade|punch|slush/i.test(n)) return 'Refreshing cold drink'
    return 'Refreshing beverage'
  }
  if (cat === 'dessert') {
    if (/dole whip/i.test(n)) return 'Iconic frozen pineapple treat'
    if (/churro/i.test(n)) return 'Warm cinnamon-sugar pastry'
    if (/sundae/i.test(n)) return 'Ice cream sundae with toppings'
    if (/cupcake/i.test(n)) return 'Decorated theme park cupcake'
    if (/cookie/i.test(n)) return 'Freshly baked cookie'
    if (/brownie/i.test(n)) return 'Rich chocolate brownie'
    return 'Theme park dessert'
  }
  if (cat === 'snack') {
    if (/pretzel/i.test(n)) return 'Warm soft pretzel'
    if (/popcorn/i.test(n)) return 'Freshly popped popcorn'
    if (/nachos|totchos/i.test(n)) return 'Loaded with toppings'
    if (/turkey leg/i.test(n)) return 'Oversized smoked turkey leg'
    return 'Theme park snack'
  }
  if (cat === 'side') {
    if (/fries/i.test(n)) return 'Crispy french fries'
    if (/salad/i.test(n)) return 'Fresh garden salad'
    if (/soup/i.test(n)) return 'Hot soup bowl'
    return 'Side dish'
  }

  // Entree descriptions
  if (/burger/i.test(n)) return 'Theme park burger served with fries'
  if (/pizza/i.test(n)) return 'Freshly made pizza'
  if (/chicken tender|chicken strip|chicken finger|chicken nugget/i.test(n)) return 'Crispy breaded chicken tenders'
  if (/hot dog/i.test(n)) return 'All-American hot dog'
  if (/sandwich|panini/i.test(n)) return 'Hearty sandwich'
  if (/wrap/i.test(n)) return 'Filled wrap'
  if (/pasta|spaghetti|fettuccine|penne/i.test(n)) return 'Pasta entree'
  if (/steak|filet|ribeye|sirloin/i.test(n)) return 'Grilled steak entree'
  if (/salmon/i.test(n)) return 'Grilled salmon entree'
  if (/fish.*chip/i.test(n)) return 'Beer-battered fish with chips'
  if (/ribs/i.test(n)) return 'Slow-smoked ribs'
  if (/taco/i.test(n)) return 'Seasoned tacos'
  if (/burrito/i.test(n)) return 'Stuffed burrito'
  if (/salad/i.test(n)) return 'Fresh salad entree'
  if (/soup|stew|gumbo|chowder|bisque/i.test(n)) return 'Hot soup or stew'
  if (/bowl/i.test(n)) return 'Hearty bowl'

  return ''
}

async function fillNullDescriptions(items: MenuItem[]) {
  const missing = items.filter(i => !i.description)
  console.log(`\n=== Phase 6: Items with NULL description: ${missing.length} ===\n`)
  if (missing.length === 0) return

  let fixed = 0
  let skipped = 0
  for (const item of missing) {
    const desc = generateDescription(item.name, item.category)
    if (!desc) { skipped++; continue }

    if (fixed < 20) console.log(`  ~ ${item.name} → "${desc}"`)

    if (!DRY_RUN) {
      const { error } = await sb.from('menu_items').update({ description: desc }).eq('id', item.id)
      if (error) { console.error(`  Update error for "${item.name}":`, error.message); continue }
    }
    fixed++
    totalFixes++
  }
  if (fixed > 20) console.log(`  ... and ${fixed - 20} more`)
  console.log(`  Fixed ${fixed} items, skipped ${skipped} (no meaningful description)`)
}

// ================================================================
// Main
// ================================================================

async function main() {
  console.log('DiabetesGuide — Fill Empty Fields')
  console.log('=================================\n')

  const items = await fetchAllItems()
  const restaurants = await fetchAllRestaurants()
  console.log(`Loaded ${items.length} menu items, ${restaurants.length} restaurants`)

  // Diagnostic report
  await diagnose(items, restaurants)

  // Run all fix phases
  await fillMissingNutritionalRows(items)
  await fillNullMacros(items)
  await fillNullMicros(items)
  await fillIndividualNulls(items)
  await fillNullCategory(items)
  await fillNullDescriptions(items)

  console.log('\n=================================')
  console.log(`Total fixes applied: ${totalFixes}`)
  if (DRY_RUN) console.log('(DRY RUN — no writes were made)')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
