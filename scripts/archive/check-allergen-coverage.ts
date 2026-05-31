/**
 * Check allergen coverage statistics
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
  // Get total menu items
  const { count: totalItems } = await supabase
    .from('menu_items')
    .select('*', { count: 'exact', head: true })

  // Get all allergen records
  const allergens = await fetchAll('allergens', 'menu_item_id, allergen_type, severity')

  // Calculate unique items with allergens
  const uniqueItems = new Set(allergens.map(a => a.menu_item_id))

  console.log('=== Allergen Coverage ===')
  console.log(`Total menu items: ${totalItems}`)
  console.log(`Total allergen records: ${allergens.length}`)
  console.log(`Items with allergens: ${uniqueItems.size} (${(uniqueItems.size / totalItems! * 100).toFixed(1)}%)`)

  // Count by allergen type
  const byType: Record<string, number> = {}
  const bySeverity: Record<string, Record<string, number>> = {}

  for (const a of allergens) {
    byType[a.allergen_type] = (byType[a.allergen_type] || 0) + 1

    if (!bySeverity[a.allergen_type]) bySeverity[a.allergen_type] = {}
    bySeverity[a.allergen_type][a.severity] = (bySeverity[a.allergen_type][a.severity] || 0) + 1
  }

  console.log('\nBy allergen type:')
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    const contains = bySeverity[type]?.contains || 0
    const mayContain = bySeverity[type]?.may_contain || 0
    console.log(`  ${type.padEnd(12)} ${String(count).padStart(5)}  (contains: ${contains}, may_contain: ${mayContain})`)
  }

  // Items per allergen count
  const itemAllergenCount: Record<string, number> = {}
  for (const a of allergens) {
    itemAllergenCount[a.menu_item_id] = (itemAllergenCount[a.menu_item_id] || 0) + 1
  }

  const countDist: Record<number, number> = {}
  for (const count of Object.values(itemAllergenCount)) {
    countDist[count] = (countDist[count] || 0) + 1
  }

  console.log('\nAllergens per item:')
  for (const [count, items] of Object.entries(countDist).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  ${count} allergen(s): ${items} items`)
  }
}

main().catch(console.error)
