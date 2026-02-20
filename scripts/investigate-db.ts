/**
 * Deep investigation of database content
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
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

const sb = createClient(envVars['SUPABASE_URL'], envVars['SUPABASE_SERVICE_ROLE_KEY'])

async function fetchAll(table: string, select: string = '*'): Promise<any[]> {
  const all: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from(table).select(select).range(from, from + 999)
    if (error) { console.error(`Error fetching ${table}:`, error.message); break }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

async function main() {
  console.log('='.repeat(70))
  console.log('DEEP DATABASE INVESTIGATION')
  console.log('='.repeat(70))
  console.log()

  // Fetch all data
  const parks = await fetchAll('parks')
  const restaurants = await fetchAll('restaurants', '*, park:parks(name)')
  const menuItems = await fetchAll('menu_items', '*, restaurant:restaurants(name, park:parks(name))')
  const nutritionalData = await fetchAll('nutritional_data')

  // Build lookups
  const nutByItem: Record<string, any> = {}
  for (const n of nutritionalData) {
    nutByItem[n.menu_item_id] = n
  }

  // ─── NUTRITION COVERAGE ───
  console.log('--- NUTRITION COVERAGE ---\n')

  const withCalories = nutritionalData.filter(n => n.calories !== null && n.calories > 0)
  const nullCalories = nutritionalData.filter(n => n.calories === null || n.calories === 0)

  console.log(`Items with calories > 0:     ${withCalories.length} (${(withCalories.length / nutritionalData.length * 100).toFixed(1)}%)`)
  console.log(`Items with null/0 calories:  ${nullCalories.length} (${(nullCalories.length / nutritionalData.length * 100).toFixed(1)}%)`)
  console.log()

  // ─── SOURCE DISTRIBUTION ───
  console.log('--- SOURCE DISTRIBUTION ---\n')

  const bySource: Record<string, number> = {}
  for (const n of nutritionalData) {
    const src = n.source || 'null'
    bySource[src] = (bySource[src] || 0) + 1
  }

  for (const [src, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    const pct = (count / nutritionalData.length * 100).toFixed(1)
    console.log(`  ${src.padEnd(15)} ${String(count).padStart(5)} (${pct}%)`)
  }
  console.log()

  // ─── CONFIDENCE SCORE DISTRIBUTION ───
  console.log('--- CONFIDENCE SCORE DISTRIBUTION ---\n')

  const byConf: Record<string, number> = {}
  for (const n of nutritionalData) {
    const conf = n.confidence_score?.toString() || 'null'
    byConf[conf] = (byConf[conf] || 0) + 1
  }

  for (const [conf, count] of Object.entries(byConf).sort((a, b) => Number(b[0] || 0) - Number(a[0] || 0))) {
    const pct = (count / nutritionalData.length * 100).toFixed(1)
    console.log(`  Score ${conf.padStart(4)}: ${String(count).padStart(5)} (${pct}%)`)
  }
  console.log()

  // ─── NULL CALORIE ANALYSIS ───
  console.log('--- NULL/ZERO CALORIE ITEMS ---\n')

  // Skip water, coffee, tea, etc.
  const skipWords = ['water', 'coffee', 'tea', 'espresso', 'americano', 'black tea', 'green tea', 'iced tea', 'unsweetened']
  const realNull = menuItems.filter(item => {
    const nut = nutByItem[item.id]
    if (!nut || (nut.calories !== null && nut.calories > 0)) return false
    const name = (item.name || '').toLowerCase()
    return !skipWords.some(s => name.includes(s))
  })

  console.log(`Items with null/0 calories (excluding water/coffee/tea): ${realNull.length}\n`)

  // Categorize by food type
  const categories: Record<string, any[]> = {
    'Alcoholic drinks': [],
    'Sodas/soft drinks': [],
    'Misc beverages': [],
    'Foods needing estimation': [],
  }

  for (const item of realNull) {
    const name = (item.name || '').toLowerCase()
    const desc = (item.description || '').toLowerCase()

    if (/beer|wine|cocktail|margarita|sangria|whiskey|bourbon|vodka|rum|tequila|gin|ale|lager|ipa|stout|porter|cider|mimosa|bellini|spritz|\d+\s*%|\(21\+\)/.test(name)) {
      categories['Alcoholic drinks'].push(item)
    } else if (/soda|cola|sprite|fanta|root beer|dr pepper|lemonade|ginger ale|tonic/.test(name)) {
      categories['Sodas/soft drinks'].push(item)
    } else if (/juice|smoothie|slush|frozen|shake|float|punch|refresher/.test(name)) {
      categories['Misc beverages'].push(item)
    } else {
      categories['Foods needing estimation'].push(item)
    }
  }

  for (const [cat, items] of Object.entries(categories)) {
    console.log(`${cat}: ${items.length}`)
    if (items.length <= 10) {
      items.forEach(i => console.log(`  - ${i.name} @ ${i.restaurant?.name}`))
    } else {
      items.slice(0, 5).forEach(i => console.log(`  - ${i.name} @ ${i.restaurant?.name}`))
      console.log(`  ... and ${items.length - 5} more`)
    }
    console.log()
  }

  // ─── ITEMS WITH DESCRIPTIONS BUT NO NUTRITION ───
  console.log('--- ITEMS WITH DESCRIPTIONS BUT NO NUTRITION ---\n')

  const withDescNoNut = menuItems.filter(item => {
    const nut = nutByItem[item.id]
    const hasDesc = item.description && item.description.trim().length > 0
    const noNut = !nut || nut.calories === null || nut.calories === 0
    return hasDesc && noNut
  })

  // Filter out water/coffee/tea
  const needsAI = withDescNoNut.filter(item => {
    const name = (item.name || '').toLowerCase()
    return !skipWords.some(s => name.includes(s))
  })

  console.log(`Items with descriptions but no nutrition: ${needsAI.length}`)
  console.log(`(These could be processed by AI nutrition estimation)\n`)

  // Sample
  if (needsAI.length > 0) {
    console.log('Sample items:')
    needsAI.slice(0, 10).forEach(item => {
      console.log(`  - ${item.name}`)
      console.log(`    Desc: ${item.description?.slice(0, 80)}...`)
    })
  }
  console.log()

  // ─── ITEMS WITHOUT DESCRIPTIONS ───
  console.log('--- ITEMS WITHOUT DESCRIPTIONS ---\n')

  const noDesc = menuItems.filter(item => !item.description || item.description.trim().length === 0)
  console.log(`Items without descriptions: ${noDesc.length}`)

  // Group by category
  const noDescByCat: Record<string, number> = {}
  for (const item of noDesc) {
    const cat = item.category || 'null'
    noDescByCat[cat] = (noDescByCat[cat] || 0) + 1
  }

  for (const [cat, count] of Object.entries(noDescByCat).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`)
  }
  console.log()

  // ─── PHOTO COVERAGE ───
  console.log('--- PHOTO COVERAGE ---\n')

  const withPhotos = menuItems.filter(item => item.photo_url && item.photo_url.trim().length > 0)
  console.log(`Items with photos: ${withPhotos.length} (${(withPhotos.length / menuItems.length * 100).toFixed(1)}%)`)
  console.log(`Items without photos: ${menuItems.length - withPhotos.length}`)
  console.log()

  // ─── ALLERGEN COVERAGE ───
  console.log('--- ALLERGEN COVERAGE ---\n')

  const allergens = await fetchAll('allergens')
  const itemsWithAllergens = new Set(allergens.map(a => a.menu_item_id))
  console.log(`Items with allergen data: ${itemsWithAllergens.size} (${(itemsWithAllergens.size / menuItems.length * 100).toFixed(1)}%)`)
  console.log(`Total allergen records: ${allergens.length}`)

  // Allergen types
  const allergenTypes: Record<string, number> = {}
  for (const a of allergens) {
    allergenTypes[a.allergen_type] = (allergenTypes[a.allergen_type] || 0) + 1
  }

  console.log('\nAllergen types:')
  for (const [type, count] of Object.entries(allergenTypes).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`)
  }
  console.log()

  // ─── SUMMARY ───
  console.log('='.repeat(70))
  console.log('SUMMARY')
  console.log('='.repeat(70))
  console.log(`Total menu items: ${menuItems.length}`)
  console.log(`With nutrition (calories > 0): ${withCalories.length} (${(withCalories.length / menuItems.length * 100).toFixed(1)}%)`)
  console.log(`With descriptions: ${menuItems.length - noDesc.length} (${((menuItems.length - noDesc.length) / menuItems.length * 100).toFixed(1)}%)`)
  console.log(`With photos: ${withPhotos.length} (${(withPhotos.length / menuItems.length * 100).toFixed(1)}%)`)
  console.log(`With allergens: ${itemsWithAllergens.size} (${(itemsWithAllergens.size / menuItems.length * 100).toFixed(1)}%)`)
  console.log()
  console.log(`Items ready for AI estimation: ${needsAI.length}`)
  console.log(`Foods still needing nutrition (no description): ${categories['Foods needing estimation'].length}`)
}

main().catch(console.error)
