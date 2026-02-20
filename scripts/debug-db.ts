import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { dirname } from 'path'
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
    if (eqIdx > 0) {
      envVars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
    }
  }
})

const url = envVars['SUPABASE_URL'] || process.env.SUPABASE_URL!
const key = envVars['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY!
const sb = createClient(url, key)

// Helper to fetch all rows with pagination
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
  console.log('DIABETESGUIDE DATABASE DIAGNOSTIC REPORT')
  console.log('='.repeat(70))
  console.log(`Run at: ${new Date().toISOString()}\n`)

  // ─── 1. COUNTS ───
  console.log('--- 1. TABLE COUNTS ---')
  const parks = await fetchAll('parks')
  const restaurants = await fetchAll('restaurants')
  const menuItems = await fetchAll('menu_items')
  const nutritionalData = await fetchAll('nutritional_data')
  const allergens = await fetchAll('allergens')

  console.log(`  parks:            ${parks.length}`)
  console.log(`  restaurants:      ${restaurants.length}`)
  console.log(`  menu_items:       ${menuItems.length}`)
  console.log(`  nutritional_data: ${nutritionalData.length}`)
  console.log(`  allergens:        ${allergens.length}`)
  console.log()

  // ─── 2. ORPHANS ───
  console.log('--- 2. ORPHAN DETECTION ---')

  const parkIds = new Set(parks.map((p: any) => p.id))
  const restaurantIds = new Set(restaurants.map((r: any) => r.id))
  const menuItemIds = new Set(menuItems.map((m: any) => m.id))

  const orphanRestaurants = restaurants.filter((r: any) => !parkIds.has(r.park_id))
  console.log(`  Restaurants with no matching park_id: ${orphanRestaurants.length}`)
  if (orphanRestaurants.length > 0) {
    orphanRestaurants.forEach((r: any) => console.log(`    - "${r.name}" (park_id: ${r.park_id})`))
  }

  const orphanMenuItems = menuItems.filter((m: any) => !restaurantIds.has(m.restaurant_id))
  console.log(`  Menu items with no matching restaurant_id: ${orphanMenuItems.length}`)
  if (orphanMenuItems.length > 0) {
    orphanMenuItems.slice(0, 20).forEach((m: any) => console.log(`    - "${m.name}" (restaurant_id: ${m.restaurant_id})`))
    if (orphanMenuItems.length > 20) console.log(`    ... and ${orphanMenuItems.length - 20} more`)
  }

  const orphanNutrition = nutritionalData.filter((n: any) => !menuItemIds.has(n.menu_item_id))
  console.log(`  Nutritional data with no matching menu_item_id: ${orphanNutrition.length}`)
  if (orphanNutrition.length > 0) {
    orphanNutrition.slice(0, 10).forEach((n: any) => console.log(`    - nutrition row id=${n.id}, menu_item_id=${n.menu_item_id}`))
    if (orphanNutrition.length > 10) console.log(`    ... and ${orphanNutrition.length - 10} more`)
  }
  console.log()

  // ─── 3. MISSING NUTRITION ───
  console.log('--- 3. MISSING NUTRITION DATA ---')
  const itemsWithNutrition = new Set(nutritionalData.map((n: any) => n.menu_item_id))
  const missingNutrition = menuItems.filter((m: any) => !itemsWithNutrition.has(m.id))
  console.log(`  Menu items with NO nutritional_data row: ${missingNutrition.length} / ${menuItems.length}`)
  if (missingNutrition.length > 0) {
    console.log(`  First 20 missing:`)
    missingNutrition.slice(0, 20).forEach((m: any) => console.log(`    - "${m.name}" (id: ${m.id})`))
    if (missingNutrition.length > 20) console.log(`    ... and ${missingNutrition.length - 20} more`)
  }
  console.log()

  // ─── 4. NULL/EMPTY NAMES ───
  console.log('--- 4. NULL OR EMPTY NAMES ---')
  const badNameItems = menuItems.filter((m: any) => !m.name || m.name.trim() === '')
  const badNameRestaurants = restaurants.filter((r: any) => !r.name || r.name.trim() === '')
  console.log(`  Menu items with null/empty name: ${badNameItems.length}`)
  badNameItems.forEach((m: any) => console.log(`    - id=${m.id}, name="${m.name}"`))
  console.log(`  Restaurants with null/empty name: ${badNameRestaurants.length}`)
  badNameRestaurants.forEach((r: any) => console.log(`    - id=${r.id}, name="${r.name}"`))
  console.log()

  // ─── 5. PRICE ANOMALIES ───
  console.log('--- 5. PRICE ANOMALIES ---')
  const negativePrice = menuItems.filter((m: any) => m.price !== null && m.price < 0)
  const highPrice = menuItems.filter((m: any) => m.price !== null && m.price > 500)
  const nullPrice = menuItems.filter((m: any) => m.price === null)
  console.log(`  Items with negative price: ${negativePrice.length}`)
  negativePrice.forEach((m: any) => console.log(`    - "${m.name}" price=$${m.price}`))
  console.log(`  Items with price > $500: ${highPrice.length}`)
  highPrice.forEach((m: any) => console.log(`    - "${m.name}" price=$${m.price}`))
  console.log(`  Items with null price: ${nullPrice.length}`)
  console.log()

  // ─── 6. CATEGORY DISTRIBUTION ───
  console.log('--- 6. CATEGORY DISTRIBUTION ---')
  const categoryCounts: Record<string, number> = {}
  menuItems.forEach((m: any) => {
    const cat = m.category || '(null)'
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
  })
  Object.entries(categoryCounts)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .forEach(([cat, count]) => console.log(`  ${cat}: ${count}`))
  console.log()

  // ─── 7. PARK COVERAGE ───
  console.log('--- 7. PARK COVERAGE ---')

  // Build lookup: restaurant_id -> park_id
  const restToPark: Record<string, string> = {}
  restaurants.forEach((r: any) => { restToPark[r.id] = r.park_id })

  // Build lookup: park_id -> park name
  const parkNames: Record<string, string> = {}
  parks.forEach((p: any) => { parkNames[p.id] = p.name })

  // Count restaurants per park
  const restPerPark: Record<string, number> = {}
  restaurants.forEach((r: any) => {
    restPerPark[r.park_id] = (restPerPark[r.park_id] || 0) + 1
  })

  // Count menu items per park
  const itemsPerPark: Record<string, number> = {}
  menuItems.forEach((m: any) => {
    const parkId = restToPark[m.restaurant_id]
    if (parkId) {
      itemsPerPark[parkId] = (itemsPerPark[parkId] || 0) + 1
    }
  })

  // Items with nutrition per park
  const nutritionPerPark: Record<string, number> = {}
  menuItems.forEach((m: any) => {
    const parkId = restToPark[m.restaurant_id]
    if (parkId && itemsWithNutrition.has(m.id)) {
      nutritionPerPark[parkId] = (nutritionPerPark[parkId] || 0) + 1
    }
  })

  console.log(`  ${'Park Name'.padEnd(45)} Rests  Items  w/Nutr  Coverage`)
  console.log(`  ${'-'.repeat(45)} -----  -----  ------  --------`)
  parks
    .sort((a: any, b: any) => a.name.localeCompare(b.name))
    .forEach((p: any) => {
      const rests = restPerPark[p.id] || 0
      const items = itemsPerPark[p.id] || 0
      const nutr = nutritionPerPark[p.id] || 0
      const pct = items > 0 ? ((nutr / items) * 100).toFixed(1) : 'N/A'
      console.log(`  ${p.name.padEnd(45)} ${String(rests).padStart(5)}  ${String(items).padStart(5)}  ${String(nutr).padStart(6)}  ${String(pct).padStart(6)}%`)
    })
  console.log()

  // ─── 8. DUPLICATE DETECTION ───
  console.log('--- 8. DUPLICATE MENU ITEMS (same name + same restaurant) ---')
  const dupeKey = (m: any) => `${m.restaurant_id}|||${(m.name || '').toLowerCase().trim()}`
  const dupeMap: Record<string, any[]> = {}
  menuItems.forEach((m: any) => {
    const k = dupeKey(m)
    if (!dupeMap[k]) dupeMap[k] = []
    dupeMap[k].push(m)
  })
  const dupes = Object.values(dupeMap).filter(arr => arr.length > 1)
  console.log(`  Duplicate groups found: ${dupes.length}`)
  dupes.slice(0, 20).forEach((group) => {
    console.log(`    - "${group[0].name}" at restaurant_id=${group[0].restaurant_id} (${group.length} copies)`)
  })
  if (dupes.length > 20) console.log(`    ... and ${dupes.length - 20} more groups`)
  console.log()

  // ─── 9. NUTRITION OUTLIERS ───
  console.log('--- 9. NUTRITION OUTLIERS ---')
  const highCal = nutritionalData.filter((n: any) => n.calories !== null && n.calories > 5000)
  const highCarbs = nutritionalData.filter((n: any) => n.carbs !== null && n.carbs > 500)
  const highFat = nutritionalData.filter((n: any) => n.fat !== null && n.fat > 300)

  console.log(`  Items with calories > 5000: ${highCal.length}`)
  for (const n of highCal) {
    const item = menuItems.find((m: any) => m.id === n.menu_item_id)
    console.log(`    - "${item?.name || 'UNKNOWN'}" cal=${n.calories} carbs=${n.carbs} fat=${n.fat}`)
  }

  console.log(`  Items with carbs > 500: ${highCarbs.length}`)
  for (const n of highCarbs) {
    const item = menuItems.find((m: any) => m.id === n.menu_item_id)
    console.log(`    - "${item?.name || 'UNKNOWN'}" cal=${n.calories} carbs=${n.carbs}`)
  }

  console.log(`  Items with fat > 300: ${highFat.length}`)
  for (const n of highFat) {
    const item = menuItems.find((m: any) => m.id === n.menu_item_id)
    console.log(`    - "${item?.name || 'UNKNOWN'}" cal=${n.calories} fat=${n.fat}`)
  }
  console.log()

  // ─── 10. NEW PARKS CHECK ───
  console.log('--- 10. NEW PARKS CHECK (Dollywood, Kings Island) ---')
  const dollywood = parks.find((p: any) => /dollywood/i.test(p.name))
  const kingsIsland = parks.find((p: any) => /kings?\s*island/i.test(p.name))

  if (dollywood) {
    const dRests = restPerPark[dollywood.id] || 0
    const dItems = itemsPerPark[dollywood.id] || 0
    const dNutr = nutritionPerPark[dollywood.id] || 0
    console.log(`  Dollywood: FOUND (id=${dollywood.id})`)
    console.log(`    Location: ${dollywood.location}`)
    console.log(`    Restaurants: ${dRests}, Menu items: ${dItems}, With nutrition: ${dNutr}`)
  } else {
    console.log(`  Dollywood: NOT FOUND`)
  }

  if (kingsIsland) {
    const kRests = restPerPark[kingsIsland.id] || 0
    const kItems = itemsPerPark[kingsIsland.id] || 0
    const kNutr = nutritionPerPark[kingsIsland.id] || 0
    console.log(`  Kings Island: FOUND (id=${kingsIsland.id})`)
    console.log(`    Location: ${kingsIsland.location}`)
    console.log(`    Restaurants: ${kRests}, Menu items: ${kItems}, With nutrition: ${kNutr}`)
  } else {
    console.log(`  Kings Island: NOT FOUND`)
  }
  console.log()

  // ─── SUMMARY ───
  console.log('='.repeat(70))
  console.log('SUMMARY OF ISSUES')
  console.log('='.repeat(70))
  const issues: string[] = []
  if (orphanRestaurants.length > 0) issues.push(`${orphanRestaurants.length} orphan restaurants (no matching park)`)
  if (orphanMenuItems.length > 0) issues.push(`${orphanMenuItems.length} orphan menu items (no matching restaurant)`)
  if (orphanNutrition.length > 0) issues.push(`${orphanNutrition.length} orphan nutrition rows (no matching menu item)`)
  if (missingNutrition.length > 0) issues.push(`${missingNutrition.length} menu items missing nutrition data`)
  if (badNameItems.length > 0) issues.push(`${badNameItems.length} menu items with null/empty names`)
  if (badNameRestaurants.length > 0) issues.push(`${badNameRestaurants.length} restaurants with null/empty names`)
  if (negativePrice.length > 0) issues.push(`${negativePrice.length} items with negative price`)
  if (highPrice.length > 0) issues.push(`${highPrice.length} items with price > $500`)
  if (dupes.length > 0) issues.push(`${dupes.length} duplicate item groups`)
  if (highCal.length > 0) issues.push(`${highCal.length} items with calories > 5000`)
  if (highCarbs.length > 0) issues.push(`${highCarbs.length} items with carbs > 500`)
  if (highFat.length > 0) issues.push(`${highFat.length} items with fat > 300`)
  if (!dollywood) issues.push(`Dollywood park not found`)
  if (!kingsIsland) issues.push(`Kings Island park not found`)

  if (issues.length === 0) {
    console.log('  No issues detected!')
  } else {
    issues.forEach((issue, i) => console.log(`  ${i + 1}. ${issue}`))
  }
  console.log('\nDiagnostic complete.')
}

main().catch(console.error)
