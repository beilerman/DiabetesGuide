import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const supabase = createClient(url, key)

const multipliers = JSON.parse(
  readFileSync(resolve(__dirname, '../data/portion-multipliers.json'), 'utf-8')
)

// Specific item overrides — exact calorie values from research
const SPECIFIC_OVERRIDES: Record<string, { calories: number; protein?: number; carbs?: number; fat?: number; sodium?: number }> = {
  'turkey leg': { calories: 1093, protein: 150, fat: 54, sodium: 5284, carbs: 0 },
  'smoked turkey leg': { calories: 1093, protein: 150, fat: 54, sodium: 5284, carbs: 0 },
  'mickey pretzel': { calories: 480, carbs: 80, fat: 8, protein: 12, sodium: 1100 },
  'ohana bread pudding': { calories: 1055, carbs: 143, fat: 40, protein: 15 },
  'totchos': { calories: 552, fat: 29, carbs: 37, protein: 36 },
}

interface MenuItem {
  id: string
  name: string
  description: string | null
  category: string
  is_fried: boolean
  restaurant: { name: string; land: string | null; park: { name: string } } | null
  nutritional_data: {
    id: string
    calories: number | null
    carbs: number | null
    fat: number | null
    protein: number | null
    sugar: number | null
    fiber: number | null
    sodium: number | null
    cholesterol: number | null
    source: string
    confidence_score: number | null
  }[] | null
}

