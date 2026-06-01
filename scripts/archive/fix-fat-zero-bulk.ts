/**
 * Bulk fix for all items with fat=0 that clearly should have fat.
 * Uses keyword matching to identify fried, cheesy, buttery items.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const envPath = resolve(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const envVars: Record<string, string> = {}
envContent.split('\n').forEach(line => {
  const trimmed = line.trim()
  if (trimmed && !trimmed.startsWith('#')) {
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) envVars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
  }
})

const supabase = createClient(
  envVars['SUPABASE_URL'] || process.env.SUPABASE_URL!,
  envVars['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Keywords that indicate an item should have significant fat
const FATTY_KEYWORDS = [
  'fried', 'crispy', 'battered', 'tempura', 'panko',
  'cheese', 'cheddar', 'mozzarella', 'parmesan', 'gouda', 'brie', 'gruyere', 'oaxaca', 'queso',
  'butter', 'buttery', 'buttermilk', 'meunière',
  'bacon', 'sausage', 'chorizo', 'prosciutto', 'pancetta',
  'cream', 'creamy', 'alfredo', 'carbonara',
  'donut', 'doughnut', 'churro', 'funnel cake',
  'burger', 'cheeseburger',
  'fries', 'chips', 'tots', 'poutine',
  'croissant', 'danish', 'pastry', 'puff',
  'brownie', 'cookie', 'cake', 'cupcake',
  'ice cream', 'gelato', 'sundae',
  'wings', 'nuggets',
  'nachos', 'loaded',
  'grilled cheese', 'quesadilla',
  'ranch', 'aioli', 'mayo', 'mayonnaise',
]

// Estimate fat based on food type
function estimateFat(name: string, desc: string, calories: number, category: string): number {
  const text = `${name} ${desc}`.toLowerCase()

  // Fried items: ~40-50% of calories from fat
  if (/fried|crispy|battered|tempura|panko/.test(text)) {
    return Math.round((calories * 0.45) / 9)
  }

  // Cheese-heavy items: ~35-45% of calories from fat
  if (/cheese|cheddar|mozzarella|gouda|quesadilla|nachos/.test(text)) {
    return Math.round((calories * 0.40) / 9)
  }

  // Buttery/cream items: ~40-50% of calories from fat
  if (/butter|cream|alfredo|carbonara|meunière/.test(text)) {
    return Math.round((calories * 0.45) / 9)
  }

  // Bacon/sausage: ~50-60% of calories from fat
  if (/bacon|sausage|chorizo|pancetta/.test(text)) {
    return Math.round((calories * 0.50) / 9)
  }

  // Donuts/pastries: ~40-50% of calories from fat
  if (/donut|doughnut|croissant|danish|pastry|churro/.test(text)) {
    return Math.round((calories * 0.45) / 9)
  }

  // Burgers: ~40-45% of calories from fat
  if (/burger/.test(text)) {
    return Math.round((calories * 0.42) / 9)
  }

  // Desserts: ~35-45% of calories from fat
  if (category === 'dessert' || /brownie|cookie|cake|cupcake|ice cream|gelato|sundae/.test(text)) {
    return Math.round((calories * 0.40) / 9)
  }

  // Wings/nuggets: ~50% of calories from fat
  if (/wings|nuggets/.test(text)) {
    return Math.round((calories * 0.50) / 9)
  }

  // Fries/tots/chips: ~45% of calories from fat
  if (/fries|chips|tots|poutine/.test(text)) {
    return Math.round((calories * 0.45) / 9)
  }

  // Default for fatty items: ~35% of calories from fat
  return Math.round((calories * 0.35) / 9)
}

// Estimate protein if it's also 0
function estimateProtein(name: string, desc: string, calories: number, category: string): number {
  const text = `${name} ${desc}`.toLowerCase()

  // Meat items: ~25-35% of calories from protein
  if (/chicken|beef|pork|steak|burger|bacon|sausage|wings|nuggets|fish|shrimp|lobster|crab/.test(text)) {
    return Math.round((calories * 0.25) / 4)
  }

  // Cheese items: ~20% of calories from protein
  if (/cheese/.test(text)) {
    return Math.round((calories * 0.18) / 4)
  }

  // Eggs: ~30% of calories from protein
  if (/egg/.test(text)) {
    return Math.round((calories * 0.30) / 4)
  }

  // Desserts/pastries: low protein ~5%
  if (category === 'dessert' || /donut|cake|cookie|pastry|churro/.test(text)) {
    return Math.round((calories * 0.05) / 4)
  }

  // Default: ~15%
  return Math.round((calories * 0.12) / 4)
}

async function fixFatZeroItems() {
  console.log('Finding items with fat=0 that should have fat...\n')

  // Get all items with fat=0 and calories > 50
  const { data: items, error } = await supabase
    .from('nutritional_data')
    .select(`
      id,
      calories,
      carbs,
      fat,
      protein,
      sugar,
      fiber,
      sodium,
      menu_item:menu_items(
        name,
        description,
        category
      )
    `)
    .eq('fat', 0)
    .gt('calories', 50)
    .limit(500)

  if (error) {
    console.error('Query error:', error)
    return
  }

  console.log(`Found ${items?.length || 0} items with fat=0 and calories > 50\n`)

  let updated = 0
  let skipped = 0

  for (const item of items || []) {
    const mi = Array.isArray(item.menu_item) ? item.menu_item[0] : item.menu_item
    if (!mi) continue

    const name = mi.name || ''
    const desc = mi.description || ''
    const category = mi.category || ''
    const text = `${name} ${desc}`.toLowerCase()

    // Check if this item should have fat based on keywords
    const hasFattyKeyword = FATTY_KEYWORDS.some(kw => text.includes(kw))

    if (!hasFattyKeyword) {
      // Skip items that don't match fatty keywords
      continue
    }

    // Skip alcoholic beverages (caloric math issues expected)
    if (/beer|wine|ale|lager|cocktail|margarita|martini|whiskey|vodka|rum|bourbon/i.test(text)) {
      continue
    }

    // Estimate fat and protein
    const estimatedFat = estimateFat(name, desc, item.calories, category)
    const estimatedProtein = item.protein === 0 ? estimateProtein(name, desc, item.calories, category) : item.protein

    // Calculate remaining carbs (if we're adding fat, carbs should decrease proportionally)
    // But keep carbs as-is for now since they might be correct

    console.log(`Fixing: ${name}`)
    console.log(`  Old: ${item.calories} cal, ${item.carbs}g C, 0g F, ${item.protein}g P`)
    console.log(`  New: ${item.calories} cal, ${item.carbs}g C, ${estimatedFat}g F, ${estimatedProtein}g P`)

    const { error: updateError } = await supabase
      .from('nutritional_data')
      .update({
        fat: estimatedFat,
        protein: estimatedProtein,
        confidence_score: 45,
        source: 'crowdsourced',
      })
      .eq('id', item.id)

    if (updateError) {
      console.log(`  ERROR: ${updateError.message}`)
    } else {
      console.log(`  SUCCESS`)
      updated++
    }
  }

  console.log('\n=== BULK FAT FIX COMPLETE ===')
  console.log(`Updated: ${updated}`)
  console.log(`Skipped: ${skipped}`)
}

fixFatZeroItems().catch(console.error)
