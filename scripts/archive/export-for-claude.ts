/**
 * Export items needing nutrition for Claude to estimate.
 * Outputs to data/claude-nutrition-input.json
 *
 * Usage: npx tsx scripts/export-for-claude.ts [--limit=N]
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, readFileSync } from 'fs'
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

// Skip items that are legitimately zero calories
const ZERO_CAL_PATTERNS = [
  /^water$/i,
  /^ice water$/i,
  /bottled water/i,
  /sparkling water/i,
  /^coffee$/i,
  /^brewed coffee$/i,
  /^hot tea$/i,
  /^iced tea$/i,
  /unsweetened.*tea/i,
  /^tea$/i,
  /^espresso$/i,
  /^black coffee$/i,
  /^diet /i,
  /sugar.?free/i,
  /zero.?calorie/i,
  /^evian$/i,
  /^perrier$/i,
  /^dasani$/i,
  /^smart ?water$/i,
]

function isZeroCal(name: string): boolean {
  return ZERO_CAL_PATTERNS.some(p => p.test(name))
}

interface ExportItem {
  id: string
  menu_item_id: string
  name: string
  description: string | null
  category: string
  is_fried: boolean
  restaurant: string
  park: string
}

async function main() {
  console.log('Fetching items needing nutrition estimates...')

  // Fetch all items with null/zero calories
  let allRows: any[] = []
  let from = 0
  const batchSize = 1000

  while (true) {
    const { data: batch, error } = await supabase
      .from('nutritional_data')
      .select(`
        id,
        menu_item_id,
        calories,
        menu_item:menu_items(
          id,
          name,
          description,
          category,
          is_fried,
          restaurant:restaurants(
            name,
            park:parks(name)
          )
        )
      `)
      .or('calories.is.null,calories.eq.0')
      .range(from, from + batchSize - 1)

    if (error) {
      console.error('Fetch error:', error)
      break
    }
    if (!batch?.length) break
    allRows = allRows.concat(batch)
    if (batch.length < batchSize) break
    from += batchSize
  }

  console.log(`Found ${allRows.length} items with null/zero calories`)

  // Transform and filter
  const items: ExportItem[] = []
  for (const row of allRows) {
    const mi = Array.isArray(row.menu_item) ? row.menu_item[0] : row.menu_item
    if (!mi) continue

    const name = mi.name || ''
    if (isZeroCal(name)) continue

    const rest = Array.isArray(mi.restaurant) ? mi.restaurant[0] : mi.restaurant
    const park = rest?.park
    const parkName = Array.isArray(park) ? park[0]?.name : park?.name

    items.push({
      id: row.id,
      menu_item_id: mi.id,
      name: name,
      description: mi.description || null,
      category: mi.category || 'unknown',
      is_fried: mi.is_fried || false,
      restaurant: rest?.name || 'Unknown',
      park: parkName || 'Unknown',
    })
  }

  // Sort by park, restaurant, name
  items.sort((a, b) => {
    if (a.park !== b.park) return a.park.localeCompare(b.park)
    if (a.restaurant !== b.restaurant) return a.restaurant.localeCompare(b.restaurant)
    return a.name.localeCompare(b.name)
  })

  // Check for --limit flag
  const limitArg = process.argv.find(arg => arg.startsWith('--limit='))
  let output = items
  if (limitArg) {
    const limit = parseInt(limitArg.split('=')[1], 10)
    if (limit > 0) {
      output = items.slice(0, limit)
      console.log(`Limiting to ${limit} items`)
    }
  }

  // Write output
  const outPath = resolve(__dirname, '..', 'data', 'claude-nutrition-input.json')
  writeFileSync(outPath, JSON.stringify(output, null, 2))

  console.log(`\nExported ${output.length} items to data/claude-nutrition-input.json`)
  console.log('\nBreakdown by park:')

  const byPark: Record<string, number> = {}
  for (const item of output) {
    byPark[item.park] = (byPark[item.park] || 0) + 1
  }
  Object.entries(byPark)
    .sort((a, b) => b[1] - a[1])
    .forEach(([park, count]) => console.log(`  ${park}: ${count}`))

  console.log('\nBreakdown by category:')
  const byCat: Record<string, number> = {}
  for (const item of output) {
    byCat[item.category] = (byCat[item.category] || 0) + 1
  }
  Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => console.log(`  ${cat}: ${count}`))

  console.log('\n--- Next Steps ---')
  console.log('1. Read data/claude-nutrition-input.json (or batches of it)')
  console.log('2. Ask Claude to estimate nutrition for each item')
  console.log('3. Save Claude\'s estimates to data/claude-nutrition-output.json')
  console.log('4. Run: npx tsx scripts/import-claude-estimates.ts')
}

main().catch(console.error)