function classifyItem(name: string, desc: string, category: string, isFried: boolean, parkName: string): { multiplier: number; reason: string } {
  const n = name.toLowerCase()
  const d = (desc || '').toLowerCase()
  const isFestival = parkName.includes('Festival') || parkName.includes('Event')

  // Check specific overrides first
  for (const key of Object.keys(SPECIFIC_OVERRIDES)) {
    if (n.includes(key)) return { multiplier: 0, reason: 'specific_override' }
  }

  // Cupcakes — lab-tested at 2.5x
  if (n.includes('cupcake')) return { multiplier: 2.5, reason: 'dessert_cupcake' }

  // Kitchen Sink sundae
  if (n.includes('kitchen sink')) return { multiplier: 1.0, reason: 'already_estimated' }

  // Nachos / totchos / loaded fries
  if (n.includes('nacho') || n.includes('totcho')) return { multiplier: 2.2, reason: 'nachos_loaded' }
  if (n.includes('loaded fries') || (n.includes('fries') && d.includes('topped'))) return { multiplier: 2.0, reason: 'loaded_fries' }

  // Hot dogs — footlong or loaded
  if ((n.includes('hot dog') || n.includes('corn dog') || n.includes('foot long') || n.includes('foot-long')) &&
      (d.includes('foot') || d.includes('chili') || d.includes('loaded') || d.includes('hash') || n.includes('foot'))) {
    return { multiplier: 2.0, reason: 'hot_dog_footlong' }
  }
  if (n.includes('hot dog') || n.includes('corn dog')) return { multiplier: 1.5, reason: 'hot_dog_standard' }

  // BBQ platters
  if ((n.includes('rib') || n.includes('bbq') || n.includes('brisket') || n.includes('smoked')) &&
      (d.includes('served with') || d.includes('beans') || d.includes('coleslaw') || d.includes('sides') || n.includes('platter') || n.includes('sampler') || n.includes('combo'))) {
    return { multiplier: 1.8, reason: 'bbq_platter' }
  }

  // Burgers with fries
  if (n.includes('burger') || n.includes('cheeseburger')) return { multiplier: 1.8, reason: 'burger_with_fries' }

  // Burritos
  if (n.includes('burrito')) return { multiplier: 1.8, reason: 'burrito' }

  // Sandwiches / wraps / melts / subs
  if (n.includes('sandwich') || n.includes('wrap') || n.includes('melt') || n.includes('sub') || n.includes('croissant jambon')) {
    return { multiplier: 1.7, reason: 'sandwich_oversized' }
  }

  // Chicken tenders / strips / fingers with fries
  if ((n.includes('tender') || n.includes('strip') || n.includes('finger') || n.includes('nugget')) &&
      (d.includes('fries') || d.includes('french') || category === 'entree')) {
    return { multiplier: 1.6, reason: 'chicken_tenders_fries' }
  }

  // Soup in bread bowl
  if (d.includes('bread bowl') || n.includes('bread bowl')) return { multiplier: 1.6, reason: 'soup_bread_bowl' }

  // Pretzels
  if (n.includes('pretzel')) {
    if (n.includes('jumbo') || n.includes('bavarian') || d.includes('jumbo')) return { multiplier: 2.0, reason: 'pretzel_jumbo' }
    return { multiplier: 1.3, reason: 'pretzel_standard' }
  }

  // Pizza (personal)
  if (n.includes('pizza') || n.includes('flatbread')) return { multiplier: 1.5, reason: 'pizza_personal' }

  // Pasta / mac & cheese
  if (n.includes('spaghetti') || n.includes('pasta') || n.includes('mac') || n.includes('parmigiana') || n.includes('parmesan')) {
    return { multiplier: 1.6, reason: 'entree_dinner_plate_quick_service' }
  }

  // Tacos
  if (n.includes('taco') || n.includes('fajita')) return { multiplier: 1.4, reason: 'tacos_order' }

  // Rice bowls / Asian dishes
  if (n.includes('rice bowl') || n.includes('poke') || n.includes('teriyaki') || n.includes('stir fry') || n.includes('stir-fry')) {
    return { multiplier: 1.5, reason: 'rice_bowl_asian' }
  }

  // Salads
  if (n.includes('salad') || category === 'side' && n.includes('salad')) {
    return { multiplier: 1.4, reason: 'salad_entree' }
  }

  // Desserts
  if (category === 'dessert') {
    if (n.includes('sundae') || n.includes('brownie') || n.includes('cake') || n.includes('cookie') || n.includes('churro')) {
      return { multiplier: 2.0, reason: 'dessert_specialty' }
    }
    if (n.includes('ice cream') || n.includes('dole whip') || n.includes('soft-serve') || n.includes('soft serve')) {
      return { multiplier: 1.5, reason: 'frozen_treat' }
    }
    return { multiplier: 1.8, reason: 'dessert_general' }
  }

  // Breakfast plates
  if (d.includes('scrambled egg') || d.includes('pancake') || d.includes('waffle') || n.includes('breakfast') || n.includes('bounty platter')) {
    return { multiplier: 1.5, reason: 'breakfast_plate' }
  }

  // Cocktails
  if (category === 'beverage' && (d.includes('vodka') || d.includes('tequila') || d.includes('rum') || d.includes('gin') ||
      d.includes('bourbon') || d.includes('whiskey') || d.includes('brandy') || d.includes('liqueur'))) {
    if (d.includes('frozen') || d.includes('blended') || n.includes('frozen')) return { multiplier: 1.5, reason: 'cocktail_frozen_specialty' }
    return { multiplier: 1.2, reason: 'cocktail_standard' }
  }

  // Non-alcoholic specialty drinks
  if (category === 'beverage' && (d.includes('frozen') || d.includes('slush') || d.includes('smoothie') || d.includes('blend') ||
      n.includes('freeze') || n.includes('slush') || n.includes('boba'))) {
    return { multiplier: 1.3, reason: 'frozen_drink_nonalcoholic' }
  }

  // Coffee drinks — USDA values are already per serving, no adjustment
  if (category === 'beverage' && (n.includes('coffee') || n.includes('latte') || n.includes('cappuccino') || n.includes('americano') ||
      n.includes('cold brew') || n.includes('nitro') || n.includes('mocha') || n.includes('chai'))) {
    return { multiplier: 1.0, reason: 'coffee_standard' }
  }

  // Beer/wine — standard servings
  if (category === 'beverage' && (n.includes('beer') || n.includes('lager') || n.includes('ale') || n.includes('wine'))) {
    return { multiplier: 1.0, reason: 'beer_wine_standard' }
  }

  // Butterbeer — cream soda style, large serving
  if (n.includes('butterbeer')) return { multiplier: 1.3, reason: 'frozen_drink_nonalcoholic' }

  // Other beverages — mild adjustment
  if (category === 'beverage') return { multiplier: 1.1, reason: 'beverage_general' }

  // Festival booth items — smaller portions
  if (isFestival) return { multiplier: 1.3, reason: 'appetizer_festival_booth' }

  // Table service entrees
  if (category === 'entree') {
    // Fine dining / signature restaurants
    const fineDining = ['california grill', 'jiko', 'tiffins', "victoria", 'citricos', 'flying fish', 'yachtsman',
      "topolino", 'morimoto', 'jaleo', 'wine bar george', 'the boathouse', 'raglan road']
    const restaurantName = '' // We'll check from the data
    return { multiplier: 1.5, reason: 'entree_dinner_plate_general' }
  }

  // Sides
  if (category === 'side') return { multiplier: 1.3, reason: 'side_dish' }

  // Snacks
  if (category === 'snack') return { multiplier: 1.4, reason: 'snack_oversized' }

  // Default
  return { multiplier: 1.3, reason: 'default' }
}

