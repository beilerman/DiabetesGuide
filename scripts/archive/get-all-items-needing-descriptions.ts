/**
 * Get ALL items without descriptions (regardless of nutrition status)
 * This helps identify items that could benefit from descriptions for:
 * 1. Better user experience (users can read what the item is)
 * 2. Future AI estimation if nutrition data is missing
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
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

const url = envVars['SUPABASE_URL'] || process.env.SUPABASE_URL!
const key = envVars['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, key)

async function fetchAll(table: string, select: string): Promise<any[]> {
  const all: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999)
    if (error) { console.error(`Error fetching ${table}:`, error.message); break }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

async function main() {
  console.log('Fetching all menu items...')

  const items = await fetchAll('menu_items', `
    id,
    name,
    description,
    category,
    restaurant:restaurants(name, park:parks(name))
  `)

  // Filter to items without descriptions
  const noDesc = items.filter(item => !item.description || item.description.trim().length === 0)

  console.log(`\nTotal items: ${items.length}`)
  console.log(`Items without descriptions: ${noDesc.length}`)

  // Skip obvious items that don't need descriptions
  const skipWords = ['water', 'bottled water', 'coffee', 'tea', 'espresso', 'americano', 'cappuccino', 'spirits', 'evian', 'perrier']

  const needsDesc = noDesc.filter(item => {
    const name = (item.name || '').toLowerCase()
    return !skipWords.some(s => name.includes(s))
  })

  console.log(`Items needing descriptions (excluding water/coffee/tea): ${needsDesc.length}`)

  // Get unique names
  const uniqueNames = new Map<string, any>()
  for (const item of needsDesc) {
    const name = item.name
    if (!uniqueNames.has(name)) {
      const rest = Array.isArray(item.restaurant) ? item.restaurant[0] : item.restaurant
      const park = rest?.park
      const parkName = Array.isArray(park) ? park[0]?.name : park?.name
      uniqueNames.set(name, {
        name,
        category: item.category,
        restaurant: rest?.name,
        park: parkName,
        menu_item_id: item.id,
      })
    }
  }

  const sorted = [...uniqueNames.values()].sort((a, b) => a.name.localeCompare(b.name))
  console.log(`Unique item names without descriptions: ${sorted.length}`)

  // Group by category
  console.log('\n--- By Category ---')
  const byCat: Record<string, any[]> = {}
  for (const item of sorted) {
    const cat = item.category || 'null'
    if (!byCat[cat]) byCat[cat] = []
    byCat[cat].push(item)
  }

  for (const [cat, catItems] of Object.entries(byCat).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${cat}: ${catItems.length} items`)
    catItems.slice(0, 10).forEach(i => console.log(`  - ${i.name} @ ${i.restaurant}`))
    if (catItems.length > 10) console.log(`  ... and ${catItems.length - 10} more`)
  }

  // Group by park
  console.log('\n--- By Park ---')
  const byPark: Record<string, any[]> = {}
  for (const item of sorted) {
    const park = item.park || 'Unknown'
    if (!byPark[park]) byPark[park] = []
    byPark[park].push(item)
  }

  for (const [park, parkItems] of Object.entries(byPark).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${park}: ${parkItems.length}`)
  }

  // Save to JSON for processing
  writeFileSync('data/all-items-needing-descriptions.json', JSON.stringify(sorted, null, 2))
  console.log('\nSaved to data/all-items-needing-descriptions.json')
}

main().catch(console.error)
