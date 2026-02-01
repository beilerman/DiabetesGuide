import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const sb = createClient(url, key)

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

interface Item {
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

async function fetchAll(): Promise<Item[]> {
  const all: Item[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from('menu_items')
      .select('id, name, category, is_vegetarian, is_fried, description, restaurant:restaurants(name, park:parks(name)), nutritional_data(*)')
      .range(from, from + 499)
    if (error) { console.error(error); break }
    if (!data || data.length === 0) break
    all.push(...(data as unknown as Item[]))
    if (data.length < 500) break
    from += 500
  }
  return all
}

function nd(item: Item): NutRow | null {
  return item.nutritional_data?.[0] ?? null
}

function loc(item: Item): string {
  const r = item.restaurant as any
  return `${r?.name ?? '?'} (${r?.park?.name ?? '?'})`
}

async function update(nutId: string, updates: Record<string, any>) {
  updates.confidence_score = Math.min(updates.confidence_score ?? 45, 45)
  const { error } = await sb.from('nutritional_data').update(updates).eq('id', nutId)
  if (error) console.error('  Update error:', error)
  else fixCount++
}

// ============================================================
// FIX A: Over-multiplied items — the core systemic issue
//
// The adjust-portions.ts script applied 1.5x-2.5x multipliers to
// ALL items, but many USDA matches were already returning values
// for full-size portions. The multiplier was intended for USDA
// "standard serving" sizes (e.g., 100g reference amounts), not
// already-scaled portions.
//
// Strategy: For items flagged as way above plausible ranges,
// divide ALL macros by the likely excess multiplier to bring
// them back into range.
// ============================================================
async function fixOverMultiplied(items: Item[]) {
  console.log('=== Fix A: Over-Multiplied Items ===\n')

  // Expected calorie ranges by food type pattern
  const ranges: Array<{ pattern: RegExp; maxCal: number; label: string; minCal?: number }> = [
    // Single items
    { pattern: /^(?!.*platter)(?!.*combo).*burger/i, maxCal: 1200, label: 'burger' },
    { pattern: /sandwich|panini|sub(?!way)/i, maxCal: 1000, label: 'sandwich' },
    { pattern: /wrap(?!.*sampler)/i, maxCal: 850, label: 'wrap' },
    { pattern: /pizza.*individual|pizza.*personal|cheese pizza|pepperoni pizza/i, maxCal: 1000, label: 'personal pizza' },
    { pattern: /hot dog(?!.*platter)/i, maxCal: 800, label: 'hot dog' },
    { pattern: /corn dog/i, maxCal: 700, label: 'corn dog' },
    { pattern: /chicken strip|chicken tender|chicken finger|chicken nugget/i, maxCal: 900, label: 'chicken tenders' },
    { pattern: /^churro/i, maxCal: 450, label: 'churro' },
    { pattern: /mini churro/i, maxCal: 500, label: 'mini churros' },
    { pattern: /cupcake/i, maxCal: 700, label: 'cupcake' },
    { pattern: /brownie(?!.*sundae)/i, maxCal: 600, label: 'brownie' },
    { pattern: /brownie sundae/i, maxCal: 900, label: 'brownie sundae' },
    { pattern: /^cookie(?!.*sandwich)|cookie$/i, maxCal: 800, label: 'cookie' },
    { pattern: /ice cream cookie sandwich/i, maxCal: 700, label: 'ice cream sandwich' },
    { pattern: /funnel cake/i, maxCal: 1000, label: 'funnel cake' },
    { pattern: /pretzel(?!.*dog)(?!.*kitchen)/i, maxCal: 600, label: 'pretzel' },
    { pattern: /mac.*cheese|mac n cheese/i, maxCal: 800, label: 'mac & cheese' },
    { pattern: /nachos|totchos/i, maxCal: 1100, label: 'nachos' },
    { pattern: /ribs(?!.*eye)/i, maxCal: 1200, label: 'ribs' },
    { pattern: /filet mignon|ribeye|rib.eye|prime rib|sirloin/i, maxCal: 1100, label: 'steak' },
    { pattern: /salmon|sea bass|fish(?!.*chip)(?!.*finger)/i, maxCal: 800, label: 'fish entree' },
    { pattern: /fish.*chip/i, maxCal: 1100, label: 'fish & chips' },
    { pattern: /milkshake|shake/i, maxCal: 1000, label: 'milkshake' },
    { pattern: /sundae(?!.*brownie)/i, maxCal: 1000, label: 'sundae' },
    { pattern: /dole whip|soft.serve/i, maxCal: 400, label: 'frozen treat' },
    { pattern: /doughnut|donut/i, maxCal: 550, label: 'doughnut' },
  ]

  for (const item of items) {
    const n = nd(item)
    if (!n || !n.calories) continue

    for (const r of ranges) {
      if (!r.pattern.test(item.name)) continue

      const cal = n.calories
      if (cal <= r.maxCal * 1.15) break // within acceptable range (+15% tolerance)

      // Calculate the divisor needed to bring into range
      const targetCal = Math.round(r.maxCal * 0.85) // aim for 85% of max for safety
      const divisor = cal / targetCal

      // Only fix if divisor > 1.4 (clearly over-multiplied)
      if (divisor < 1.4) break

      const updates: Record<string, any> = {
        calories: targetCal,
        confidence_score: 40,
      }
      if (n.carbs) updates.carbs = Math.round(n.carbs / divisor)
      if (n.fat) updates.fat = Math.round(n.fat / divisor)
      if (n.protein) updates.protein = Math.round(n.protein / divisor)
      if (n.sugar) updates.sugar = Math.round(n.sugar / divisor)
      if (n.fiber) updates.fiber = Math.round(n.fiber / divisor)
      if (n.sodium) updates.sodium = Math.round(n.sodium / divisor)
      if (n.cholesterol) updates.cholesterol = Math.round(n.cholesterol / divisor)

      console.log(`  ${item.name} @ ${loc(item)} — ${r.label}: ${cal} cal ÷ ${divisor.toFixed(1)} → ${targetCal} cal`)
      await update(n.id, updates)
      break
    }
  }
}

// ============================================================
// FIX B: Fiber > Carbs (impossible)
// ============================================================
async function fixFiberGtCarbs(items: Item[]) {
  console.log('\n=== Fix B: Fiber > Carbs ===\n')
  for (const item of items) {
    const n = nd(item)
    if (!n || !n.fiber || !n.carbs) continue
    if (n.fiber <= n.carbs) continue

    // Fiber should be a small fraction of carbs
    const newFiber = Math.round(n.carbs * 0.1)
    console.log(`  ${item.name} @ ${loc(item)} — fiber ${n.fiber}g > carbs ${n.carbs}g → fiber=${newFiber}g`)
    await update(n.id, { fiber: newFiber })
  }
}

// ============================================================
// FIX C: Alcoholic drinks caloric math
// The macro formula P*4+C*4+F*9 doesn't include alcohol (7 cal/g).
// These items are flagged but actually correct — the "missing"
// calories come from alcohol. We should add a note but not change
// values. However, some drinks have 0 fat listed when they should
// have cream/dairy fat — fix those.
// ============================================================
async function fixAlcoholDrinks(items: Item[]) {
  console.log('\n=== Fix C: Alcohol Drink Adjustments ===\n')
  // Nothing to fix for most — the caloric math gap IS the alcohol.
  // But flag items where the gap is too large even for alcohol.
  for (const item of items) {
    const n = nd(item)
    if (!n || !n.calories) continue
    const nameLower = item.name.toLowerCase()
    const desc = (item.description || '').toLowerCase()

    // Only process likely alcoholic items
    if (!/beer|ale|lager|wine|margarita|cocktail|mojito|sangria|rum|vodka|whiskey|bourbon|tequila|martini|daiquiri|punch|slinger|libation|iced tea|grog|falls|ghost|icefall|juice.*bar|outer rim|jet juice/i.test(nameLower + ' ' + desc)) continue

    const macroCal = (n.carbs ?? 0) * 4 + (n.fat ?? 0) * 9 + (n.protein ?? 0) * 4
    const gap = n.calories - macroCal

    // Alcohol: ~14g per standard drink = ~100 cal. Theme park drinks 1-3 shots.
    // Reasonable alcohol cal: 100-400
    if (gap > 500) {
      // Too big even for alcohol — likely over-multiplied
      const reasonableCal = macroCal + 200 // 2 shots worth
      console.log(`  ${item.name} @ ${loc(item)} — gap ${gap} cal too large for alcohol, reducing ${n.calories} → ${reasonableCal}`)
      await update(n.id, { calories: reasonableCal })
    }
  }
}

// ============================================================
// FIX D: Suspiciously low values (under-enriched)
// Items that are clearly too low for what they are
// ============================================================
async function fixUnderValues(items: Item[]) {
  console.log('\n=== Fix D: Suspiciously Low Values ===\n')
  for (const item of items) {
    const n = nd(item)
    if (!n || !n.calories) continue
    const name = item.name.toLowerCase()
    const cal = n.calories

    // Garden Burger at 104 cal — way too low
    if (/garden burger/i.test(item.name) && cal < 200) {
      console.log(`  ${item.name} @ ${loc(item)} — ${cal} cal too low for veggie burger → 450`)
      await update(n.id, { calories: 450, carbs: 40, fat: 18, protein: 20, sodium: 650 })
      continue
    }

    // Caesar Salad at 151 cal — too low for theme park portion with dressing
    if (/caesar salad/i.test(item.name) && cal < 200 && !/side/.test(name)) {
      console.log(`  ${item.name} @ ${loc(item)} — ${cal} cal too low for caesar → 450`)
      await update(n.id, { calories: 450, carbs: 20, fat: 30, protein: 25, sodium: 1100 })
      continue
    }

    // Pretzel Dog at 73 cal — clearly missing data
    if (/pretzel dog/i.test(item.name) && cal < 200) {
      console.log(`  ${item.name} @ ${loc(item)} — ${cal} cal too low for pretzel dog → 550`)
      await update(n.id, { calories: 550, carbs: 55, fat: 25, protein: 18, sodium: 1200 })
      continue
    }

    // Draft Beer Flight at 43 cal — flight is 4 small pours ≈ 2 full beers
    if (/beer flight/i.test(item.name) && cal < 100) {
      console.log(`  ${item.name} @ ${loc(item)} — ${cal} cal too low for beer flight → 400`)
      await update(n.id, { calories: 400, carbs: 36, fat: 0, protein: 4, sodium: 30 })
      continue
    }

    // Chicken Tender Salad at 158 cal — way too low
    if (/chicken tender.*salad|crispy chicken.*salad/i.test(item.name) && cal < 250) {
      console.log(`  ${item.name} @ ${loc(item)} — ${cal} cal too low for chicken tender salad → 550`)
      await update(n.id, { calories: 550, carbs: 30, fat: 28, protein: 35, sodium: 1200 })
      continue
    }
  }
}

// ============================================================
// FIX E: Low-protein meat items
// Many meat entrees show <10g protein — clearly wrong USDA match
// ============================================================
async function fixLowProtein(items: Item[]) {
  console.log('\n=== Fix E: Low Protein Meat Items ===\n')
  const meatPattern = /burger|steak|chicken|pork|beef|turkey|ribs|brisket|salmon|fish|shrimp|lobster|crab/i

  for (const item of items) {
    const n = nd(item)
    if (!n || !n.calories || !n.protein) continue
    if (n.calories < 300) continue
    if (!meatPattern.test(item.name)) continue
    if (n.protein >= 15) continue

    // Estimate protein: meat dishes should be 15-30% of cal from protein
    const targetProtein = Math.round(n.calories * 0.2 / 4) // 20% of cal from protein
    const safeProtein = Math.max(targetProtein, 20) // minimum 20g for a meat dish

    console.log(`  ${item.name} @ ${loc(item)} — protein ${n.protein}g too low for meat dish → ${safeProtein}g`)
    await update(n.id, { protein: safeProtein })
  }
}

// ============================================================
// FIX F: Items with all 0/null for sugar/protein/fiber/sodium
// from the "Walt Disney World Parks" group (100% missing)
// Re-estimate these from calories and food type
// ============================================================
async function fixMissingMicros(items: Item[]) {
  console.log('\n=== Fix F: Missing Micronutrient Data ===\n')
  let count = 0
  for (const item of items) {
    const n = nd(item)
    if (!n || !n.calories) continue
    // Only fix if sugar AND protein AND sodium are all null/0
    if ((n.sugar ?? 0) > 0 || (n.protein ?? 0) > 0 || (n.sodium ?? 0) > 0) continue

    const cal = n.calories
    const name = item.name.toLowerCase()
    const updates: Record<string, any> = { confidence_score: 30 }

    // Estimate based on food type
    if (/cake|cookie|cupcake|brownie|churro|donut|doughnut|tart|pastry|candy|fudge|sundae|ice cream/i.test(name)) {
      updates.sugar = Math.round(cal * 0.3 / 4) // ~30% cal from sugar
      updates.protein = Math.round(cal * 0.05 / 4) // ~5% protein
      updates.sodium = Math.round(cal * 0.4) // ~0.4mg per cal for sweets
      updates.fiber = Math.round(cal * 0.005) // minimal fiber
    } else if (/coffee|latte|cold brew|mocha/i.test(name)) {
      updates.sugar = Math.round(cal * 0.5 / 4) // sugary coffee drinks
      updates.protein = Math.round(cal * 0.1 / 4)
      updates.sodium = Math.round(cal * 0.3)
      updates.fiber = 0
    } else if (/popcorn|pretzel|chip/i.test(name)) {
      updates.sugar = Math.round(cal * 0.05 / 4)
      updates.protein = Math.round(cal * 0.08 / 4)
      updates.sodium = Math.round(cal * 1.5) // salty snacks
      updates.fiber = Math.round(cal * 0.01)
    } else {
      // Default savory item
      updates.sugar = Math.round(cal * 0.05 / 4)
      updates.protein = Math.round(cal * 0.15 / 4)
      updates.sodium = Math.round(cal * 1.0)
      updates.fiber = Math.round(cal * 0.008)
    }

    count++
    if (count <= 20) console.log(`  ${item.name} — estimated sugar=${updates.sugar}g, protein=${updates.protein}g, sodium=${updates.sodium}mg`)
    await update(n.id, updates)
  }
  if (count > 20) console.log(`  ... and ${count - 20} more items`)
  console.log(`  Total: ${count} items with missing micros estimated`)
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('DiabetesGuide Audit Fix Script')
  console.log('==============================\n')

  const items = await fetchAll()
  console.log(`Loaded ${items.length} items\n`)

  await fixOverMultiplied(items)
  await fixFiberGtCarbs(items)
  await fixAlcoholDrinks(items)
  await fixUnderValues(items)
  await fixLowProtein(items)
  await fixMissingMicros(items)

  console.log('\n==============================')
  console.log(`Total fixes applied: ${fixCount}`)
}

main().catch(console.error)
