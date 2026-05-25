import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  cleanDisplayText,
  getDisplayCategory,
  isLikelyMenuSectionHeader,
} from '../src/lib/display'
import type { MenuItemWithNutrition, NutritionalData, Park, Restaurant } from '../src/lib/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const DRY_RUN = !APPLY

function loadEnv() {
  const candidates = [
    resolve(__dirname, '..', '.env.local'),
    resolve(__dirname, '..', '..', '.env.local'),
    resolve(__dirname, '..', '..', '..', '.env.local'),
  ]

  for (const path of candidates) {
    if (!existsSync(path)) continue
    const raw = readFileSync(path, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const split = trimmed.indexOf('=')
      if (split <= 0) continue
      const key = trimmed.slice(0, split)
      const value = trimmed.slice(split + 1)
      if (!process.env[key]) process.env[key] = value
    }
  }
}

loadEnv()

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local or the shell.')
  process.exit(1)
}

const sb = createClient(url, key)

type ItemRow = MenuItemWithNutrition & {
  restaurant: (Restaurant & { park?: Park }) | undefined
}

type NutritionRow = NutritionalData

interface Summary {
  parkMerges: number
  restaurantMerges: number
  restaurantsMoved: number
  restaurantsDeleted: number
  itemsMoved: number
  duplicateItemsDeleted: number
  itemNamesCleaned: number
  sectionHeadersDeleted: number
  categoryFixes: number
  nutritionUnavailableFixes: number
}

const summary: Summary = {
  parkMerges: 0,
  restaurantMerges: 0,
  restaurantsMoved: 0,
  restaurantsDeleted: 0,
  itemsMoved: 0,
  duplicateItemsDeleted: 0,
  itemNamesCleaned: 0,
  sectionHeadersDeleted: 0,
  categoryFixes: 0,
  nutritionUnavailableFixes: 0,
}

const PARK_MERGES = [
  { keep: 'Universal Epic Universe', drops: ["Universal's Epic Universe"] },
  { keep: 'Universal Volcano Bay', drops: ["Universal's Volcano Bay"] },
]

const RESTAURANT_MERGES = [
  { park: 'Downtown Disney District', keep: 'Napolini Pizzeria', drops: ['Napolini'] },
  { park: 'Disney Springs', keep: 'Rainforest Cafe', drops: ['Rainforest Cafe - All-Day Updated'] },
  { park: 'Disney Springs', keep: 'Blaze Fast-Fire\'d Pizza', drops: ['Blaze Pizza'] },
  { park: 'Disney Springs', keep: 'Chicken Guy!', drops: ['Chicken Guy'] },
  { park: 'Disney Springs', keep: 'Earl of Sandwich', drops: ['Earl of Sandwich - All-Day Updated'] },
]

const MACRO_COLUMNS = [
  'calories',
  'carbs',
  'fat',
  'sugar',
  'protein',
  'fiber',
  'sodium',
  'cholesterol',
  'alcohol_grams',
] as const

