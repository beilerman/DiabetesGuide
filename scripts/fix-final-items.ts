/**
 * Final fixes:
 * 1. Plain coffee/espresso items - set to ~2-5 cal with high confidence
 * 2. Plain tea items - set to ~2 cal with high confidence
 * 3. Items with null nutrition - investigate and fix
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

async function fixCoffeeAndTea() {
  console.log('Fixing plain coffee and tea items...\n')

  // Standard nutrition for black coffee (8oz)
  const blackCoffee = {
    calories: 2,
    carbs: 0,
    fat: 0,
    protein: 0,
    sugar: 0,
    fiber: 0,
    sodium: 5,
    confidence_score: 90,
    source: 'crowdsourced'
  }

  // Standard nutrition for espresso (double shot)
  const espresso = {
    calories: 5,
    carbs: 0,
    fat: 0,
    protein: 0,
    sugar: 0,
    fiber: 0,
    sodium: 5,
    confidence_score: 90,
    source: 'crowdsourced'
  }

  // Standard nutrition for plain tea
  const plainTea = {
    calories: 2,
    carbs: 0,
    fat: 0,
    protein: 0,
    sugar: 0,
    fiber: 0,
    sodium: 0,
    confidence_score: 90,
    source: 'crowdsourced'
  }

  // Fix plain "Coffee" items
  const { data: coffeeItems } = await supabase
    .from('menu_items')
    .select('id, name')
    .or('name.eq.Coffee,name.ilike.Hot Coffee,name.ilike.Brewed Coffee%')
    .limit(100)

  let coffeeFixed = 0
  for (const item of coffeeItems || []) {
    const { data: nutData } = await supabase
      .from('nutritional_data')
      .select('id, calories')
      .eq('menu_item_id', item.id)
      .single()

    if (nutData && (nutData.calories === 0 || nutData.calories === null)) {
      await supabase
        .from('nutritional_data')
        .update(blackCoffee)
        .eq('id', nutData.id)
      coffeeFixed++
    }
  }
  console.log(`Fixed ${coffeeFixed} plain coffee items`)

  // Fix espresso items
  const { data: espressoItems } = await supabase
    .from('menu_items')
    .select('id, name')
    .ilike('name', '%Espresso%')
    .limit(100)

  let espressoFixed = 0
  for (const item of espressoItems || []) {
    const { data: nutData } = await supabase
      .from('nutritional_data')
      .select('id, calories')
      .eq('menu_item_id', item.id)
      .single()

    if (nutData && (nutData.calories === 0 || nutData.calories === null)) {
      await supabase
        .from('nutritional_data')
        .update(espresso)
        .eq('id', nutData.id)
      espressoFixed++
    }
  }
  console.log(`Fixed ${espressoFixed} espresso items`)

  // Fix plain tea items
  const { data: teaItems } = await supabase
    .from('menu_items')
    .select('id, name')
    .or('name.eq.Tea,name.eq.Hot Tea,name.ilike.%English Breakfast Tea%,name.ilike.%Earl Grey%,name.ilike.%Green Tea%')
    .limit(100)

  let teaFixed = 0
  for (const item of teaItems || []) {
    const { data: nutData } = await supabase
      .from('nutritional_data')
      .select('id, calories')
      .eq('menu_item_id', item.id)
      .single()

    if (nutData && (nutData.calories === 0 || nutData.calories <= 2)) {
      await supabase
        .from('nutritional_data')
        .update(plainTea)
        .eq('id', nutData.id)
      teaFixed++
    }
  }
  console.log(`Fixed ${teaFixed} plain tea items`)

  // Fix items with null calories
  console.log('\nFinding items with null nutrition...')

  const { data: nullItems } = await supabase
    .from('nutritional_data')
    .select(`
      id,
      calories,
      menu_item:menu_items(name, description, category)
    `)
    .is('calories', null)
    .limit(50)

  console.log(`Found ${nullItems?.length || 0} items with null calories`)

  for (const item of nullItems || []) {
    const mi = Array.isArray(item.menu_item) ? item.menu_item[0] : item.menu_item
    if (!mi) continue

    const name = mi.name?.toLowerCase() || ''
    const desc = mi.description?.toLowerCase() || ''

    // Skip if it's a beverage we can't estimate
    if (/wine|on tap|sabine/.test(name)) {
      console.log(`  Skipping (wine/on tap): ${mi.name}`)
      continue
    }

    // For San Benedetto (Italian mineral water brand)
    if (/san benedetto/i.test(name)) {
      await supabase
        .from('nutritional_data')
        .update({
          calories: 0, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 10,
          confidence_score: 90, source: 'crowdsourced'
        })
        .eq('id', item.id)
      console.log(`  Fixed: ${mi.name} (mineral water = 0 cal)`)
      continue
    }

    console.log(`  TODO: ${mi.name} - ${mi.description?.slice(0, 50)}`)
  }

  console.log('\n=== FINAL FIXES COMPLETE ===')
}

fixCoffeeAndTea().catch(console.error)
