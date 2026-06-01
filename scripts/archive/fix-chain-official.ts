/**
 * Chain-Official Nutrition Updater
 *
 * Reads a chain data JSON file, matches items to existing DB records,
 * and replaces estimated nutrition with official chain values.
 *
 * Usage: npx tsx scripts/fix-chain-official.ts <chain-json-path> [--dry-run]
 *
 * JSON format:
 * {
 *   "chain_name": "Earl of Sandwich",
 *   "restaurant_names": ["Earl of Sandwich"],
 *   "park_name": "Disney Springs",
 *   "source_url": "https://...",
 *   "items": [
 *     { "name": "Original 1762", "category": "entree",
 *       "calories": 570, "carbs": 50, "fat": 26, "protein": 30,
 *       "sugar": 6, "fiber": 3, "sodium": 1240, "price": 10.99 }
 *   ]
 * }
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(url, key)
const DRY_RUN = process.argv.includes('--dry-run')

const jsonPath = process.argv.find(a => !a.startsWith('-') && a.endsWith('.json'))
if (!jsonPath) {
  console.error('Usage: npx tsx scripts/fix-chain-official.ts <chain-json-path> [--dry-run]')
  process.exit(1)
}

interface ChainItem {
  name: string
  category?: string
  calories: number
  carbs: number
  fat: number
  protein: number
  sugar?: number
  fiber?: number
  sodium?: number
  cholesterol?: number
  price?: number
  description?: string
}

interface ChainData {
  chain_name: string
  restaurant_names: string[]
  park_name: string
  source_url: string
  items: ChainItem[]
}

async function main() {
  const raw = readFileSync(jsonPath!, 'utf-8')
  const chain: ChainData = JSON.parse(raw)

  console.log(`=== ${chain.chain_name} — Official Nutrition Update ===`)
  console.log(`Source: ${chain.source_url}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`)

  // Find the park
  const { data: parks } = await sb.from('parks').select('id, name').ilike('name', `%${chain.park_name}%`)
  if (!parks || parks.length === 0) {
    console.error(`Park not found: ${chain.park_name}`)
    process.exit(1)
  }
  const parkId = parks[0].id
  console.log(`Park: ${parks[0].name} (${parkId})`)

  // Find restaurant(s)
  const { data: rests } = await sb.from('restaurants')
    .select('id, name')
    .eq('park_id', parkId)
    .in('name', chain.restaurant_names)

  if (!rests || rests.length === 0) {
    console.error(`No restaurants found matching: ${chain.restaurant_names.join(', ')}`)
    process.exit(1)
  }

  const restIds = rests.map(r => r.id)
  console.log(`Restaurants: ${rests.map(r => `${r.name} (${r.id})`).join(', ')}\n`)

  // Fetch all existing items for these restaurants
  const { data: existingItems } = await sb.from('menu_items')
    .select('id, name, category, restaurant_id, nutritional_data(id, calories, carbs, fat, protein, sugar, fiber, sodium, cholesterol, source, confidence_score)')
    .in('restaurant_id', restIds)

  const itemsByName = new Map<string, any>()
  for (const item of existingItems ?? []) {
    itemsByName.set(item.name.toLowerCase(), item)
  }

  let updated = 0
  let added = 0
  let skipped = 0

  for (const ci of chain.items) {
    const existing = itemsByName.get(ci.name.toLowerCase())

    if (existing) {
      const nd = (existing as any).nutritional_data?.[0]
      if (!nd) {
        console.log(`  [SKIP] ${ci.name} — no nutrition record (shouldn't happen)`)
        skipped++
        continue
      }

      // Check if already official with same values
      if (nd.source === 'official' && nd.calories === ci.calories && nd.carbs === ci.carbs) {
        skipped++
        continue
      }

      const oldCal = nd.calories ?? 0
      const oldCarbs = nd.carbs ?? 0

      const updates: Record<string, any> = {
        calories: ci.calories,
        carbs: ci.carbs,
        fat: ci.fat,
        protein: ci.protein,
        source: 'official',
        confidence_score: 90,
      }
      if (ci.sugar !== undefined) updates.sugar = ci.sugar
      if (ci.fiber !== undefined) updates.fiber = ci.fiber
      if (ci.sodium !== undefined) updates.sodium = ci.sodium
      if (ci.cholesterol !== undefined) updates.cholesterol = ci.cholesterol

      console.log(`  [UPDATE] ${ci.name}: ${oldCal}cal→${ci.calories}cal, ${oldCarbs}g→${ci.carbs}g carbs`)

      if (!DRY_RUN) {
        await sb.from('nutritional_data').update(updates).eq('id', nd.id)
      }
      updated++
    } else {
      // New item — insert
      console.log(`  [NEW] ${ci.name}: ${ci.calories}cal, ${ci.carbs}g carbs`)

      if (!DRY_RUN) {
        // Pick the first restaurant (or match by name if multiple)
        const restId = restIds[0]
        const category = ci.category || 'entree'

        const { data: newItem, error: itemErr } = await sb.from('menu_items').insert({
          restaurant_id: restId,
          name: ci.name,
          description: ci.description || null,
          category,
          price: ci.price || null,
          is_seasonal: false,
          is_fried: false,
          is_vegetarian: false,
        }).select('id').single()

        if (itemErr || !newItem) {
          console.error(`    Insert error: ${itemErr?.message}`)
          continue
        }

        const nutData: Record<string, any> = {
          menu_item_id: newItem.id,
          calories: ci.calories,
          carbs: ci.carbs,
          fat: ci.fat,
          protein: ci.protein,
          source: 'official',
          confidence_score: 90,
        }
        if (ci.sugar !== undefined) nutData.sugar = ci.sugar
        if (ci.fiber !== undefined) nutData.fiber = ci.fiber
        if (ci.sodium !== undefined) nutData.sodium = ci.sodium
        if (ci.cholesterol !== undefined) nutData.cholesterol = ci.cholesterol

        const { error: nutErr } = await sb.from('nutritional_data').insert(nutData)
        if (nutErr) console.error(`    Nutrition insert error: ${nutErr.message}`)
      }
      added++
    }
  }

  console.log(`\n=== Summary ===`)
  console.log(`Updated: ${updated}`)
  console.log(`Added: ${added}`)
  console.log(`Skipped (already official): ${skipped}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
