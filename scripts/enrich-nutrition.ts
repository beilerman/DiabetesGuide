import { createClient } from '@supabase/supabase-js'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const usdaKey = process.env.USDA_API_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}
if (!usdaKey) {
  console.error('Set USDA_API_KEY in env')
  process.exit(1)
}

const supabase = createClient(url, key)

const NUTRIENT_IDS = {
  protein: 1003,
  carbs: 1005,
  fat: 1004,
  calories: 1008,
  sugar: 2000,
  fiber: 1079,
  sodium: 1093,
  cholesterol: 1253,
} as const

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function simplifyName(name: string): string {
  return name
    .replace(/\b(house-?made|signature|artisan|hand-?crafted|premium|classic|famous|legendary|magical|enchanted|galactic|frozen|specialty)\b/gi, '')
    .replace(/\b(disney|walt|magic kingdom|epcot|hollywood|animal kingdom)\b/gi, '')
    .replace(/['']/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim()
}

interface USDAFood {
  foodNutrients: { nutrientId: number; value: number }[]
}

async function searchUSDA(query: string): Promise<USDAFood | null> {
  const params = new URLSearchParams({
    api_key: usdaKey!,
    query,
    pageSize: '3',
  })
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?${params}`)
  if (!res.ok) return null
  const data = await res.json()
  if (!data.foods?.length) return null
  return data.foods[0]
}

function getNutrient(food: USDAFood, id: number): number | null {
  const n = food.foodNutrients.find(fn => fn.nutrientId === id)
  return n ? n.value : null
}

function computeConfidence(usdaCals: number | null, storedCals: number): number {
  if (!storedCals || storedCals === 0) return 50
  if (usdaCals == null) return 40
  const ratio = Math.abs(usdaCals - storedCals) / storedCals
  if (ratio <= 0.2) return 85
  if (ratio <= 0.5) return 60
  return 40
}

async function enrich() {
  // Fetch all menu items joined with nutritional_data
  // Fetch all items in batches to avoid Supabase 1000-row default limit
  let allRows: any[] = []
  let from = 0
  const batchSize = 1000
  while (true) {
    const { data: batch, error: batchErr } = await supabase
      .from('menu_items')
      .select('id, name, description, nutritional_data(id, calories, carbs, fat, sugar, protein, fiber, sodium, cholesterol)')
      .range(from, from + batchSize - 1)
    if (batchErr) { console.error('Failed to fetch:', batchErr); process.exit(1) }
    if (!batch?.length) break
    allRows = allRows.concat(batch)
    if (batch.length < batchSize) break
    from += batchSize
  }
  const rows = allRows
  const error = null

  if (error) {
    console.error('Failed to fetch menu items:', error)
    process.exit(1)
  }

  if (!rows?.length) {
    console.log('No menu items found.')
    return
  }

  let enriched = 0
  let skipped = 0
  let failed = 0
  const total = rows.length

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    // nutritional_data comes back as array from join; take first
    const nutData = Array.isArray(row.nutritional_data)
      ? row.nutritional_data[0]
      : row.nutritional_data

    if (!nutData) {
      failed++
      continue
    }

    // Skip if already enriched AND has non-zero calories
    if (
      nutData.sugar != null &&
      nutData.protein != null &&
      nutData.fiber != null &&
      nutData.sodium != null &&
      (nutData.calories ?? 0) > 0
    ) {
      skipped++
      if ((skipped + enriched + failed) % 10 === 0) {
        console.log(`Enriched ${enriched}/${total} items...`)
      }
      continue
    }

    // Search USDA — try name, simplified name, then description
    let food = await searchUSDA(row.name)
    await delay(200)

    // Reject zero-calorie USDA matches (bad match like a spice/condiment)
    if (food && (getNutrient(food, NUTRIENT_IDS.calories) ?? 0) === 0) food = null

    if (!food) {
      const simplified = simplifyName(row.name)
      if (simplified !== row.name) {
        food = await searchUSDA(simplified)
        await delay(200)
        if (food && (getNutrient(food, NUTRIENT_IDS.calories) ?? 0) === 0) food = null
      }
    }

    if (!food && row.description) {
      food = await searchUSDA(row.description)
      await delay(200)
      if (food && (getNutrient(food, NUTRIENT_IDS.calories) ?? 0) === 0) food = null
    }

    if (!food) {
      failed++
      if ((skipped + enriched + failed) % 10 === 0) {
        console.log(`Enriched ${enriched}/${total} items...`)
      }
      continue
    }

    const sugar = getNutrient(food, NUTRIENT_IDS.sugar) != null ? Math.round(getNutrient(food, NUTRIENT_IDS.sugar)!) : null
    const protein = getNutrient(food, NUTRIENT_IDS.protein) != null ? Math.round(getNutrient(food, NUTRIENT_IDS.protein)!) : null
    const fiber = getNutrient(food, NUTRIENT_IDS.fiber) != null ? Math.round(getNutrient(food, NUTRIENT_IDS.fiber)!) : null
    const sodium = getNutrient(food, NUTRIENT_IDS.sodium) != null ? Math.round(getNutrient(food, NUTRIENT_IDS.sodium)!) : null
    const cholesterol = getNutrient(food, NUTRIENT_IDS.cholesterol) != null ? Math.round(getNutrient(food, NUTRIENT_IDS.cholesterol)!) : null
    const usdaCals = getNutrient(food, NUTRIENT_IDS.calories) != null ? Math.round(getNutrient(food, NUTRIENT_IDS.calories)!) : null
    const usdaCarbs = getNutrient(food, NUTRIENT_IDS.carbs) != null ? Math.round(getNutrient(food, NUTRIENT_IDS.carbs)!) : null
    const usdaFat = getNutrient(food, NUTRIENT_IDS.fat) != null ? Math.round(getNutrient(food, NUTRIENT_IDS.fat)!) : null

    const confidence = computeConfidence(usdaCals, nutData.calories ?? 0)

    const update: Record<string, number | null | string> = {
      sugar,
      protein,
      fiber,
      sodium,
      cholesterol,
      confidence_score: confidence,
      source: 'api_lookup',
    }

    // Backfill calories/carbs/fat if currently 0
    if ((nutData.calories ?? 0) === 0 && usdaCals != null) update.calories = usdaCals
    if ((nutData.carbs ?? 0) === 0 && usdaCarbs != null) update.carbs = usdaCarbs
    if ((nutData.fat ?? 0) === 0 && usdaFat != null) update.fat = usdaFat

    const { error: updateErr } = await supabase
      .from('nutritional_data')
      .update(update)
      .eq('id', nutData.id)

    if (updateErr) {
      console.error(`Failed to update ${row.name}:`, updateErr)
      failed++
    } else {
      enriched++
    }

    if ((skipped + enriched + failed) % 10 === 0) {
      console.log(`Enriched ${enriched}/${total} items...`)
    }
  }

  console.log(
    `\nDone! Enriched ${enriched} items, ${skipped} skipped (already had data), ${failed} failed (no USDA match)`
  )
}

enrich().catch(console.error)
