import { createClient } from '@supabase/supabase-js'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const supabase = createClient(url, key)

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
  category: string
  is_vegetarian: boolean
  is_fried: boolean
  description: string | null
  restaurant: { name: string; park: { name: string } }
  nutritional_data: NutRow[]
}

let fixCount = 0
let issueCount = 0

async function fetchAllItems(): Promise<MenuItem[]> {
  const items: MenuItem[] = []
  let from = 0
  const pageSize = 500
  while (true) {
    const { data, error } = await supabase
      .from('menu_items')
      .select('id, name, category, is_vegetarian, is_fried, description, restaurant:restaurants(name, park:parks(name)), nutritional_data(*)')
      .range(from, from + pageSize - 1)
    if (error) { console.error('Fetch error:', error); break }
    if (!data || data.length === 0) break
    items.push(...(data as unknown as MenuItem[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  console.log(`Fetched ${items.length} menu items\n`)
  return items
}

function getNut(item: MenuItem): NutRow | null {
  const nd = item.nutritional_data
  if (Array.isArray(nd) && nd.length > 0) return nd[0]
  return null
}

function restLabel(item: MenuItem): string {
  const r = item.restaurant as any
  const rName = r?.name || 'Unknown'
  const pName = r?.park?.name || 'Unknown'
  return `${rName} (${pName})`
}

// ============================================================
// FIX 1: Sugar > Carbs (impossible — sugar is a subset of carbs)
// Strategy: If sugar > carbs, the sugar was likely applied as a
// portion multiplier to the wrong base. Recalculate sugar as a
// reasonable fraction of carbs based on item type.
// ============================================================
async function fixSugarGreaterThanCarbs(items: MenuItem[]) {
  console.log('=== Fix 1: Sugar > Carbs ===')
  for (const item of items) {
    const nut = getNut(item)
    if (!nut || nut.sugar == null || nut.carbs == null) continue
    if (nut.sugar <= nut.carbs) continue

    issueCount++
    const name = item.name
    const loc = restLabel(item)

    // Estimate reasonable sugar based on item type
    let sugarRatio = 0.3 // default: 30% of carbs
    const n = name.toLowerCase()
    const desc = (item.description || '').toLowerCase()
    if (/ice cream|sundae|milkshake|float|smoothie|dole whip/.test(n)) sugarRatio = 0.6
    else if (/cake|cupcake|cookie|brownie|churro|donut|doughnut|pastry|tart|candy|fudge/.test(n)) sugarRatio = 0.55
    else if (/butterbeer|lemonade|slush|frozen|punch/.test(n)) sugarRatio = 0.7
    else if (/coffee|latte|cold brew|mocha|cappuccino/.test(n)) sugarRatio = 0.5
    else if (/soup|stew|bisque/.test(n + desc)) sugarRatio = 0.15
    else if (/burger|sandwich|wrap|pretzel|pizza/.test(n)) sugarRatio = 0.1
    else if (/brisket|ribs|chicken|pork|beef|steak|fish/.test(n)) sugarRatio = 0.05
    else if (/beer|wine/.test(n)) sugarRatio = 0.1

    const newSugar = Math.round(nut.carbs * sugarRatio)
    console.log(`  FIX: ${name} @ ${loc} — sugar ${nut.sugar}g > carbs ${nut.carbs}g → sugar=${newSugar}g`)

    const { error } = await supabase
      .from('nutritional_data')
      .update({ sugar: newSugar, confidence_score: Math.min(nut.confidence_score ?? 50, 50) })
      .eq('id', nut.id)
    if (error) console.error('    Update error:', error)
    else fixCount++
  }
  console.log()
}

// ============================================================
// FIX 2: Suspiciously low carbs for items that should have more
// Strategy: Recalculate carbs from calories using macro math.
// calories ≈ carbs*4 + fat*9 + protein*4
// So carbs ≈ (calories - fat*9 - protein*4) / 4
// ============================================================
async function fixLowCarbs(items: MenuItem[]) {
  console.log('=== Fix 2: Suspiciously Low Carbs ===')
  for (const item of items) {
    const nut = getNut(item)
    if (!nut || nut.calories == null || nut.carbs == null) continue
    if (nut.calories < 200) continue // skip small items

    const n = item.name.toLowerCase()
    const desc = (item.description || '').toLowerCase()

    // Items that should have significant carbs
    const shouldHaveCarbs =
      /pizza|burger|sandwich|wrap|pretzel|pasta|rice|bread|bun|pita|tortilla|fries|potato|corn dog|quesadilla|taco|burrito|kebab|gyro/.test(n + ' ' + desc)

    if (!shouldHaveCarbs) continue

    // Flag if carbs < 15g and calories > 300
    if (nut.carbs >= 15 || nut.calories <= 300) continue

    issueCount++
    const loc = restLabel(item)
    const fat = nut.fat ?? 20
    const protein = nut.protein ?? 20
    // Estimate carbs from remaining calories
    const carbCals = nut.calories - (fat * 9) - (protein * 4)
    let newCarbs = Math.max(Math.round(carbCals / 4), 20) // minimum 20g for starchy items

    // Sanity cap
    if (newCarbs > 200) newCarbs = Math.round(nut.calories * 0.4 / 4) // ~40% of cal from carbs

    const update: any = { carbs: newCarbs, confidence_score: Math.min(nut.confidence_score ?? 50, 45) }

    // Also fix sugar if it was > new carbs
    if (nut.sugar != null && nut.sugar > newCarbs) {
      update.sugar = Math.round(newCarbs * 0.1) // savory items: ~10% sugar
    }

    console.log(`  FIX: ${item.name} @ ${loc} — carbs ${nut.carbs}g → ${newCarbs}g (cal=${nut.calories})`)

    const { error } = await supabase
      .from('nutritional_data')
      .update(update)
      .eq('id', nut.id)
    if (error) console.error('    Update error:', error)
    else fixCount++
  }
  console.log()
}

// ============================================================
// FIX 3: Extreme sodium values (>5500mg except turkey leg)
// Strategy: Likely multiplied incorrectly. Divide by 10 if > 10000,
// or cap at reasonable value.
// ============================================================
async function fixExtremeSodium(items: MenuItem[]) {
  console.log('=== Fix 3: Extreme Sodium ===')
  for (const item of items) {
    const nut = getNut(item)
    if (!nut || nut.sodium == null) continue

    const n = item.name.toLowerCase()
    // Turkey leg is legitimately very high sodium (~5200mg)
    if (/turkey leg/.test(n)) continue

    if (nut.sodium <= 5500) continue

    issueCount++
    const loc = restLabel(item)

    // Likely a 10x error from portion multiplier stacking or bad USDA match
    let newSodium: number
    if (nut.sodium > 10000) {
      newSodium = Math.round(nut.sodium / 10)
    } else {
      newSodium = Math.round(nut.sodium / 3) // bring into reasonable range
    }

    // Ensure still reasonable (200-3000 for most items)
    if (newSodium > 3500) newSodium = Math.round(nut.calories * 1.2) // ~1.2mg per cal is typical

    console.log(`  FIX: ${item.name} @ ${loc} — sodium ${nut.sodium}mg → ${newSodium}mg`)

    const { error } = await supabase
      .from('nutritional_data')
      .update({ sodium: newSodium, confidence_score: Math.min(nut.confidence_score ?? 50, 40) })
      .eq('id', nut.id)
    if (error) console.error('    Update error:', error)
    else fixCount++
  }
  console.log()
}

// ============================================================
// FIX 4: Wrong category — "Crispy" savory items marked as dessert
// The inferCategory regex matches "crisp" in "Crispy" → dessert
// ============================================================
async function fixWrongCategory(items: MenuItem[]) {
  console.log('=== Fix 4: Wrong Category ===')
  for (const item of items) {
    if (item.category !== 'dessert') continue

    const n = item.name.toLowerCase()
    // Savory items with "crispy" that got caught by the "crisp" regex
    const isSavory = /crispy.*(chicken|buffalo|onion|wonton|shrimp|fish|pork|bacon|sandwich|wing|tender|finger|salad|ring)/.test(n) ||
      /chicken|burger|sandwich|wing|tender|finger|salad|shrimp|pork|fish/.test(n) && /crispy/.test(n)

    if (!isSavory) continue

    issueCount++
    const loc = restLabel(item)
    const newCat = 'entree'

    console.log(`  FIX: ${item.name} @ ${loc} — category dessert → ${newCat}`)

    const { error } = await supabase
      .from('menu_items')
      .update({ category: newCat })
      .eq('id', item.id)
    if (error) console.error('    Update error:', error)
    else fixCount++
  }
  console.log()
}

// ============================================================
// FIX 5: Meat/seafood items marked vegetarian
// ============================================================
async function fixWrongVegetarian(items: MenuItem[]) {
  console.log('=== Fix 5: Meat Items Marked Vegetarian ===')
  const meatWords = /chicken|beef|pork|bacon|brisket|turkey|ham|sausage|lamb|steak|ribs|shrimp|crab|lobster|fish|salmon|tuna|meatball|hot dog|corn dog|prosciutto|pepperoni|chorizo|duck|veal|venison|pulled|smoked meat|carnitas/

  for (const item of items) {
    if (!item.is_vegetarian) continue

    const n = item.name.toLowerCase()
    const desc = (item.description || '').toLowerCase()

    if (!meatWords.test(n) && !meatWords.test(desc)) continue

    // Exclude false positives like "beyond meat", "plant-based", "impossible"
    if (/beyond|impossible|plant.based|vegan|meatless|faux/.test(n + ' ' + desc)) continue

    issueCount++
    const loc = restLabel(item)
    console.log(`  FIX: ${item.name} @ ${loc} — vegetarian=true → false`)

    const { error } = await supabase
      .from('menu_items')
      .update({ is_vegetarian: false })
      .eq('id', item.id)
    if (error) console.error('    Update error:', error)
    else fixCount++
  }
  console.log()
}

// ============================================================
// FIX 6: Calorie vs macro math wildly off
// If calories < (carbs*4 + fat*9 + protein*4) * 0.3, calories are
// way too low. Recalculate.
// Also catch items with impossible protein (black coffee with 21g protein)
// ============================================================
async function fixCalorieMacroMismatch(items: MenuItem[]) {
  console.log('=== Fix 6: Calorie vs Macro Mismatch ===')
  for (const item of items) {
    const nut = getNut(item)
    if (!nut) continue

    const carbs = nut.carbs ?? 0
    const fat = nut.fat ?? 0
    const protein = nut.protein ?? 0
    const cal = nut.calories ?? 0

    const estimatedCal = carbs * 4 + fat * 9 + protein * 4

    // Skip items with minimal data
    if (estimatedCal < 50 && cal < 50) continue

    const n = item.name.toLowerCase()
    const desc = (item.description || '').toLowerCase()
    const loc = restLabel(item)

    // Case A: Calories way too low for the macros
    if (cal > 0 && estimatedCal > 0 && cal < estimatedCal * 0.2) {
      issueCount++
      const newCal = Math.round(estimatedCal)
      console.log(`  FIX: ${item.name} @ ${loc} — cal ${cal} too low for macros (est=${newCal}) → ${newCal}`)

      const { error } = await supabase
        .from('nutritional_data')
        .update({ calories: newCal, confidence_score: Math.min(nut.confidence_score ?? 50, 40) })
        .eq('id', nut.id)
      if (error) console.error('    Update error:', error)
      else fixCount++
      continue
    }

    // Case B: Black coffee / plain coffee with impossible macros
    if (/^(brewed )?coffee|^pike place/.test(n) && !/latte|mocha|frappuccino|cream|sugar|syrup/.test(n + ' ' + desc)) {
      if (protein > 5 || carbs > 5 || fat > 2) {
        issueCount++
        console.log(`  FIX: ${item.name} @ ${loc} — plain coffee with protein=${protein}g, carbs=${carbs}g, fat=${fat}g → zeroed`)

        const { error } = await supabase
          .from('nutritional_data')
          .update({ calories: 5, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, confidence_score: 80 })
          .eq('id', nut.id)
        if (error) console.error('    Update error:', error)
        else fixCount++
        continue
      }
    }

    // Case C: Very low protein for meat-heavy items
    if (/chicken dinner|half chicken|whole chicken/.test(n) && protein < 15 && cal > 400) {
      issueCount++
      const newProtein = Math.round(cal * 0.25 / 4) // ~25% cal from protein
      console.log(`  FIX: ${item.name} @ ${loc} — protein ${protein}g too low for chicken → ${newProtein}g`)

      const { error } = await supabase
        .from('nutritional_data')
        .update({ protein: newProtein, confidence_score: Math.min(nut.confidence_score ?? 50, 40) })
        .eq('id', nut.id)
      if (error) console.error('    Update error:', error)
      else fixCount++
      continue
    }

    // Case D: Bouillabaisse / seafood stew with very low protein
    if (/bouillabaisse|seafood stew|seafood gumbo/.test(n) && protein < 10 && cal > 400) {
      issueCount++
      const newProtein = Math.round(cal * 0.2 / 4) // ~20% cal from protein
      console.log(`  FIX: ${item.name} @ ${loc} — protein ${protein}g too low for seafood → ${newProtein}g`)

      const { error } = await supabase
        .from('nutritional_data')
        .update({ protein: newProtein, confidence_score: Math.min(nut.confidence_score ?? 50, 40) })
        .eq('id', nut.id)
      if (error) console.error('    Update error:', error)
      else fixCount++
      continue
    }

    // Case E: 0g fat for a fried/cooked meat dish
    if (fat === 0 && cal > 400 && /chicken|pork|beef|fried/.test(n + ' ' + desc)) {
      issueCount++
      const newFat = Math.round((cal - carbs * 4 - protein * 4) / 9)
      const safeFat = Math.max(newFat, Math.round(cal * 0.3 / 9))
      console.log(`  FIX: ${item.name} @ ${loc} — fat 0g for cooked meat dish → ${safeFat}g`)

      const { error } = await supabase
        .from('nutritional_data')
        .update({ fat: safeFat, confidence_score: Math.min(nut.confidence_score ?? 50, 40) })
        .eq('id', nut.id)
      if (error) console.error('    Update error:', error)
      else fixCount++
    }
  }
  console.log()
}

// ============================================================
// FIX 7: Extreme/impossible values
// Carbs > 250g, calories > 3500, fiber > 50g, sugar = carbs for
// savory items, etc.
// ============================================================
async function fixExtremeValues(items: MenuItem[]) {
  console.log('=== Fix 7: Extreme/Impossible Values ===')
  for (const item of items) {
    const nut = getNut(item)
    if (!nut) continue

    const n = item.name.toLowerCase()
    const loc = restLabel(item)
    const updates: any = {}
    let reason = ''

    // Extreme carbs (> 250g) — likely double-multiplied or bad data
    if (nut.carbs != null && nut.carbs > 250) {
      // Scale down to reasonable range based on calories
      const cal = nut.calories ?? 800
      const reasonableCarbs = Math.round(cal * 0.45 / 4) // ~45% of cal from carbs
      updates.carbs = reasonableCarbs
      reason += `carbs ${nut.carbs}g→${reasonableCarbs}g `

      // Also fix sugar if it was based on old carbs
      if (nut.sugar != null && nut.sugar > reasonableCarbs) {
        const sugarRatio = /cake|cookie|cupcake|brownie|donut|doughnut|candy|sundae/.test(n) ? 0.55 : 0.2
        updates.sugar = Math.round(reasonableCarbs * sugarRatio)
        reason += `sugar ${nut.sugar}g→${updates.sugar}g `
      }
    }

    // Extreme calories (> 3500) — likely double-multiplied
    if (nut.calories != null && nut.calories > 3500) {
      const newCal = Math.round(nut.calories / 2)
      updates.calories = newCal
      reason += `cal ${nut.calories}→${newCal} `

      // Scale macros proportionally
      if (nut.carbs != null) updates.carbs = updates.carbs ?? Math.round(nut.carbs / 2)
      if (nut.fat != null) updates.fat = Math.round(nut.fat / 2)
      if (nut.protein != null) updates.protein = Math.round(nut.protein / 2)
      if (nut.sugar != null) updates.sugar = updates.sugar ?? Math.round(nut.sugar / 2)
      if (nut.sodium != null) updates.sodium = Math.round(nut.sodium / 2)
      if (nut.fiber != null) updates.fiber = Math.round(nut.fiber / 2)
    }

    // Extreme fiber (> 50g) — almost certainly wrong
    if (nut.fiber != null && nut.fiber > 50) {
      const newFiber = Math.round((nut.calories ?? 500) * 0.01) // ~1g fiber per 100 cal
      updates.fiber = Math.min(newFiber, 15)
      reason += `fiber ${nut.fiber}g→${updates.fiber}g `
    }

    // Sugar = carbs for savory items (100% sugar in burger/sandwich/etc is wrong)
    if (nut.sugar != null && nut.carbs != null && nut.sugar === nut.carbs && nut.carbs > 30) {
      const isSavory = /burger|sandwich|wrap|pretzel|pizza|chicken|beef|pork|fish|steak|ribs|nachos|taco|burrito|fries|potato/.test(n)
      if (isSavory) {
        const newSugar = Math.round(nut.carbs * 0.1) // 10% sugar for savory
        updates.sugar = newSugar
        reason += `sugar=carbs(${nut.sugar}g) savory→${newSugar}g `
      }
    }

    if (Object.keys(updates).length > 0) {
      issueCount++
      updates.confidence_score = Math.min(nut.confidence_score ?? 50, 40)
      console.log(`  FIX: ${item.name} @ ${loc} — ${reason.trim()}`)

      const { error } = await supabase
        .from('nutritional_data')
        .update(updates)
        .eq('id', nut.id)
      if (error) console.error('    Update error:', error)
      else fixCount++
    }
  }
  console.log()
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('DiabetesGuide Data Anomaly Fixer')
  console.log('================================\n')

  const items = await fetchAllItems()

  await fixSugarGreaterThanCarbs(items)
  await fixLowCarbs(items)
  await fixExtremeSodium(items)
  await fixWrongCategory(items)
  await fixWrongVegetarian(items)
  await fixCalorieMacroMismatch(items)
  await fixExtremeValues(items)

  console.log('================================')
  console.log(`Total issues found: ${issueCount}`)
  console.log(`Total fixes applied: ${fixCount}`)
}

main().catch(console.error)