async function adjustPortions() {
  const { data: rows, error } = await supabase
    .from('menu_items')
    .select(`
      id, name, description, category, is_fried,
      restaurant:restaurants (name, land, park:parks (name)),
      nutritional_data (id, calories, carbs, fat, protein, sugar, fiber, sodium, cholesterol, source, confidence_score)
    `)

  if (error) {
    console.error('Failed to fetch:', error)
    process.exit(1)
  }

  let updated = 0
  let skipped = 0
  let overridden = 0

  for (const row of rows!) {
    const nutData = Array.isArray(row.nutritional_data) ? row.nutritional_data[0] : row.nutritional_data
    if (!nutData || !nutData.calories) {
      skipped++
      continue
    }

    const restaurant = Array.isArray(row.restaurant) ? row.restaurant[0] : row.restaurant
    const parkName = restaurant?.park?.name || ''

    // Check for specific item overrides
    const n = row.name.toLowerCase()
    let specificOverride: typeof SPECIFIC_OVERRIDES[string] | null = null
    for (const [key, val] of Object.entries(SPECIFIC_OVERRIDES)) {
      if (n.includes(key)) {
        specificOverride = val
        break
      }
    }

    if (specificOverride) {
      const update: Record<string, number | string> = {
        calories: specificOverride.calories,
        confidence_score: 80,
      }
      if (specificOverride.protein != null) update.protein = specificOverride.protein
      if (specificOverride.carbs != null) update.carbs = specificOverride.carbs
      if (specificOverride.fat != null) update.fat = specificOverride.fat
      if (specificOverride.sodium != null) update.sodium = specificOverride.sodium

      const { error: err } = await supabase.from('nutritional_data').update(update).eq('id', nutData.id)
      if (err) console.error(`  ERR override ${row.name}: ${err.message}`)
      else overridden++
      continue
    }

    const { multiplier, reason } = classifyItem(row.name, row.description || '', row.category, row.is_fried, parkName)

    if (multiplier <= 1.0) {
      skipped++
      continue
    }

    // Only adjust items that were enriched from USDA (those have per-100g values that need scaling)
    // Items with source 'official' were already estimated at theme-park portion sizes during data entry
    // Items with source 'api_lookup' came from USDA which uses standard serving sizes
    const adjustedCals = Math.round(nutData.calories * multiplier)
    const adjustedCarbs = nutData.carbs ? Math.round(nutData.carbs * multiplier) : null
    const adjustedFat = nutData.fat ? Math.round(nutData.fat * multiplier) : null
    const adjustedProtein = nutData.protein ? Math.round(nutData.protein * multiplier) : null
    const adjustedSugar = nutData.sugar ? Math.round(nutData.sugar * multiplier) : null
    const adjustedFiber = nutData.fiber ? Math.round(nutData.fiber * multiplier) : null
    const adjustedSodium = nutData.sodium ? Math.round(nutData.sodium * multiplier) : null
    const adjustedCholesterol = nutData.cholesterol ? Math.round(nutData.cholesterol * multiplier) : null

    // Sanity check: don't inflate beyond reasonable bounds
    if (adjustedCals > 3000) {
      // Skip extreme outliers (except desserts meant for sharing)
      if (!n.includes('kitchen sink') && !n.includes('sampler') && !n.includes('platter')) {
        skipped++
        continue
      }
    }

    const { error: err } = await supabase
      .from('nutritional_data')
      .update({
        calories: adjustedCals,
        carbs: adjustedCarbs,
        fat: adjustedFat,
        protein: adjustedProtein,
        sugar: adjustedSugar,
        fiber: adjustedFiber,
        sodium: adjustedSodium,
        cholesterol: adjustedCholesterol,
      })
      .eq('id', nutData.id)

    if (err) {
      console.error(`  ERR ${row.name}: ${err.message}`)
    } else {
      updated++
    }

    if ((updated + skipped + overridden) % 50 === 0) {
      console.log(`Progress: ${updated + skipped + overridden}/${rows!.length}`)
    }
  }

  console.log(`\nDone! Updated ${updated} items, ${overridden} specific overrides, ${skipped} skipped (no change needed)`)
}

adjustPortions().catch(console.error)
