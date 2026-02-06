/**
 * Remove non-food items and water bottles/cups from the database.
 * These aren't useful for a diabetes nutrition guide.
 *
 * Usage: npx tsx scripts/remove-non-food-items.ts [--dry-run]
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local
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

const url = envVars['SUPABASE_URL'] || process.env.SUPABASE_URL
const key = envVars['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

// Patterns for non-food items and water
const REMOVAL_PATTERNS = [
  // Water products
  /^water$/i,
  /^ice water$/i,
  /bottled water/i,
  /sparkling water/i,
  /mineral water/i,
  /spring water/i,
  /courtesy cup of water/i,
  /cup of water/i,
  /small water/i,
  /^h2o/i,
  /^evian/i,
  /^perrier/i,
  /^dasani/i,
  /^aquafina/i,
  /^smart ?water/i,
  /^fiji water/i,
  /^gillywater/i,  // Harry Potter themed water
  /san benedetto.*water/i,
  /topo chico/i,
  /italian mineral water/i,

  // Non-food merchandise
  /\bponcho\b/i,
  /\brain poncho\b/i,
  /novelty straw/i,
  /souvenir.*straw/i,
  /^glow cube$/i,  // Only if the entire item is just a glow cube
]

// Exact matches for items that should be removed
const EXACT_REMOVALS = [
  'Poncho Adult',
  'Poncho Child',
  'Small Water',
  'Gillywater',
  'H2O+ Premium Water',
  'San Benedetto Water',
  'Italian Mineral Water',
  'Evian Natural Spring Water',
  'Perrier Sparkling Mineral Water',
  'Perrier Water',
  'Topo Chico',
  'Courtesy Cup of Water',
]

function shouldRemove(name: string): boolean {
  // Check exact matches first
  if (EXACT_REMOVALS.some(exact => exact.toLowerCase() === name.toLowerCase())) {
    return true
  }

  // Check patterns
  return REMOVAL_PATTERNS.some(pattern => pattern.test(name))
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  if (dryRun) {
    console.log('=== DRY RUN MODE - No changes will be made ===\n')
  }

  console.log('Fetching all menu items...')

  // Fetch all menu items
  let allItems: any[] = []
  let from = 0
  const batchSize = 1000

  while (true) {
    const { data: batch, error } = await supabase
      .from('menu_items')
      .select('id, name, restaurant:restaurants(name, park:parks(name))')
      .range(from, from + batchSize - 1)

    if (error) {
      console.error('Fetch error:', error)
      break
    }
    if (!batch?.length) break
    allItems = allItems.concat(batch)
    if (batch.length < batchSize) break
    from += batchSize
  }

  console.log(`Found ${allItems.length} total menu items`)

  // Find items to remove
  const toRemove = allItems.filter(item => shouldRemove(item.name))

  console.log(`\nItems to remove: ${toRemove.length}\n`)

  // Group by park for display
  const byPark: Record<string, any[]> = {}
  for (const item of toRemove) {
    const rest = Array.isArray(item.restaurant) ? item.restaurant[0] : item.restaurant
    const park = rest?.park
    const parkName = Array.isArray(park) ? park[0]?.name : park?.name || 'Unknown'
    if (!byPark[parkName]) byPark[parkName] = []
    byPark[parkName].push({
      name: item.name,
      restaurant: rest?.name,
      id: item.id,
    })
  }

  for (const [park, items] of Object.entries(byPark).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`\n${park}:`)
    for (const item of items) {
      console.log(`  - ${item.name} @ ${item.restaurant}`)
    }
  }

  if (dryRun) {
    console.log('\n=== DRY RUN COMPLETE ===')
    console.log('Run without --dry-run to actually delete these items.')
    return
  }

  // Delete items (nutritional_data and allergens will cascade)
  console.log('\nDeleting items...')

  let deleted = 0
  let errors = 0

  for (const item of toRemove) {
    // First delete from nutritional_data
    const { error: nutError } = await supabase
      .from('nutritional_data')
      .delete()
      .eq('menu_item_id', item.id)

    if (nutError) {
      console.error(`Error deleting nutrition for ${item.name}:`, nutError.message)
    }

    // Then delete from allergens
    const { error: allergenError } = await supabase
      .from('allergens')
      .delete()
      .eq('menu_item_id', item.id)

    if (allergenError) {
      console.error(`Error deleting allergens for ${item.name}:`, allergenError.message)
    }

    // Finally delete the menu item
    const { error } = await supabase
      .from('menu_items')
      .delete()
      .eq('id', item.id)

    if (error) {
      console.error(`Error deleting ${item.name}:`, error.message)
      errors++
    } else {
      deleted++
    }
  }

  console.log('\n=== Removal Complete ===')
  console.log(`Deleted: ${deleted}`)
  console.log(`Errors: ${errors}`)
}

main().catch(console.error)
