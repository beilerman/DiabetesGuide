/**
 * fix-nutrition-audit-v2.ts — Comprehensive Nutrition Data Quality Fix
 *
 * Addresses issues found in the Feb 2026 full audit:
 *
 * Phase 1: Critical specific fixes (clearly wrong individual values)
 * Phase 2: Category corrections (miscategorized items)
 * Phase 3: Extreme value corrections (over-multiplied, capped by food type)
 * Phase 4: Missing data estimation (desserts with 0 sugar, food items with 0 macros)
 * Phase 5: Impossible value corrections (sugar > carbs, extreme sodium)
 *
 * Run: npx tsx scripts/fix-nutrition-audit-v2.ts
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const sb = createClient(url, key)

let fixCount = 0
let dryRun = process.argv.includes('--dry-run')
const fixedNutIds = new Set<string>() // track to prevent double-fixing
const fixedItemIds = new Set<string>()

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
  description: string | null
  restaurant: { name: string; park: { name: string } }
  nutritional_data: NutRow[]
}

async function fetchAll(): Promise<Item[]> {
  const all: Item[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from('menu_items')
      .select('id, name, category, description, restaurant:restaurants(name, park:parks(name)), nutritional_data(*)')
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
  return `${r?.name ?? '?'} @ ${r?.park?.name ?? '?'}`
}

async function updateNut(nutId: string, updates: Record<string, any>, label: string) {
  fixedNutIds.add(nutId)
  if (dryRun) {
    fixCount++
    return
  }
  const { error } = await sb.from('nutritional_data').update(updates).eq('id', nutId)
  if (error) console.error(`  ERROR updating ${label}:`, error.message)
  else fixCount++
}

async function updateItem(itemId: string, updates: Record<string, any>, label: string) {
  fixedItemIds.add(itemId)
  if (dryRun) {
    fixCount++
    return
  }
  const { error } = await sb.from('menu_items').update(updates).eq('id', itemId)
  if (error) console.error(`  ERROR updating item ${label}:`, error.message)
  else fixCount++
}

// ================================================================
// PHASE 1: Critical specific fixes
// ================================================================
async function phase1_criticalFixes(items: Item[]) {
  console.log('\n' + '='.repeat(60))
  console.log('PHASE 1: Critical Specific Fixes')
  console.log('='.repeat(60))
  let count = 0

  for (const item of items) {
    const n = nd(item)
    if (!n) continue
    const name = item.name

    // Starbucks Drip Coffee at 841 cal with 92g fat — clearly wrong USDA match
    if (/^Starbucks.*Drip Coffee/i.test(name) && n.calories && n.calories > 100) {
      console.log(`  FIX: "${name}" at ${loc(item)} — ${n.calories} cal, ${n.fat}g fat → 5 cal (black coffee)`)
      await updateNut(n.id, { calories: 5, carbs: 0, fat: 0, protein: 0, sugar: 0, sodium: 5, fiber: 0, cholesterol: 0, confidence_score: 85 }, name)
      count++
      continue
    }

    // Caramel Macchiato Grande at 1434 cal — real is ~250 cal
    if (/Caramel Macchiato.*Grande/i.test(name) && n.calories && n.calories > 500) {
      console.log(`  FIX: "${name}" at ${loc(item)} — ${n.calories} cal → 250 cal`)
      await updateNut(n.id, { calories: 250, carbs: 34, fat: 7, protein: 10, sugar: 33, sodium: 150, fiber: 0, cholesterol: 0, confidence_score: 80 }, name)
      count++
      continue
    }

    // Baked Brie en Croute at 440,000mg sodium — off by ~1000x
    if (/Baked Brie en Croute/i.test(name) && n.sodium && n.sodium > 10000) {
      console.log(`  FIX: "${name}" at ${loc(item)} — ${n.sodium}mg sodium → 440mg`)
      await updateNut(n.id, { sodium: 440, confidence_score: 45 }, name)
      count++
      continue
    }

    // Warsteiner Dunkel at 48,800mg sodium — off by ~100x
    if (/Warsteiner/i.test(name) && n.sodium && n.sodium > 5000) {
      console.log(`  FIX: "${name}" at ${loc(item)} — ${n.sodium}mg sodium → 14mg (beer)`)
      await updateNut(n.id, { sodium: 14, confidence_score: 45 }, name)
      count++
      continue
    }

    // "Juice" items at 29,600mg sodium — off by ~100x (should be ~10mg)
    if (/^Juice\s*$/i.test(name.trim()) && n.sodium && n.sodium > 5000) {
      console.log(`  FIX: "${name}" at ${loc(item)} — ${n.sodium}mg sodium → 10mg`)
      await updateNut(n.id, { sodium: 10, confidence_score: 45 }, name)
      count++
      continue
    }

    // Isla Nublar IPA at 10,800mg sodium
    if (/Isla Nublar IPA/i.test(name) && n.sodium && n.sodium > 5000) {
      console.log(`  FIX: "${name}" at ${loc(item)} — ${n.sodium}mg sodium → 14mg (beer)`)
      await updateNut(n.id, { sodium: 14, calories: 200, carbs: 15, fat: 0, protein: 2, confidence_score: 45 }, name)
      count++
      continue
    }

    // Strawberry Margarita at 10,800mg sodium
    if (/Strawberry Margarita/i.test(name) && n.sodium && n.sodium > 5000) {
      console.log(`  FIX: "${name}" at ${loc(item)} — ${n.sodium}mg sodium → 10mg`)
      await updateNut(n.id, { sodium: 10, calories: 275, carbs: 36, fat: 0, protein: 0, sugar: 30, confidence_score: 45 }, name)
      count++
      continue
    }

    // **The Boss at 14,600mg sodium
    if (name.includes('The Boss') && n.sodium && n.sodium > 5000) {
      console.log(`  FIX: "${name}" at ${loc(item)} — ${n.sodium}mg sodium → 1460mg`)
      await updateNut(n.id, { sodium: 1460, confidence_score: 45 }, name)
      count++
      continue
    }

    // Barbacoa Tacos at 10,300mg sodium — off by ~5x
    if (/Barbacoa Taco/i.test(name) && n.sodium && n.sodium > 5000) {
      console.log(`  FIX: "${name}" at ${loc(item)} — ${n.sodium}mg sodium → 1030mg`)
      await updateNut(n.id, { sodium: 1030, confidence_score: 45 }, name)
      count++
      continue
    }

    // Tacos de Barbacoa at 10,300mg sodium
    if (/Tacos de Barbacoa/i.test(name) && n.sodium && n.sodium > 5000) {
      console.log(`  FIX: "${name}" at ${loc(item)} — ${n.sodium}mg sodium → 1030mg`)
      await updateNut(n.id, { sodium: 1030, confidence_score: 45 }, name)
      count++
      continue
    }

    // Beer Can Chicken at 8,240mg sodium (categorized as beverage!)
    if (/Beer Can Chicken/i.test(name) && n.sodium && n.sodium > 5000) {
      console.log(`  FIX: "${name}" at ${loc(item)} — ${n.sodium}mg sodium → 824mg, recategorize to entree`)
      await updateNut(n.id, { sodium: 824, calories: 500, carbs: 5, fat: 25, protein: 55, sugar: 0, confidence_score: 45 }, name)
      count++
      continue
    }

    // Remaining items with sodium > 6000 — cap at 1/10th (likely decimal place error)
    if (n.sodium && n.sodium > 6000 && !/(buffet|platter|sampler|family|combo)/i.test(name)) {
      const fixedSodium = Math.round(n.sodium / 10)
      console.log(`  FIX: "${name}" at ${loc(item)} — ${n.sodium}mg sodium → ${fixedSodium}mg (÷10)`)
      await updateNut(n.id, { sodium: fixedSodium, confidence_score: Math.min(n.confidence_score ?? 45, 45) }, name)
      count++
      continue
    }

    // Scotch Egg/Scotch Eggs with 231 cal but ALL macros 0 — need real values
    if (/^Scotch Egg/i.test(name) && n.calories && n.calories > 100 && !n.carbs && !n.fat && !n.protein) {
      console.log(`  FIX: "${name}" at ${loc(item)} — 231 cal with 0 macros → real scotch egg values`)
      await updateNut(n.id, { calories: 300, carbs: 12, fat: 18, protein: 16, sugar: 1, sodium: 450, fiber: 0, confidence_score: 50 }, name)
      count++
      continue
    }
  }

  console.log(`  Phase 1 complete: ${count} critical fixes`)
}

// ================================================================
// PHASE 2: Category corrections
// ================================================================
async function phase2_categoryFixes(items: Item[]) {
  console.log('\n' + '='.repeat(60))
  console.log('PHASE 2: Category Corrections')
  console.log('='.repeat(60))
  let count = 0

  // Savory items miscategorized as dessert
  const savoryAsDesert = [
    /Crispy Calamari/i,
    /Crab Cake(?!.*Doughnut)/i, // not "Crab Cake Doughnut"
    /Pan-Fried Crab Cake/i,
    /Jumbo Lump Crab Cake/i,
    /Lump Crab Cake/i,
    /Crispy Mac.*Cheese Bites/i,
    /BBQ Waffle Fries/i,
    /Cheeseburger Waffle/i,
    /BBQ Brisket Mac.*Cheese Waffle/i,
    /Cookie's Garden Goodness Platter/i,
    /Hot Chicken and Waffle/i,
    /Hot Honey Chicken Waffle/i,
    /Waffle Cone Chicken Strips/i,
    /The Donut Burger/i,
  ]

  for (const item of items) {
    if (item.category !== 'dessert') continue
    const matched = savoryAsDesert.some(p => p.test(item.name))
    if (matched) {
      const newCat = /fries/i.test(item.name) ? 'side' : 'entree'
      console.log(`  RECAT: "${item.name}" at ${loc(item)} — dessert → ${newCat}`)
      await updateItem(item.id, { category: newCat }, item.name)
      count++
    }
  }

  // Food items miscategorized as beverage
  const foodAsBeverage = [
    { pattern: /Root Beer-brined Pork/i, newCat: 'entree' },
    { pattern: /Beer-battered Fish and Chips/i, newCat: 'entree' },
    { pattern: /Beer Battered Onion Rings/i, newCat: 'side' },
    { pattern: /Grape Soda Badge Cupcake/i, newCat: 'dessert' },
    { pattern: /Strawberry Boba Milk Tea Petit Cake/i, newCat: 'dessert' },
    { pattern: /Pink Hole Coffee Mug/i, newCat: 'dessert' }, // it's a doughnut
    { pattern: /Cocoa Coffee Crusted.*New York Strip/i, newCat: 'entree' },
    { pattern: /Napa Valley Chardonnay/i, newCat: 'beverage' }, // already beverage but 50g fat is wrong
  ]

  for (const item of items) {
    if (item.category !== 'beverage') continue
    for (const { pattern, newCat } of foodAsBeverage) {
      if (pattern.test(item.name) && newCat !== 'beverage') {
        console.log(`  RECAT: "${item.name}" at ${loc(item)} — beverage → ${newCat}`)
        await updateItem(item.id, { category: newCat }, item.name)
        count++
        break
      }
    }
  }

  // Beverages/alcohol categorized as entree (common low-cal drinks)
  for (const item of items) {
    if (item.category !== 'entree') continue
    const n = nd(item)
    if (!n) continue
    const name = item.name.toLowerCase()

    // Alcoholic drinks with calories from alcohol only
    const isAlcohol = /\bsake\b|vodka seltzer|nütrl|margarita|whiskey flight|rum flight|rum freeze|rum smash|hard iced tea|honey hibiscus|palate cleanser|^wines?\b.*bottle/i.test(item.name)
    if (isAlcohol) {
      console.log(`  RECAT: "${item.name}" at ${loc(item)} — entree → beverage`)
      await updateItem(item.id, { category: 'beverage' }, item.name)
      count++
      continue
    }

    // Low-cal beverages
    if (n.calories !== null && n.calories <= 20) {
      const isBev = /^(cold brew|espresso|double espresso|hot tea|earl grey|loose.leaf tea|assorted.*tea|shakin.*jamaican|nitro|coffee|drip coffee|the$)/i.test(item.name.trim())
      if (isBev) {
        console.log(`  RECAT: "${item.name}" at ${loc(item)} — entree → beverage`)
        await updateItem(item.id, { category: 'beverage' }, item.name)
        count++
        continue
      }
    }
  }

  console.log(`  Phase 2 complete: ${count} category fixes`)
}

// ================================================================
// PHASE 3: Over-multiplied item corrections
// ================================================================
async function phase3_overMultiplied(items: Item[]) {
  console.log('\n' + '='.repeat(60))
  console.log('PHASE 3: Over-Multiplied Corrections')
  console.log('='.repeat(60))
  let count = 0

  // Max plausible calorie ranges by food type
  // These are generous maximums for THEME PARK portions
  const foodTypeRanges: Array<{ pattern: RegExp; maxCal: number; label: string }> = [
    // Festival/booth items (small plates)
    { pattern: /(?:booth|festival|holiday kitchen|marketplace)/i, maxCal: 800, label: 'festival booth item' },

    // Soups
    { pattern: /soup|chowder|bisque|gumbo/i, maxCal: 600, label: 'soup' },

    // Salads (even loaded ones)
    { pattern: /salad/i, maxCal: 900, label: 'salad' },

    // Eggs/breakfast items
    { pattern: /eggs? benedict|deviled egg|quiche|omelette?/i, maxCal: 900, label: 'egg dish' },

    // Appetizers/starters
    { pattern: /samosa|fritter|spring roll|egg roll|rangoon|bruschetta|hummus|guacamole|dip(?!\s*n)|edamame|calamari|escargot/i, maxCal: 700, label: 'appetizer' },

    // Small desserts
    { pattern: /churro(?!.*sundae)|cookie(?!\s*sandwich)|macaron|truffle|mochi|panna cotta|creme brulee|crème brûlée|mousse|gelato/i, maxCal: 500, label: 'small dessert' },

    // Single serving breads/pastries
    { pattern: /croissant|brioche|strudel|scone|muffin|beignet|pastry|pastries/i, maxCal: 600, label: 'pastry' },

    // Drinks (non-shake, non-smoothie) — exclude food items with beer/wine/rum in name
    { pattern: /^(?!.*(?:battered|brined|braised|brined|crusted|glazed|rubbed|infused|marinated|roasted|short rib|pot pie|strip|angus|cheese|waffle|chicken|onion ring|fries|loaded|pork|beef|steak|octopus|calamari|meatball|board|charcuterie|mussels|cobia|escargot|char\b)).*(?:margarita|cocktail|sangria|mojito|daiquiri|martini|^wine|^beer|^ale\b|^lager)/i, maxCal: 500, label: 'alcoholic drink' },

    // Greek yogurt / oatmeal
    { pattern: /yogurt|oatmeal|overnight oats|granola/i, maxCal: 500, label: 'yogurt/oatmeal' },

    // Sides
    { pattern: /^(french fries|fries|coleslaw|rice|mashed potato|baked potato|corn on the cob|green beans|broccoli|side )/i, maxCal: 600, label: 'side dish' },

    // Entrees (generous limits)
    { pattern: /burger(?!.*fries)/i, maxCal: 1400, label: 'burger' },
    { pattern: /pizza/i, maxCal: 1400, label: 'pizza' },
    { pattern: /steak|ribeye|rib.eye|filet|sirloin|strip/i, maxCal: 1200, label: 'steak' },
    { pattern: /fish.*chip/i, maxCal: 1100, label: 'fish & chips' },
    { pattern: /chicken parm|chicken alla parm/i, maxCal: 1200, label: 'chicken parm' },
    { pattern: /ribs(?!.*eye)/i, maxCal: 1400, label: 'ribs' },
    { pattern: /burrito/i, maxCal: 1200, label: 'burrito' },
    { pattern: /gyro/i, maxCal: 900, label: 'gyro' },
    { pattern: /risotto/i, maxCal: 800, label: 'risotto' },
    { pattern: /flatbread/i, maxCal: 900, label: 'flatbread' },
    { pattern: /spaghetti|pasta|penne|mafaldine|fettuccine|linguine|lasagna/i, maxCal: 1200, label: 'pasta' },
    { pattern: /sandwich|panini/i, maxCal: 1100, label: 'sandwich' },
    { pattern: /tacos?(?:\s|$)/i, maxCal: 800, label: 'taco' },
    { pattern: /wrap/i, maxCal: 900, label: 'wrap' },
    { pattern: /waffle(?!.*fries)/i, maxCal: 800, label: 'waffle' },
    { pattern: /pavlova/i, maxCal: 600, label: 'pavlova' },
    { pattern: /lumpia|spring roll/i, maxCal: 500, label: 'spring roll' },
    { pattern: /poutine/i, maxCal: 900, label: 'poutine' },
    { pattern: /curry/i, maxCal: 900, label: 'curry' },
    { pattern: /falafel/i, maxCal: 800, label: 'falafel' },
    { pattern: /bread pudding/i, maxCal: 800, label: 'bread pudding' },
  ]

  for (const item of items) {
    const n = nd(item)
    if (!n || !n.calories || n.calories < 1500) continue // only fix items clearly too high

    // Check restaurant name for festival booth context
    const restName = (item.restaurant as any)?.name ?? ''
    const fullContext = `${item.name} ${restName}`

    for (const range of foodTypeRanges) {
      if (!range.pattern.test(fullContext)) continue

      const cal = n.calories
      if (cal <= range.maxCal * 1.15) break // within tolerance

      const targetCal = Math.round(range.maxCal * 0.85)
      const divisor = cal / targetCal

      if (divisor < 1.3) break // not enough to fix

      const updates: Record<string, any> = {
        calories: targetCal,
        confidence_score: Math.min(n.confidence_score ?? 40, 40),
      }
      if (n.carbs) updates.carbs = Math.round(n.carbs / divisor)
      if (n.fat) updates.fat = Math.round(n.fat / divisor)
      if (n.protein) updates.protein = Math.round(n.protein / divisor)
      if (n.sugar) updates.sugar = Math.round(n.sugar / divisor)
      if (n.fiber) updates.fiber = Math.round(n.fiber / divisor)
      if (n.sodium) updates.sodium = Math.round(n.sodium / divisor)
      if (n.cholesterol) updates.cholesterol = Math.round(n.cholesterol / divisor)

      console.log(`  FIX: "${item.name}" (${range.label}) — ${cal} cal ÷ ${divisor.toFixed(1)} → ${targetCal} cal`)
      await updateNut(n.id, updates, item.name)
      count++
      break
    }
  }

  // Catch remaining items > 2500 cal not matched by specific food types
  // These get a generic reduction to bring into plausible range
  for (const item of items) {
    const n = nd(item)
    if (!n || !n.calories || n.calories <= 2500) continue

    // Skip if already fixed by specific food type above
    if (fixedNutIds.has(n.id)) continue

    // Only fix items with low confidence scores (likely estimated data)
    if ((n.confidence_score ?? 0) > 60) continue

    const cal = n.calories
    const divisor = cal / 1200 // bring to ~1200 cal max

    if (divisor < 1.5) continue

    const updates: Record<string, any> = {
      calories: Math.round(cal / divisor),
      confidence_score: Math.min(n.confidence_score ?? 35, 35),
    }
    if (n.carbs) updates.carbs = Math.round(n.carbs / divisor)
    if (n.fat) updates.fat = Math.round(n.fat / divisor)
    if (n.protein) updates.protein = Math.round(n.protein / divisor)
    if (n.sugar) updates.sugar = Math.round(n.sugar / divisor)
    if (n.fiber) updates.fiber = Math.round(n.fiber / divisor)
    if (n.sodium) updates.sodium = Math.round(n.sodium / divisor)
    if (n.cholesterol) updates.cholesterol = Math.round(n.cholesterol / divisor)

    console.log(`  FIX: "${item.name}" (generic cap) — ${cal} cal ÷ ${divisor.toFixed(1)} → ${updates.calories} cal`)
    await updateNut(n.id, updates, item.name)
    count++
  }

  console.log(`  Phase 3 complete: ${count} over-multiplied fixes`)
}

// ================================================================
// PHASE 4: Missing/impossible data fixes
// ================================================================
async function phase4_missingData(items: Item[]) {
  console.log('\n' + '='.repeat(60))
  console.log('PHASE 4: Missing & Impossible Data Fixes')
  console.log('='.repeat(60))
  let count = 0

  for (const item of items) {
    const n = nd(item)
    if (!n) continue

    // Skip items already fixed in earlier phases
    if (fixedNutIds.has(n.id)) continue

    // Fix: Sugar > Carbs (impossible)
    if (n.sugar && n.carbs && n.sugar > n.carbs && n.carbs > 0) {
      console.log(`  FIX: "${item.name}" — sugar ${n.sugar}g > carbs ${n.carbs}g → sugar = carbs`)
      await updateNut(n.id, { sugar: n.carbs, confidence_score: Math.min(n.confidence_score ?? 45, 45) }, item.name)
      count++
    }

    // Fix: Desserts with 0 sugar that are actual desserts (not savory miscategorizations)
    if (item.category === 'dessert' && n.calories && n.calories > 100) {
      const isSavory = /calamari|crab|fries|burger|chicken|mac.*cheese|platter|steak|wing/i.test(item.name)
      if (!isSavory && (n.sugar === null || n.sugar === 0)) {
        // Estimate sugar as ~40% of carbs for a dessert, or 30% of cal from sugar
        const estSugar = n.carbs ? Math.round(n.carbs * 0.4) : Math.round(n.calories * 0.3 / 4)
        if (estSugar > 0) {
          console.log(`  FIX: "${item.name}" — dessert with 0g sugar → ${estSugar}g estimated`)
          await updateNut(n.id, { sugar: estSugar, confidence_score: Math.min(n.confidence_score ?? 40, 40) }, item.name)
          count++
        }
      }
    }

    // Fix: Food items with calories > 100 but ALL macros = 0 (NOT alcohol)
    if (n.calories && n.calories > 100) {
      const allZero = (!n.carbs || n.carbs === 0) && (!n.fat || n.fat === 0) && (!n.protein || n.protein === 0)
      if (!allZero) continue

      const name = item.name
      // Skip if it's clearly alcohol (calories come from ethanol, not macros)
      const isAlcohol = /\bsake\b|vodka|seltzer|nütrl|margarita|whiskey|rum|beer|wine|ale|lager|bourbon|tequila|martini|cocktail|flight|freeze|smash|sangria|champagne|prosecco/i.test(name)
      if (isAlcohol) continue

      // Estimate macros from calories based on item type
      const cal = n.calories
      let carbs = 0, fat = 0, protein = 0, sugar = 0

      if (/cake|cookie|brownie|cupcake|pastry|donut|doughnut|churro|pie|tart|candy|fudge/i.test(name)) {
        carbs = Math.round(cal * 0.5 / 4)
        fat = Math.round(cal * 0.35 / 9)
        protein = Math.round(cal * 0.08 / 4)
        sugar = Math.round(carbs * 0.6)
      } else if (/chicken|steak|pork|beef|burger|meat|ribs/i.test(name)) {
        protein = Math.round(cal * 0.3 / 4)
        fat = Math.round(cal * 0.4 / 9)
        carbs = Math.round(cal * 0.2 / 4)
        sugar = Math.round(carbs * 0.1)
      } else {
        // Generic food
        carbs = Math.round(cal * 0.45 / 4)
        fat = Math.round(cal * 0.3 / 9)
        protein = Math.round(cal * 0.15 / 4)
        sugar = Math.round(carbs * 0.2)
      }

      console.log(`  FIX: "${name}" at ${loc(item)} — ${cal} cal, 0 macros → C:${carbs} F:${fat} P:${protein}`)
      await updateNut(n.id, { carbs, fat, protein, sugar, confidence_score: Math.min(n.confidence_score ?? 35, 35) }, name)
      count++
    }
  }

  console.log(`  Phase 4 complete: ${count} missing/impossible data fixes`)
}

// ================================================================
// PHASE 5: Specific wrong nutrition fixes for common mismatches
// ================================================================
async function phase5_specificFixes(items: Item[]) {
  console.log('\n' + '='.repeat(60))
  console.log('PHASE 5: Specific Item Nutrition Corrections')
  console.log('='.repeat(60))
  let count = 0

  // Napa Valley Chardonnay with 50g fat — wine has 0 fat
  for (const item of items) {
    const n = nd(item)
    if (!n) continue

    if (/Chardonnay/i.test(item.name) && n.fat && n.fat > 10) {
      console.log(`  FIX: "${item.name}" — wine with ${n.fat}g fat → 0g fat`)
      await updateNut(n.id, { fat: 0, calories: 125, carbs: 4, protein: 0, sugar: 1, sodium: 5, confidence_score: 70 }, item.name)
      count++
      continue
    }

    // Hot Honey Soppressata Pizza at 2700 cal with 0 carbs — pizza always has carbs
    if (/Soppressata Pizza/i.test(item.name) && n.carbs === 0 && n.calories && n.calories > 1000) {
      console.log(`  FIX: "${item.name}" — pizza with 0 carbs, fix all macros`)
      await updateNut(n.id, { calories: 1100, carbs: 100, fat: 50, protein: 45, sugar: 8, sodium: 2200, confidence_score: 40 }, item.name)
      count++
      continue
    }

    // Hunter's Chicken at 2422 cal but only 0 carbs, 80g fat, 27g protein — wrong
    if (/Hunter's Chicken/i.test(item.name) && n.calories && n.calories > 2000) {
      console.log(`  FIX: "${item.name}" — ${n.calories} cal → 650 cal (chicken with sauce)`)
      await updateNut(n.id, { calories: 650, carbs: 30, fat: 28, protein: 55, sugar: 8, sodium: 1200, confidence_score: 40 }, item.name)
      count++
      continue
    }

    // Figment Fantasy Cake at 3000 cal with 224g protein — cake doesn't have that much protein
    if (/Figment Fantasy Cake/i.test(item.name) && n.calories && n.calories > 2000) {
      console.log(`  FIX: "${item.name}" — ${n.calories} cal → 600 cal (theme park cake)`)
      await updateNut(n.id, { calories: 600, carbs: 80, fat: 28, protein: 5, sugar: 55, sodium: 350, confidence_score: 40 }, item.name)
      count++
      continue
    }

    // Sideshow Bob Foot Long at 3000 cal categorized as side — it's an entree
    if (/Sideshow Bob Foot Long/i.test(item.name) && n.calories && n.calories > 2000) {
      console.log(`  FIX: "${item.name}" — ${n.calories} cal → 800 cal (footlong)`)
      await updateNut(n.id, { calories: 800, carbs: 60, fat: 35, protein: 30, sugar: 8, sodium: 1800, confidence_score: 40 }, item.name)
      await updateItem(item.id, { category: 'entree' }, item.name)
      count++
      continue
    }

    // Caramel Macchiato (without Grande) — any version over 500 cal is wrong
    if (/Caramel Macchiato/i.test(item.name) && !/Grande/i.test(item.name) && n.calories && n.calories > 500) {
      console.log(`  FIX: "${item.name}" — ${n.calories} cal → 190 cal`)
      await updateNut(n.id, { calories: 190, carbs: 25, fat: 6, protein: 8, sugar: 24, sodium: 100, confidence_score: 75 }, item.name)
      count++
      continue
    }

    // Mocha Frappuccino at 935 cal — real Grande is ~370 cal
    if (/Mocha Frappuccino/i.test(item.name) && n.calories && n.calories > 500) {
      console.log(`  FIX: "${item.name}" — ${n.calories} cal → 370 cal`)
      await updateNut(n.id, { calories: 370, carbs: 52, fat: 15, protein: 5, sugar: 47, sodium: 220, confidence_score: 75 }, item.name)
      count++
      continue
    }

    // Greek Yogurt at 2216 cal — individual serving is ~150-250 cal
    if (/Greek Yogurt.*honey/i.test(item.name) && n.calories && n.calories > 1000) {
      console.log(`  FIX: "${item.name}" — ${n.calories} cal → 200 cal`)
      await updateNut(n.id, { calories: 200, carbs: 30, fat: 3, protein: 15, sugar: 24, sodium: 60, confidence_score: 50 }, item.name)
      count++
      continue
    }

    // Overnight Oats at 2181 cal — single serving is ~300-400 cal
    if (/Overnight Oats/i.test(item.name) && n.calories && n.calories > 800) {
      console.log(`  FIX: "${item.name}" — ${n.calories} cal → 350 cal`)
      await updateNut(n.id, { calories: 350, carbs: 50, fat: 10, protein: 12, sugar: 18, sodium: 150, confidence_score: 50 }, item.name)
      count++
      continue
    }
  }

  console.log(`  Phase 5 complete: ${count} specific fixes`)
}

// ================================================================
// Main
// ================================================================
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║  DiabetesGuide Nutrition Audit Fix v2                   ║')
  console.log('║  Comprehensive data quality corrections                 ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  if (dryRun) console.log('\n⚠  DRY RUN — no changes will be made\n')

  const items = await fetchAll()
  console.log(`Loaded ${items.length} items\n`)

  await phase1_criticalFixes(items)
  await phase2_categoryFixes(items)
  await phase3_overMultiplied(items)
  await phase4_missingData(items)
  await phase5_specificFixes(items)

  console.log('\n' + '='.repeat(60))
  console.log(`TOTAL FIXES APPLIED: ${fixCount}`)
  console.log('='.repeat(60))
}

main().catch(console.error)
