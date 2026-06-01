/**
 * Check and fix duplicate items in the database
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
  console.log('Checking for duplicate items...\n')

  const menuItems = await fetchAll('menu_items', 'id, name, restaurant_id, price, description')
  const restaurants = await fetchAll('restaurants', 'id, name, park:parks(name)')

  // Build restaurant lookup
  const restLookup: Record<string, any> = {}
  for (const r of restaurants) {
    restLookup[r.id] = r
  }

  // Find duplicates
  const dupeKey = (m: any) => `${m.restaurant_id}|||${(m.name || '').toLowerCase().trim()}`
  const dupeMap: Record<string, any[]> = {}
  for (const m of menuItems) {
    const k = dupeKey(m)
    if (!dupeMap[k]) dupeMap[k] = []
    dupeMap[k].push(m)
  }

  const dupes = Object.values(dupeMap).filter(arr => arr.length > 1)
  console.log(`Found ${dupes.length} duplicate groups\n`)

  for (const group of dupes) {
    const rest = restLookup[group[0].restaurant_id]
    console.log(`"${group[0].name}" @ ${rest?.name} (${rest?.park?.name})`)
    for (const item of group) {
      console.log(`  id=${item.id}, price=${item.price}`)
    }
    console.log()
  }

  // Check null prices by park
  console.log('---\n\nItems with null price by park:\n')

  const byPark: Record<string, number> = {}
  for (const item of menuItems) {
    if (item.price === null) {
      const rest = restLookup[item.restaurant_id]
      const park = rest?.park?.name || 'Unknown'
      byPark[park] = (byPark[park] || 0) + 1
    }
  }

  for (const [park, count] of Object.entries(byPark).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${park}: ${count}`)
  }
}

main().catch(console.error)
