/**
 * Find and remove duplicate menu items (same name + restaurant)
 * Keeps the first one, removes subsequent duplicates
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

const DRY_RUN = process.argv.includes('--dry-run')

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
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will delete duplicates)'}\n`)

  const menuItems = await fetchAll('menu_items', 'id, name, restaurant_id, price, description, created_at')
  const restaurants = await fetchAll('restaurants', 'id, name, park:parks(name)')

  // Build restaurant lookup
  const restLookup: Record<string, any> = {}
  for (const r of restaurants) {
    restLookup[r.id] = r
  }

  // Find duplicates by name + restaurant
  const dupeKey = (m: any) => `${m.restaurant_id}|||${(m.name || '').toLowerCase().trim()}`
  const dupeMap: Record<string, any[]> = {}
  for (const m of menuItems) {
    const k = dupeKey(m)
    if (!dupeMap[k]) dupeMap[k] = []
    dupeMap[k].push(m)
  }

  const dupes = Object.values(dupeMap).filter(arr => arr.length > 1)
  console.log(`Found ${dupes.length} duplicate groups\n`)

  if (dupes.length === 0) {
    console.log('No duplicates to fix!')
    return
  }

  const toDelete: string[] = []

  for (const group of dupes) {
    const rest = restLookup[group[0].restaurant_id]
    console.log(`"${group[0].name}" @ ${rest?.name} (${rest?.park?.name})`)

    // Sort by created_at to keep the oldest one
    group.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    const [keep, ...remove] = group
    console.log(`  Keep:   id=${keep.id}`)
    for (const item of remove) {
      console.log(`  Delete: id=${item.id}`)
      toDelete.push(item.id)
    }
    console.log()
  }

  if (toDelete.length === 0) {
    console.log('Nothing to delete.')
    return
  }

  console.log(`Total items to delete: ${toDelete.length}\n`)

  if (DRY_RUN) {
    console.log('DRY RUN - no changes made. Run without --dry-run to delete duplicates.')
    return
  }

  // Delete nutrition data first (FK constraint)
  console.log('Deleting nutritional_data for duplicates...')
  const { error: nutErr } = await sb.from('nutritional_data')
    .delete()
    .in('menu_item_id', toDelete)

  if (nutErr) {
    console.error('Error deleting nutrition:', nutErr.message)
    return
  }

  // Delete allergens (FK constraint)
  console.log('Deleting allergens for duplicates...')
  const { error: allerErr } = await sb.from('allergens')
    .delete()
    .in('menu_item_id', toDelete)

  if (allerErr) {
    console.error('Error deleting allergens:', allerErr.message)
    return
  }

  // Delete menu items
  console.log('Deleting duplicate menu items...')
  const { error: menuErr, count } = await sb.from('menu_items')
    .delete()
    .in('id', toDelete)

  if (menuErr) {
    console.error('Error deleting menu items:', menuErr.message)
    return
  }

  console.log(`\n✓ Deleted ${toDelete.length} duplicate items`)
}

main().catch(console.error)
