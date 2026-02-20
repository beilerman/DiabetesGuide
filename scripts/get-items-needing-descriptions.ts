/**
 * Get items with null calories and no description for web research
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

const url = envVars['SUPABASE_URL'] || process.env.SUPABASE_URL
const key = envVars['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

async function main() {
  // Fetch items with null calories and no description
  let allItems: any[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase.from('nutritional_data')
      .select(`
        id,
        menu_item_id,
        calories,
        menu_item:menu_items(
          id,
          name,
          category,
          description,
          restaurant:restaurants(name, park:parks(name))
        )
      `)
      .is('calories', null)
      .range(offset, offset + 999)

    if (error) {
      console.error('Error:', error)
      break
    }
    if (!data?.length) break
    allItems = allItems.concat(data)
    if (data.length < 1000) break
    offset += 1000
  }

  // Filter to items without descriptions, excluding water/coffee/tea
  const skipWords = ['water', 'coffee', 'tea', 'espresso', 'americano', 'cappuccino', 'spirits', 'evian', 'perrier']
  const noDesc = allItems.filter(item => {
    const mi = Array.isArray(item.menu_item) ? item.menu_item[0] : item.menu_item
    if (!mi) return false
    const name = (mi.name || '').toLowerCase()
    if (skipWords.some(s => name.includes(s))) return false
    return !mi.description || mi.description.trim().length === 0
  })

  // Get unique item names with their context
  const uniqueItems = new Map<string, any>()
  for (const item of noDesc) {
    const mi = Array.isArray(item.menu_item) ? item.menu_item[0] : item.menu_item
    if (!mi) continue
    const name = mi.name
    if (!uniqueItems.has(name)) {
      const rest = Array.isArray(mi.restaurant) ? mi.restaurant[0] : mi.restaurant
      const park = rest?.park
      const parkName = Array.isArray(park) ? park[0]?.name : park?.name
      uniqueItems.set(name, {
        name,
        category: mi.category,
        restaurant: rest?.name,
        park: parkName,
        menu_item_id: mi.id,
        nutrition_id: item.id,
      })
    }
  }

  // Sort by name
  const sorted = [...uniqueItems.values()].sort((a, b) => a.name.localeCompare(b.name))

  console.log(`Found ${sorted.length} unique items needing descriptions`)
  console.log('')
  console.log('Items by park:')

  // Group by park
  const byPark: Record<string, any[]> = {}
  for (const item of sorted) {
    const park = item.park || 'Unknown'
    if (!byPark[park]) byPark[park] = []
    byPark[park].push(item)
  }

  for (const [park, items] of Object.entries(byPark).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n## ${park} (${items.length} items)`)
    for (const item of items.slice(0, 20)) {
      console.log(`- ${item.name} [${item.category}] @ ${item.restaurant}`)
    }
    if (items.length > 20) {
      console.log(`  ... and ${items.length - 20} more`)
    }
  }

  // Output as JSON for processing
  const fs = await import('fs')
  fs.writeFileSync('data/items-needing-descriptions.json', JSON.stringify(sorted, null, 2))
  console.log('\nSaved to data/items-needing-descriptions.json')
}

main()
