/**
 * Fix CATEGORY and NUTRITION issues for Epic Universe items.
 *
 * Usage:
 *   SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) \
 *   SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) \
 *   npx tsx scripts/fix-epic-universe-nutrition.ts [--dry-run]
 *
 * Phase 1: Category fixes (menu_items.category)
 * Phase 2: Nutrition fixes (nutritional_data)
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const sb = createClient(url, key)
const DRY_RUN = process.argv.includes('--dry-run')

// ---- Types ----

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
  restaurant: { id: string; name: string; park: { name: string } }
  nutritional_data: NutRow[]
}

// ---- Counters ----

let categoryFixCount = 0
let nutritionFixCount = 0
const fixedItemIds = new Set<string>()
const fixedNutIds = new Set<string>()

// ---- Helpers ----

function nd(item: Item): NutRow | null {
  return item.nutritional_data?.[0] ?? null
}

function loc(item: Item): string {
  const r = item.restaurant as any
  return `${r?.name ?? '?'} (${r?.park?.name ?? '?'})`
}

function restName(item: Item): string {
  return (item.restaurant as any)?.name ?? ''
}

// ---- Data Fetching ----

async function fetchEpicUniverseItems(): Promise<Item[]> {
  // First get the park ID
  const { data: park } = await sb.from('parks')
    .select('id')
    .eq('name', "Universal's Epic Universe")
    .single()

  if (!park) {
    console.error("Park 'Universal's Epic Universe' not found")
    process.exit(1)
  }

  // Get all restaurant IDs for this park
  const { data: rests } = await sb.from('restaurants')
    .select('id')
    .eq('park_id', park.id)

  if (!rests || rests.length === 0) {
    console.error('No restaurants found for Epic Universe')
    process.exit(1)
  }

  const restIds = rests.map(r => r.id)

  // Fetch all menu items in pages
  const all: Item[] = []
  for (let i = 0; i < restIds.length; i += 10) {
    const batch = restIds.slice(i, i + 10)
    let from = 0
    while (true) {
      const { data, error } = await sb.from('menu_items')
        .select('id, name, category, description, restaurant:restaurants(id, name, park:parks(name)), nutritional_data(*)')
        .in('restaurant_id', batch)
        .range(from, from + 499)
      if (error) { console.error('Fetch error:', error); break }
      if (!data || data.length === 0) break
      all.push(...(data as unknown as Item[]))
      if (data.length < 500) break
      from += 500
    }
  }

  return all
}

// ============================================================
// PHASE 1: CATEGORY FIXES
// ============================================================

// --- 1a. Specific name → category overrides ---
const SPECIFIC_CATEGORY_FIXES: Array<{ namePattern: string | RegExp; restaurant?: string | RegExp; newCategory: string }> = [
  // Food items wrongly classified as "beverage"
  { namePattern: 'Apple Cider & Sweet Onion Bisque', newCategory: 'side' },
  { namePattern: "Alchemist's Platter", newCategory: 'entree' },
  { namePattern: 'Thawfest Platter', newCategory: 'entree' },
  { namePattern: 'One Meat, One Side Platter', newCategory: 'entree' },
  { namePattern: 'Two Meat, One Side Platter', newCategory: 'entree' },
  { namePattern: "Wizard's Brew Bratwurst Sandwich", newCategory: 'entree' },
  { namePattern: /Bi[eè]raubeurre.*Cr[eê]pe/i, newCategory: 'dessert' },
  { namePattern: 'Baguette Ratatouille Provençale', newCategory: 'entree' },
  { namePattern: 'Poulet à la Provençale', newCategory: 'entree' },

  // Desserts wrongly classified as "entree"
  { namePattern: 'El Pulpo', restaurant: 'Atlantic', newCategory: 'dessert' },
  { namePattern: "Landlubber's Snickerdoodle Loot", restaurant: 'Atlantic', newCategory: 'dessert' },
  { namePattern: 'Passion Fruit Caviar', restaurant: 'Atlantic', newCategory: 'dessert' },
  { namePattern: /Pi[ñn]a Colada Panna Cotta/i, restaurant: 'Atlantic', newCategory: 'dessert' },
  { namePattern: 'Red Velvet Death', restaurant: 'Das Stakehaus', newCategory: 'dessert' },
  { namePattern: 'Warm Hearted Cinnamon Bites', restaurant: "De Lacey's", newCategory: 'dessert' },
  { namePattern: 'Chocolate Chip', restaurant: 'Frosty Moon', newCategory: 'dessert' },
  { namePattern: "Stormfly's Catch of the Day", restaurant: 'Mead Hall', newCategory: 'dessert' },

  // Other mis-categorizations
  { namePattern: 'Fish and Chips', restaurant: 'Meteor Astropub', newCategory: 'entree' },
  { namePattern: 'Jumbo Lump Crab Cake', restaurant: 'Atlantic', newCategory: 'entree' },
  { namePattern: /DK Crush Float/i, restaurant: 'The Bubbly Barrel', newCategory: 'dessert' },
]

// --- 1b. Pattern-based drinks wrongly classified as "entree" → "beverage" ---
const DRINK_PATTERNS_TO_BEVERAGE: RegExp[] = [
  // Wines
  /Cabernet/i,
  /Merlot/i,
  /Sauvignon/i,
  /Cavicchioli/i,
  /Amarone/i,
  /\bGavi\b/i,
  /Grillo/i,
  /Garnacha/i,
  /Gr[uü]ner/i,
  /Moscato/i,
  /Vermentino/i,
  /Red Blend/i,
  // Cocktails
  /Martini/i,
  /Old Fashioned/i,
  /Paloma/i,
  /\bMule\b/i,
  /\b75\b/i,   // French 75 / Fleur 75
  /Daiquiri/i,
  /Mai Tai/i,
  /Mudslide/i,
  /Pi[ñn]a Colada/i,
  /Bramble/i,
  /\bSour\b/i,
  /Bees Knees/i,
  // Themed cocktails (by name)
  /^Northern Lights$/i,
  /^Florida Sand Dollar$/i,
  /^Spice Route$/i,
  /Cosmos-politan/i,
  /Natural Satellite/i,
  /Red Shift/i,
  /Star-garita/i,
  /Stellar Cloud/i,
  /\bKunuku\b/i,
  /Sherbet Lemon/i,
  /Lobe Blaster/i,
  /Philosopher'?s/i,
  /My Only Weakness/i,
  /Pure of Heart/i,
  /Dapper Deer'?s/i,
  /Enchanted Oak Sap/i,
  /The Plastered Owl/i,
  /Witty Wolf'?s/i,
  /The Eccentric Orbit/i,
  // Beer/ale
  /Au Currant Saison/i,
  /Le Breuvage Sombre/i,
  /\bDuvel\b/i,
  /Reaper'?s Reserve/i,
  /Souvenir Duvel/i,
  /Souvenir Reaper'?s/i,
  // Non-alcoholic drinks
  /Th[eé] Fraise/i,
  /Papa Rangi'?s Elixir/i,
  /Snow Wraith/i,
  /Fountain Drinks?$/i,
]

async function fixCategories(items: Item[]) {
  console.log('=== PHASE 1: Category Fixes ===\n')

  // 1a. Specific name fixes
  console.log('--- 1a: Specific item category overrides ---')
  for (const fix of SPECIFIC_CATEGORY_FIXES) {
    for (const item of items) {
      if (fixedItemIds.has(item.id)) continue

      // Match name
      let nameMatch = false
      if (typeof fix.namePattern === 'string') {
        nameMatch = item.name === fix.namePattern
      } else {
        nameMatch = fix.namePattern.test(item.name)
      }
      if (!nameMatch) continue

      // Match restaurant (if specified)
      if (fix.restaurant) {
        const rn = restName(item)
        if (typeof fix.restaurant === 'string') {
          if (rn !== fix.restaurant) continue
        } else {
          if (!fix.restaurant.test(rn)) continue
        }
      }

      if (item.category === fix.newCategory) continue // already correct

      console.log(`  FIX: "${item.name}" at ${loc(item)} — category "${item.category}" -> "${fix.newCategory}"`)

      if (!DRY_RUN) {
        const { error } = await sb.from('menu_items')
          .update({ category: fix.newCategory })
          .eq('id', item.id)
        if (error) {
          console.error('    Update error:', error)
          continue
        }
      }

      fixedItemIds.add(item.id)
      categoryFixCount++

      // Update in-memory for subsequent nutrition fixes
      item.category = fix.newCategory
    }
  }

  // 1b. Pattern-based drinks → beverage
  console.log('\n--- 1b: Pattern-based drink -> beverage ---')
  for (const item of items) {
    if (fixedItemIds.has(item.id)) continue
    if (item.category === 'beverage') continue // already correct

    let matched = false
    for (const pattern of DRINK_PATTERNS_TO_BEVERAGE) {
      if (pattern.test(item.name)) {
        matched = true
        break
      }
    }
    if (!matched) continue

    // Avoid re-categorizing food items that happen to contain drink keywords
    // (e.g., "Piña Colada Panna Cotta" is a dessert, not a beverage)
    // These should be handled by specific fixes above
    const alreadyFixed = SPECIFIC_CATEGORY_FIXES.some(fix => {
      if (typeof fix.namePattern === 'string') {
        return item.name === fix.namePattern
      }
      return fix.namePattern.test(item.name)
    })
    if (alreadyFixed) continue

    console.log(`  FIX: "${item.name}" at ${loc(item)} — category "${item.category}" -> "beverage"`)

    if (!DRY_RUN) {
      const { error } = await sb.from('menu_items')
        .update({ category: 'beverage' })
        .eq('id', item.id)
      if (error) {
        console.error('    Update error:', error)
        continue
      }
    }

    fixedItemIds.add(item.id)
    categoryFixCount++
    item.category = 'beverage'
  }

  console.log(`\nPhase 1 total: ${categoryFixCount} category fixes\n`)
}

// ============================================================
// PHASE 2: NUTRITION FIXES
// ============================================================

interface NutritionValues {
  calories: number
  carbs: number
  fat: number
  protein: number
  sugar: number
  fiber: number
  sodium: number
}

async function updateNutrition(item: Item, nutRow: NutRow, values: NutritionValues, reason: string) {
  if (fixedNutIds.has(nutRow.id)) return

  const old = `${nutRow.calories ?? '?'}cal`
  const neu = `${values.calories}cal`
  console.log(`  FIX: "${item.name}" at ${loc(item)} — ${reason} (${old} -> ${neu})`)

  if (!DRY_RUN) {
    const { error } = await sb.from('nutritional_data')
      .update({
        calories: values.calories,
        carbs: values.carbs,
        fat: values.fat,
        protein: values.protein,
        sugar: values.sugar,
        fiber: values.fiber,
        sodium: values.sodium,
        confidence_score: 40,
      })
      .eq('id', nutRow.id)
    if (error) {
      console.error('    Update error:', error)
      return
    }
  }

  fixedNutIds.add(nutRow.id)
  nutritionFixCount++
}

// --- 2a. Specific item fixes (exact name + optional restaurant) ---
const SPECIFIC_NUTRITION_FIXES: Array<{
  namePattern: string | RegExp
  restaurant?: string | RegExp
  values: NutritionValues
}> = [
  { namePattern: 'Coq Au Vin', values: { calories: 700, carbs: 30, fat: 30, protein: 45, sugar: 5, fiber: 3, sodium: 1000 } },
  { namePattern: 'Oeuf en Cocotte', values: { calories: 550, carbs: 35, fat: 30, protein: 25, sugar: 4, fiber: 2, sodium: 800 } },
  { namePattern: 'Herb Crusted Cod', values: { calories: 500, carbs: 25, fat: 20, protein: 35, sugar: 3, fiber: 2, sodium: 700 } },
  { namePattern: 'All Natural Bone-in Chicken Breast', values: { calories: 600, carbs: 25, fat: 22, protein: 45, sugar: 3, fiber: 2, sodium: 800 } },
  { namePattern: 'Tomato Burrata', values: { calories: 350, carbs: 15, fat: 25, protein: 15, sugar: 5, fiber: 2, sodium: 500 } },
  { namePattern: 'King Oyster Mushroom Ceviche', values: { calories: 220, carbs: 15, fat: 12, protein: 8, sugar: 5, fiber: 3, sodium: 400 } },
  { namePattern: /^Oysters$/i, restaurant: 'Atlantic', values: { calories: 60, carbs: 3, fat: 2, protein: 6, sugar: 0, fiber: 0, sodium: 200 } },
  { namePattern: 'Baked Oysters Valentina', values: { calories: 180, carbs: 8, fat: 12, protein: 12, sugar: 1, fiber: 0, sodium: 400 } },
  { namePattern: 'Shrimp Cocktail', values: { calories: 150, carbs: 12, fat: 1, protein: 20, sugar: 8, fiber: 1, sodium: 600 } },
  { namePattern: 'Ahi Tuna Tartare', values: { calories: 250, carbs: 10, fat: 12, protein: 25, sugar: 3, fiber: 1, sodium: 500 } },
  { namePattern: 'Fruit Bowl', restaurant: 'Star Sui Bao', values: { calories: 120, carbs: 30, fat: 0, protein: 1, sugar: 25, fiber: 3, sodium: 10 } },
  { namePattern: /^Chips$/i, values: { calories: 150, carbs: 15, fat: 10, protein: 2, sugar: 1, fiber: 1, sodium: 180 } },
  { namePattern: 'Traditional Southern', restaurant: /Oak/i, values: { calories: 650, carbs: 45, fat: 35, protein: 25, sugar: 5, fiber: 3, sodium: 1100 } },
  { namePattern: 'Jumbo Lump Crab Cake', restaurant: 'Atlantic', values: { calories: 400, carbs: 20, fat: 22, protein: 25, sugar: 3, fiber: 2, sodium: 700 } },

  // Bao buns at Star Sui Bao
  { namePattern: /Celestial Steamed Bun/i, restaurant: 'Star Sui Bao', values: { calories: 300, carbs: 32, fat: 10, protein: 15, sugar: 4, fiber: 2, sodium: 600 } },
  { namePattern: /Kimchi Bao/i, restaurant: 'Star Sui Bao', values: { calories: 300, carbs: 32, fat: 10, protein: 15, sugar: 4, fiber: 2, sodium: 600 } },
]

async function fixSpecificNutrition(items: Item[]) {
  console.log('--- 2a: Specific item nutrition fixes ---')

  for (const fix of SPECIFIC_NUTRITION_FIXES) {
    for (const item of items) {
      const n = nd(item)
      if (!n) continue
      if (fixedNutIds.has(n.id)) continue
      // Skip items already enriched beyond keyword estimation
      if ((n.confidence_score ?? 0) > 30) continue

      let nameMatch = false
      if (typeof fix.namePattern === 'string') {
        nameMatch = item.name === fix.namePattern
      } else {
        nameMatch = fix.namePattern.test(item.name)
      }
      if (!nameMatch) continue

      if (fix.restaurant) {
        const rn = restName(item)
        if (typeof fix.restaurant === 'string') {
          if (rn !== fix.restaurant) continue
        } else {
          if (!fix.restaurant.test(rn)) continue
        }
      }

      await updateNutrition(item, n, fix.values, 'specific fix')
    }
  }
}

// --- 2b. Pattern-based nutrition fixes ---

async function fixPatternNutrition(items: Item[]) {
  console.log('\n--- 2b: Pattern-based nutrition fixes ---')

  for (const item of items) {
    const n = nd(item)
    if (!n) continue
    if (fixedNutIds.has(n.id)) continue
    if ((n.confidence_score ?? 0) > 30) continue

    const name = item.name
    const rn = restName(item)

    // --- Zero/near-zero calorie items ---
    // Exclude "Perrier-Jouet" (champagne) from the Perrier water match
    if (/Monster Zero|Monster Ultra Zero|Perrier(?!-Jou)|sparkling water|Sugar-Free/i.test(name) && !/Lemonade/i.test(name)) {
      await updateNutrition(item, n, { calories: 0, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 10 }, 'zero-cal')
      continue
    }

    if (/Lemonade.*Sugar-Free|Sugar-Free.*Lemonade/i.test(name)) {
      await updateNutrition(item, n, { calories: 5, carbs: 1, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 5 }, 'sugar-free lemonade')
      continue
    }

    if (/^Unsweet(ened)? Iced Tea$/i.test(name)) {
      await updateNutrition(item, n, { calories: 5, carbs: 1, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 5 }, 'unsweet tea')
      continue
    }

    if (/^(Brewed )?Coffee$/i.test(name) || /^Hot Coffee$/i.test(name)) {
      await updateNutrition(item, n, { calories: 5, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 5 }, 'plain coffee')
      continue
    }

    if (/^Hot Beverages?$/i.test(name)) {
      await updateNutrition(item, n, { calories: 5, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 5 }, 'hot beverages')
      continue
    }

    // --- Milk items ---
    if (/^2% Milk$/i.test(name)) {
      await updateNutrition(item, n, { calories: 120, carbs: 12, fat: 5, protein: 8, sugar: 12, fiber: 0, sodium: 130 }, '2% milk')
      continue
    }

    if (/^Chocolate Milk$/i.test(name)) {
      await updateNutrition(item, n, { calories: 190, carbs: 30, fat: 5, protein: 8, sugar: 24, fiber: 1, sodium: 150 }, 'chocolate milk')
      continue
    }

    if (/^Milk$/i.test(name)) {
      await updateNutrition(item, n, { calories: 150, carbs: 12, fat: 8, protein: 8, sugar: 12, fiber: 0, sodium: 105 }, 'whole milk')
      continue
    }

    // --- Souvenir cups / Freestyle / Refills ---
    if (/Freestyle|Sipper|Extra day of refills/i.test(name)) {
      await updateNutrition(item, n, { calories: 0, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0 }, 'non-food item')
      continue
    }

    // --- Powerade ---
    if (/^Powerade$/i.test(name)) {
      await updateNutrition(item, n, { calories: 80, carbs: 21, fat: 0, protein: 0, sugar: 21, fiber: 0, sodium: 150 }, 'Powerade')
      continue
    }

    // --- Specific branded beers ---
    if (/Michelob Ultra/i.test(name)) {
      await updateNutrition(item, n, { calories: 95, carbs: 3, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 10 }, 'Michelob Ultra')
      continue
    }
    if (/Miller Lite/i.test(name)) {
      await updateNutrition(item, n, { calories: 96, carbs: 3, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 10 }, 'Miller Lite')
      continue
    }
    if (/Modelo Especial/i.test(name)) {
      await updateNutrition(item, n, { calories: 143, carbs: 14, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 10 }, 'Modelo')
      continue
    }
    if (/Stella Artois/i.test(name)) {
      await updateNutrition(item, n, { calories: 150, carbs: 13, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 10 }, 'Stella Artois')
      continue
    }
    if (/Guinness/i.test(name)) {
      await updateNutrition(item, n, { calories: 125, carbs: 10, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 15 }, 'Guinness')
      continue
    }

    // --- Ciders ---
    if (/Strongbow Gold/i.test(name)) {
      await updateNutrition(item, n, { calories: 170, carbs: 16, fat: 0, protein: 0, sugar: 14, fiber: 0, sodium: 15 }, 'Strongbow cider')
      continue
    }
    if (/Aval French Cider/i.test(name)) {
      await updateNutrition(item, n, { calories: 130, carbs: 10, fat: 0, protein: 0, sugar: 8, fiber: 0, sodium: 10 }, 'Aval cider')
      continue
    }
    if (/Rekorderlig/i.test(name)) {
      await updateNutrition(item, n, { calories: 195, carbs: 25, fat: 0, protein: 0, sugar: 22, fiber: 0, sodium: 10 }, 'Rekorderlig')
      continue
    }
    if (/Angry Orchard/i.test(name)) {
      await updateNutrition(item, n, { calories: 190, carbs: 24, fat: 0, protein: 0, sugar: 21, fiber: 0, sodium: 15 }, 'Angry Orchard')
      continue
    }

    // --- Wines by type (pattern match) ---
    if (/Cabernet|Merlot|Red Blend|Amarone|Garnacha|Chorey|Palacios|Daou/i.test(name) && item.category === 'beverage') {
      await updateNutrition(item, n, { calories: 125, carbs: 4, fat: 0, protein: 0, sugar: 1, fiber: 0, sodium: 5 }, 'red wine')
      continue
    }
    if (/Sauvignon Blanc|Chardonnay|Vermentino|Gavi|Grillo|Gr[uü]ner|Viognier/i.test(name) && item.category === 'beverage') {
      await updateNutrition(item, n, { calories: 120, carbs: 4, fat: 0, protein: 0, sugar: 1, fiber: 0, sodium: 5 }, 'white wine')
      continue
    }
    if (/Prosecco|Cavicchioli|Champagne/i.test(name) && item.category === 'beverage') {
      await updateNutrition(item, n, { calories: 120, carbs: 4, fat: 0, protein: 0, sugar: 2, fiber: 0, sodium: 5 }, 'sparkling wine')
      continue
    }
    if (/Moscato/i.test(name) && item.category === 'beverage') {
      await updateNutrition(item, n, { calories: 125, carbs: 12, fat: 0, protein: 0, sugar: 10, fiber: 0, sodium: 5 }, 'sweet wine')
      continue
    }
    // Use word boundary to avoid matching "Rosemary" as rose wine
    if (/\bRos[eé]\b/i.test(name) && item.category === 'beverage') {
      await updateNutrition(item, n, { calories: 120, carbs: 4, fat: 0, protein: 0, sugar: 2, fiber: 0, sodium: 5 }, 'rose wine')
      continue
    }

    // --- Butterbeer variants ---
    // Non-dairy frozen
    if (/Bi[eè]raubeurre.*Glac[eé]e.*Non|Non.*Dairy.*Bi[eè]raubeurre.*Glac[eé]e|Bieraubeurre.*Frozen.*Non|Non.*Dairy.*Bieraubeurre.*Frozen/i.test(name)) {
      await updateNutrition(item, n, { calories: 250, carbs: 50, fat: 2, protein: 1, sugar: 32, fiber: 0, sodium: 30 }, 'non-dairy frozen butterbeer')
      continue
    }
    // Non-dairy cold
    if (/Bi[eè]raubeurre.*Froide.*Non|Non.*Dairy.*Bi[eè]raubeurre.*Froide|Bieraubeurre.*Cold.*Non|Non.*Dairy.*Bieraubeurre.*Cold/i.test(name)) {
      await updateNutrition(item, n, { calories: 200, carbs: 42, fat: 2, protein: 1, sugar: 29, fiber: 0, sodium: 30 }, 'non-dairy cold butterbeer')
      continue
    }
    // Non-dairy hot
    if (/Bi[eè]raubeurre.*Chaude.*Non|Non.*Dairy.*Bi[eè]raubeurre.*Chaude|Bieraubeurre.*Hot.*Non|Non.*Dairy.*Bieraubeurre.*Hot/i.test(name)) {
      await updateNutrition(item, n, { calories: 280, carbs: 48, fat: 2, protein: 2, sugar: 30, fiber: 0, sodium: 40 }, 'non-dairy hot butterbeer')
      continue
    }
    // Regular frozen butterbeer
    if (/Bi[eè]raubeurre.*Glac[eé]e|Bieraubeurre.*Frozen/i.test(name)) {
      await updateNutrition(item, n, { calories: 250, carbs: 50, fat: 4, protein: 1, sugar: 32, fiber: 0, sodium: 30 }, 'frozen butterbeer')
      continue
    }
    // Regular cold butterbeer
    if (/Bi[eè]raubeurre.*Froide|Bieraubeurre.*Cold/i.test(name)) {
      await updateNutrition(item, n, { calories: 200, carbs: 42, fat: 4, protein: 1, sugar: 29, fiber: 0, sodium: 30 }, 'cold butterbeer')
      continue
    }
    // Regular hot butterbeer
    if (/Bi[eè]raubeurre.*Chaude|Bieraubeurre.*Hot/i.test(name)) {
      await updateNutrition(item, n, { calories: 280, carbs: 48, fat: 6, protein: 2, sugar: 30, fiber: 0, sodium: 40 }, 'hot butterbeer')
      continue
    }
    // Generic butterbeer (souvenir or unspecified variant)
    if (/Bi[eè]raubeurre|Bieraubeurre|Butterbeer/i.test(name) && !/Cr[eê]pe/i.test(name)) {
      await updateNutrition(item, n, { calories: 220, carbs: 45, fat: 4, protein: 1, sugar: 30, fiber: 0, sodium: 30 }, 'butterbeer (generic)')
      continue
    }

    // --- Occamy Tea ---
    if (/Beau Th[eé] Bleu d'Occamy|Occamy Tea/i.test(name)) {
      await updateNutrition(item, n, { calories: 100, carbs: 25, fat: 0, protein: 0, sugar: 22, fiber: 0, sodium: 10 }, 'Occamy tea')
      continue
    }

    // --- Cocktails with entree-level nutrition (the main bulk fix) ---
    // Many cocktails got the default entree template (600/40/25/30/5) during import.
    // Fix them based on cocktail type.

    // Only apply cocktail fixes to items categorized as beverage
    if (item.category === 'beverage') {
      // Cream cocktails (Mudslide, etc.)
      if (/Mudslide/i.test(name)) {
        await updateNutrition(item, n, { calories: 350, carbs: 30, fat: 8, protein: 2, sugar: 25, fiber: 0, sodium: 40 }, 'cream cocktail')
        continue
      }

      // Sweet/tropical cocktails
      if (/Pi[ñn]a Colada|Daiquiri|Mai Tai/i.test(name)) {
        await updateNutrition(item, n, { calories: 300, carbs: 35, fat: 3, protein: 1, sugar: 30, fiber: 0, sodium: 15 }, 'tropical cocktail')
        continue
      }

      // Sour/fizz cocktails
      if (/\bSour\b|Bramble|Bees Knees|\b75\b/i.test(name)) {
        await updateNutrition(item, n, { calories: 180, carbs: 12, fat: 0, protein: 0, sugar: 10, fiber: 0, sodium: 5 }, 'sour/fizz cocktail')
        continue
      }

      // Standard spirit cocktails (catch-all for remaining cocktail patterns)
      const isCocktail = /Martini|Old Fashioned|Paloma|\bMule\b|Northern Lights|Florida Sand Dollar|Spice Route|Cosmos-politan|Natural Satellite|Red Shift|Star-garita|Stellar Cloud|Kunuku|Sherbet Lemon|Lobe Blaster|Philosopher'?s|My Only Weakness|Pure of Heart|Dapper Deer'?s|Enchanted Oak Sap|The Plastered Owl|Witty Wolf'?s|The Eccentric Orbit/i.test(name)
      if (isCocktail) {
        // Only fix if nutrition looks like the entree template was applied
        const cal = n.calories ?? 0
        if (cal > 250) {
          await updateNutrition(item, n, { calories: 200, carbs: 8, fat: 0, protein: 0, sugar: 6, fiber: 0, sodium: 5 }, 'standard cocktail')
          continue
        }
      }

      // Generic beverage fix: any remaining beverage with entree-like nutrition
      // (>400 cal, >20g protein — beverages shouldn't have 30g protein)
      const cal = n.calories ?? 0
      const prot = n.protein ?? 0
      if (cal >= 400 && prot >= 20) {
        // Looks like it got a food template; check if it's a beer/wine/spirit
        if (/Au Currant|Le Breuvage|Duvel|Reaper|Th[eé] Fraise|Papa Rangi|Snow Wraith/i.test(name)) {
          // These are themed drinks — apply a generic drink template
          await updateNutrition(item, n, { calories: 200, carbs: 15, fat: 0, protein: 0, sugar: 10, fiber: 0, sodium: 10 }, 'themed drink (was entree template)')
          continue
        }
      }
    }
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('Epic Universe Nutrition & Category Fix Script')
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  console.log('==============================================\n')

  const items = await fetchEpicUniverseItems()
  console.log(`Loaded ${items.length} Epic Universe items\n`)

  // Phase 1: Category fixes
  await fixCategories(items)

  // Phase 2: Nutrition fixes
  console.log('=== PHASE 2: Nutrition Fixes ===\n')
  await fixSpecificNutrition(items)
  await fixPatternNutrition(items)

  console.log(`\nPhase 2 total: ${nutritionFixCount} nutrition fixes`)

  // Summary
  console.log('\n==============================================')
  console.log('Summary:')
  console.log(`  Category fixes: ${categoryFixCount}`)
  console.log(`  Nutrition fixes: ${nutritionFixCount}`)
  console.log(`  Total fixes: ${categoryFixCount + nutritionFixCount}`)
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN — no changes made' : 'LIVE — all changes applied'}`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