function normalized(value: string | null | undefined): string {
  return cleanDisplayText(value)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u2019']s\b/g, '')
    .replace(/[\u2019']/g, '')
    .replace(/\bpizzeria\b/g, '')
    .replace(/\brestaurant\b/g, '')
    .replace(/\ball day updated\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function zeroNutritionShouldStay(name: string): boolean {
  return /\b(water|black coffee|unsweetened tea|diet coke|diet pepsi|diet soda|club soda|seltzer)\b/i.test(name)
}

function nutritionScore(nutrition: NutritionRow | undefined): number {
  if (!nutrition) return 0
  const known = MACRO_COLUMNS.filter(column => nutrition[column] != null).length
  const nonZero = MACRO_COLUMNS.filter(column => (nutrition[column] ?? 0) > 0).length
  return known * 10 + nonZero * 20 + nutrition.confidence_score
}

function getNutrition(item: ItemRow): NutritionRow | undefined {
  return item.nutritional_data?.[0]
}

function asDisplayItem(item: ItemRow): MenuItemWithNutrition {
  return item
}

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  const batchSize = 1000

  while (true) {
    const { data, error } = await sb
      .from(table)
      .select(select)
      .range(from, from + batchSize - 1)

    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...data as T[])
    if (data.length < batchSize) break
    from += batchSize
  }

  return rows
}

async function deleteItem(item: Pick<ItemRow, 'id' | 'name'>) {
  if (DRY_RUN) return
  await sb.from('nutritional_data').delete().eq('menu_item_id', item.id).throwOnError()
  await sb.from('allergens').delete().eq('menu_item_id', item.id).throwOnError()
  await sb.from('menu_items').delete().eq('id', item.id).throwOnError()
}

async function cloneBestNutrition(sourceItem: ItemRow, targetItem: ItemRow) {
  const sourceNutrition = getNutrition(sourceItem)
  if (!sourceNutrition || DRY_RUN) return

  await sb.from('nutritional_data').delete().eq('menu_item_id', targetItem.id).throwOnError()
  const nutritionValues = {
    calories: sourceNutrition.calories,
    carbs: sourceNutrition.carbs,
    fat: sourceNutrition.fat,
    sugar: sourceNutrition.sugar,
    protein: sourceNutrition.protein,
    fiber: sourceNutrition.fiber,
    sodium: sourceNutrition.sodium,
    cholesterol: sourceNutrition.cholesterol,
    alcohol_grams: sourceNutrition.alcohol_grams,
    source: sourceNutrition.source,
    source_detail: sourceNutrition.source_detail,
    confidence_score: sourceNutrition.confidence_score,
  }
  await sb
    .from('nutritional_data')
    .insert({ ...nutritionValues, menu_item_id: targetItem.id })
    .throwOnError()
}

async function updateItem(itemId: string, patch: Record<string, unknown>) {
  if (DRY_RUN || Object.keys(patch).length === 0) return

  const { error } = await sb.from('menu_items').update(patch).eq('id', itemId)
  if (!error) return

  if (error.code === '23505' && 'name' in patch) {
    const withoutName = { ...patch }
    delete withoutName.name
    if (Object.keys(withoutName).length === 0) return
    await sb.from('menu_items').update(withoutName).eq('id', itemId).throwOnError()
    return
  }

  throw error
}

async function mergeDuplicateItem(sourceItem: ItemRow, targetItem: ItemRow) {
  const sourceNutrition = getNutrition(sourceItem)
  const targetNutrition = getNutrition(targetItem)

  if (nutritionScore(sourceNutrition) > nutritionScore(targetNutrition)) {
    console.log(`      replacing nutrition: "${targetItem.name}" <= "${sourceItem.name}"`)
    await cloneBestNutrition(sourceItem, targetItem)
  }

  const cleanName = cleanDisplayText(targetItem.name) || targetItem.name
  const patch = {
    name: cleanName,
    description: targetItem.description || sourceItem.description,
    price: targetItem.price ?? sourceItem.price,
    category: getDisplayCategory(asDisplayItem(targetItem)),
    is_seasonal: targetItem.is_seasonal || sourceItem.is_seasonal,
    is_fried: targetItem.is_fried || sourceItem.is_fried,
    is_vegetarian: targetItem.is_vegetarian || sourceItem.is_vegetarian,
    photo_url: targetItem.photo_url || sourceItem.photo_url,
  }

  await deleteItem(sourceItem)
  await updateItem(targetItem.id, patch)
  summary.duplicateItemsDeleted++
}

async function fetchRestaurantItems(restaurantId: string): Promise<ItemRow[]> {
  const { data, error } = await sb
    .from('menu_items')
    .select('*, nutritional_data(*), allergens(*), restaurant:restaurants(*, park:parks(*))')
    .eq('restaurant_id', restaurantId)

  if (error) throw error
  return (data ?? []) as ItemRow[]
}

async function mergeRestaurants(keepRestaurant: Restaurant, dropRestaurant: Restaurant) {
  console.log(`    merging restaurant "${dropRestaurant.name}" -> "${keepRestaurant.name}"`)

  const keepItems = await fetchRestaurantItems(keepRestaurant.id)
  const dropItems = await fetchRestaurantItems(dropRestaurant.id)
  const keepByName = new Map(keepItems.map(item => [normalized(item.name), item]))

  for (const item of dropItems) {
    const key = normalized(item.name)
    const existing = keepByName.get(key)
    if (existing) {
      await mergeDuplicateItem(item, existing)
      continue
    }

    console.log(`      moving item: "${item.name}"`)
    if (!DRY_RUN) {
      await sb
        .from('menu_items')
        .update({ restaurant_id: keepRestaurant.id, name: cleanDisplayText(item.name) || item.name })
        .eq('id', item.id)
        .throwOnError()
    }
    keepByName.set(key, { ...item, restaurant_id: keepRestaurant.id })
    summary.itemsMoved++
  }

  if (!DRY_RUN) {
    await sb.from('restaurants').delete().eq('id', dropRestaurant.id).throwOnError()
  }
  summary.restaurantsDeleted++
}

async function runParkMerges(parks: Park[], restaurants: Restaurant[]) {
  console.log('\n=== Park merges ===')

  for (const merge of PARK_MERGES) {
    const keep = parks.find(park => park.name === merge.keep)
    if (!keep) {
      console.log(`  skip: keep park not found: ${merge.keep}`)
      continue
    }

    for (const dropName of merge.drops) {
      const drop = parks.find(park => park.name === dropName)
      if (!drop) {
        console.log(`  skip: drop park not found: ${dropName}`)
        continue
      }

      console.log(`  ${drop.name} -> ${keep.name}`)
      const keepRestaurants = restaurants.filter(r => r.park_id === keep.id)
      const dropRestaurants = restaurants.filter(r => r.park_id === drop.id)
      const keepByName = new Map(keepRestaurants.map(r => [normalized(r.name), r]))

      for (const restaurant of dropRestaurants) {
        const existing = keepByName.get(normalized(restaurant.name))
        if (existing) {
          await mergeRestaurants(existing, restaurant)
          summary.restaurantMerges++
        } else {
          console.log(`    moving restaurant: "${restaurant.name}"`)
          if (!DRY_RUN) {
            await sb.from('restaurants').update({ park_id: keep.id }).eq('id', restaurant.id).throwOnError()
          }
          summary.restaurantsMoved++
        }
      }

      if (!DRY_RUN) {
        await sb.from('parks').delete().eq('id', drop.id).throwOnError()
      }
      summary.parkMerges++
    }
  }
}

async function runRestaurantMerges(parks: Park[], restaurants: Restaurant[]) {
  console.log('\n=== Restaurant merges ===')

  for (const merge of RESTAURANT_MERGES) {
    const park = parks.find(row => row.name === merge.park)
    if (!park) {
      console.log(`  skip: park not found: ${merge.park}`)
      continue
    }

    const candidates = restaurants.filter(row =>
      row.park_id === park.id &&
      (row.name === merge.keep || merge.drops.includes(row.name))
    )

    if (candidates.length <= 1) {
      console.log(`  skip: ${merge.park} / ${merge.keep} has ${candidates.length} matching record`)
      continue
    }

    let keep = candidates.find(row => row.name === merge.keep)
    if (!keep) keep = candidates[0]

    if (keep.name !== merge.keep) {
      console.log(`  rename keeper "${keep.name}" -> "${merge.keep}"`)
      if (!DRY_RUN) {
        await sb.from('restaurants').update({ name: merge.keep }).eq('id', keep.id).throwOnError()
      }
    }

    for (const drop of candidates.filter(row => row.id !== keep.id)) {
      await mergeRestaurants(keep, drop)
      summary.restaurantMerges++
    }
  }
}

async function runItemCleanup(items: ItemRow[]) {
  console.log('\n=== Item cleanup ===')
  const seenByRestaurant = new Map<string, ItemRow>()

  for (const item of items) {
    const cleanedName = cleanDisplayText(item.name)

    if (isLikelyMenuSectionHeader(item.name)) {
      console.log(`  delete section header: "${item.name}"`)
      await deleteItem(item)
      summary.sectionHeadersDeleted++
      continue
    }

    const duplicateKey = `${item.restaurant_id}:${normalized(item.name)}`
    const existing = seenByRestaurant.get(duplicateKey)
    if (existing && existing.id !== item.id) {
      console.log(`  duplicate item in restaurant: "${item.name}"`)
      await mergeDuplicateItem(item, existing)
      continue
    }
    seenByRestaurant.set(duplicateKey, item)

    const displayCategory = getDisplayCategory(asDisplayItem(item))
    const patch: Record<string, unknown> = {}

    if (cleanedName && cleanedName !== item.name) {
      patch.name = cleanedName
      summary.itemNamesCleaned++
      console.log(`  clean name: "${item.name}" -> "${cleanedName}"`)
    }

    if (displayCategory !== item.category) {
      patch.category = displayCategory
      summary.categoryFixes++
      console.log(`  category: "${item.name}" ${item.category} -> ${displayCategory}`)
    }

    await updateItem(item.id, patch)

    const nutrition = getNutrition(item)
    if (!nutrition) continue
    const lowConfidence = nutrition.confidence_score < 70
    const caloriesZero = nutrition.calories === 0
    const carbsZero = nutrition.carbs === 0
    const knownMacroValues = MACRO_COLUMNS
      .map(column => nutrition[column])
      .filter((value): value is number => value != null)
    const allKnownZeros = knownMacroValues.length > 0 && knownMacroValues.every(value => value === 0)

    if (lowConfidence && caloriesZero && carbsZero && allKnownZeros && !zeroNutritionShouldStay(cleanedName || item.name)) {
      console.log(`  mark nutrition unavailable: "${cleanedName || item.name}"`)
      summary.nutritionUnavailableFixes++
      if (!DRY_RUN) {
        await sb
          .from('nutritional_data')
          .update({
            calories: null,
            carbs: null,
            fat: null,
            sugar: null,
            protein: null,
            fiber: null,
            sodium: null,
            cholesterol: null,
            alcohol_grams: null,
          })
          .eq('id', nutrition.id)
          .throwOnError()
      }
    }
  }
}

async function main() {
  console.log(`Public QA data cleanup - ${DRY_RUN ? 'DRY RUN' : 'APPLY'}\n`)

  const [parks, restaurants, items] = await Promise.all([
    fetchAll<Park>('parks', '*'),
    fetchAll<Restaurant>('restaurants', '*'),
    fetchAll<ItemRow>('menu_items', '*, nutritional_data(*), allergens(*), restaurant:restaurants(*, park:parks(*))'),
  ])

  console.log(`Loaded ${parks.length} parks, ${restaurants.length} restaurants, ${items.length} menu items`)

  await runParkMerges(parks, restaurants)
  await runRestaurantMerges(parks, restaurants)

  const latestItems = APPLY
    ? await fetchAll<ItemRow>('menu_items', '*, nutritional_data(*), allergens(*), restaurant:restaurants(*, park:parks(*))')
    : items
  await runItemCleanup(latestItems)

  console.log('\n=== Summary ===')
  for (const [key, value] of Object.entries(summary)) {
    console.log(`${key}: ${value}`)
  }
  console.log(DRY_RUN ? '\nDry run only. Re-run with --apply to write changes.' : '\nApplied public QA data cleanup.')
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
