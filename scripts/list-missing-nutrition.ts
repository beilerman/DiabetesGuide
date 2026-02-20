/**
 * List items still missing nutrition to identify patterns
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

const supabase = createClient(envVars['SUPABASE_URL']!, envVars['SUPABASE_SERVICE_ROLE_KEY']!)

async function fetchAll(table: string, select: string): Promise<any[]> {
  const all: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999)
    if (error) { console.error(`Error:`, error.message); break }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

async function main() {
  const nutrition = await fetchAll('nutritional_data', 'id, menu_item_id, calories')
  const menuItems = await fetchAll('menu_items', 'id, name, description, category')

  const menuMap = new Map(menuItems.map(m => [m.id, m]))

  const missing = nutrition
    .filter(n => n.calories === null)
    .map(n => {
      const item = menuMap.get(n.menu_item_id)
      return item ? { name: item.name, desc: item.description?.slice(0, 60), category: item.category } : null
    })
    .filter(Boolean)

  // Group by category
  const byCategory: Record<string, any[]> = {}
  for (const item of missing) {
    const cat = item.category || 'unknown'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(item)
  }

  console.log(`Total items missing nutrition: ${missing.length}\n`)

  for (const [cat, items] of Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n=== ${cat.toUpperCase()} (${items.length}) ===`)
    // Get unique names
    const uniqueNames = [...new Set(items.map(i => i.name))].sort()
    uniqueNames.forEach(name => console.log(`  - ${name}`))
  }
}

main()
