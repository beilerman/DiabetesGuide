/**
 * Post-migration verification for 00002_freshness_and_uniqueness.sql.
 *
 * Confirms the live database matches the expected state from ADVISED_REVISIONS.md
 * after the schema migration is applied. Read-only — uses the service-role REST API.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/audit/verify-post-migration.ts
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

interface Check {
  name: string
  expected: string
  actual: string
  pass: boolean
}

const results: Check[] = []

function record(name: string, expected: string, actual: string, pass: boolean) {
  results.push({ name, expected, actual, pass })
}

async function exactCount(table: string): Promise<number> {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
  if (error) throw new Error(`count(${table}): ${error.message}`)
  return count ?? -1
}

async function probeColumn(table: string, column: string): Promise<boolean> {
  const { error } = await supabase.from(table).select(column).limit(1)
  return !error
}

async function detectStaleSampling(): Promise<{ tested: boolean; sample: number }> {
  // Pull a small sample of nutritional_data rows and confirm updated_at is populated.
  const { data, error } = await supabase
    .from('nutritional_data')
    .select('id, updated_at, alcohol_grams, source_detail')
    .limit(5)
  if (error) return { tested: false, sample: 0 }
  if (!data) return { tested: false, sample: 0 }
  const rows = data as Array<{ updated_at: string | null }>
  const populated = rows.filter((row) => row.updated_at).length
  return { tested: true, sample: populated }
}

async function duplicateParkNames(): Promise<number> {
  const { data, error } = await supabase.from('parks').select('name')
  if (error) throw new Error(`parks.name: ${error.message}`)
  const rows = (data ?? []) as Array<{ name: string | null }>
  const seen = new Map<string, number>()
  for (const row of rows) {
    const key = row.name?.toLowerCase().trim()
    if (!key) continue
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  let dupes = 0
  for (const v of seen.values()) if (v > 1) dupes += 1
  return dupes
}

async function duplicateRestaurantsPerPark(): Promise<number> {
  const { data, error } = await supabase.from('restaurants').select('park_id, name')
  if (error) throw new Error(`restaurants: ${error.message}`)
  const rows = (data ?? []) as Array<{ park_id: string; name: string | null }>
  const seen = new Map<string, number>()
  for (const r of rows) {
    const key = `${r.park_id}::${r.name?.toLowerCase().trim()}`
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  let dupes = 0
  for (const v of seen.values()) if (v > 1) dupes += 1
  return dupes
}

async function duplicateMenuItemsPerRestaurant(): Promise<number> {
  const pageSize = 1000
  const seen = new Map<string, number>()
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('menu_items')
      .select('restaurant_id, name')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`menu_items: ${error.message}`)
    if (!data || data.length === 0) break
    const rows = data as Array<{ restaurant_id: string; name: string | null }>
    for (const r of rows) {
      const key = `${r.restaurant_id}::${r.name?.toLowerCase().trim()}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    if (data.length < pageSize) break
    from += pageSize
  }
  let dupes = 0
  for (const v of seen.values()) if (v > 1) dupes += 1
  return dupes
}

async function multipleNutritionRowsPerItem(): Promise<number> {
  const pageSize = 1000
  const seen = new Map<string, number>()
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('nutritional_data')
      .select('menu_item_id')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`nutritional_data: ${error.message}`)
    if (!data || data.length === 0) break
    const rows = data as Array<{ menu_item_id: string | null }>
    for (const row of rows) {
      const id = row.menu_item_id
      if (!id) continue
      seen.set(id, (seen.get(id) ?? 0) + 1)
    }
    if (data.length < pageSize) break
    from += pageSize
  }
  let dupes = 0
  for (const v of seen.values()) if (v > 1) dupes += 1
  return dupes
}

interface NutritionRow {
  id: string
  calories: number | null
  carbs: number | null
  sugar: number | null
  fiber: number | null
  fat: number | null
  protein: number | null
  sodium: number | null
}

async function invalidNutritionRows(): Promise<number> {
  const pageSize = 1000
  let invalid = 0
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('nutritional_data')
      .select('id, calories, carbs, sugar, fiber, fat, protein, sodium')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`invalid scan: ${error.message}`)
    if (!data || data.length === 0) break
    const rows = data as NutritionRow[]
    for (const r of rows) {
      const violations =
        (r.calories != null && (r.calories < 0 || r.calories > 5000)) ||
        (r.carbs != null && r.carbs < 0) ||
        (r.fat != null && r.fat < 0) ||
        (r.protein != null && r.protein < 0) ||
        (r.sugar != null && r.carbs != null && r.sugar > r.carbs) ||
        (r.fiber != null && r.carbs != null && r.fiber > r.carbs) ||
        (r.sodium != null && r.sodium < 0)
      if (violations) invalid += 1
    }
    if (data.length < pageSize) break
    from += pageSize
  }
  return invalid
}

async function main() {
  console.log('Post-migration verification for project rcrzdpzwcbekgqgiwqcp\n')

  // Sanity-check that each table is non-empty (catches catastrophic failure
  // like a truncated migration). Exact counts intentionally not asserted —
  // they drift as the data pipeline ingests new menus, and the duplicate /
  // missing-row / invalid-data checks below catch real data regressions.
  for (const table of ['parks', 'restaurants', 'menu_items', 'nutritional_data', 'allergens']) {
    const actual = await exactCount(table)
    record(`row count: ${table}`, '>0', String(actual), actual > 0)
  }

  for (const table of ['restaurants', 'menu_items', 'nutritional_data']) {
    const present = await probeColumn(table, 'updated_at')
    record(`column ${table}.updated_at`, 'present', present ? 'present' : 'missing', present)
  }

  for (const col of ['alcohol_grams', 'source_detail']) {
    const present = await probeColumn('nutritional_data', col)
    record(`column nutritional_data.${col}`, 'present', present ? 'present' : 'missing', present)
  }

  const sample = await detectStaleSampling()
  record(
    'sample updated_at populated (5 rows)',
    '5',
    `${sample.sample}`,
    sample.sample === 5
  )

  const parkDupes = await duplicateParkNames()
  record('duplicate parks (normalized)', '0', String(parkDupes), parkDupes === 0)

  const restDupes = await duplicateRestaurantsPerPark()
  record('duplicate restaurants per park', '0', String(restDupes), restDupes === 0)

  const itemDupes = await duplicateMenuItemsPerRestaurant()
  record('duplicate menu items per restaurant', '0', String(itemDupes), itemDupes === 0)

  // Note: an item without a nutritional_data row is legitimate for hundreds of
  // items (water, blank descriptions, awaiting AI estimation). The audit pipeline
  // (scripts/audit/completeness.ts) handles coverage reporting; we don't fail here.

  const multi = await multipleNutritionRowsPerItem()
  record('multiple nutrition rows per item', '0', String(multi), multi === 0)

  const invalid = await invalidNutritionRows()
  record('invalid nutrition rows', '0', String(invalid), invalid === 0)

  // Print results
  console.log('Check'.padEnd(48) + 'Expected'.padEnd(12) + 'Actual'.padEnd(12) + 'Status')
  console.log('-'.repeat(86))
  let failed = 0
  for (const r of results) {
    const status = r.pass ? 'PASS' : 'FAIL'
    if (!r.pass) failed += 1
    console.log(
      r.name.padEnd(48) + r.expected.padEnd(12) + r.actual.padEnd(12) + status
    )
  }
  console.log('-'.repeat(86))
  console.log(`Total: ${results.length}   Passed: ${results.length - failed}   Failed: ${failed}`)

  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error('verify-post-migration error:', err)
  process.exit(1)
})
