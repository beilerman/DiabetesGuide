import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import type { MergeResult } from './sync/merge.js'
import type { EstimatedItem } from './sync/estimate-nutrition.js'
import { normalizeName } from './scrapers/utils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const supabase = createClient(url, key)

// Auto-approve threshold: items at or above this confidence from official/universal sources
const AUTO_APPROVE_MIN_CONFIDENCE = 70

interface ApprovalResult {
  imported: number
  skipped: number
  duplicates: number
  errors: string[]
}

function inferLocation(parkName: string): string {
  const n = parkName.toLowerCase()
  if (/aulani/.test(n)) return 'Aulani Resort'
  if (/disney (magic|wonder|dream|fantasy|wish|treasure)/.test(n)) return 'Disney Cruise Line'
  if (/downtown disney|disneyland/.test(n)) return 'Disneyland Resort'
  if (/disney|magic kingdom|epcot|hollywood studios|animal kingdom/.test(n)) return 'Walt Disney World'
  if (/epic universe/.test(n)) return 'Universal Orlando Resort'
  if (/universal.*(hollywood|studios hollywood)/.test(n)) return 'Universal Hollywood'
  if (/universal|islands of adventure|volcano bay/.test(n)) return 'Universal Orlando Resort'
  if (/seaworld/.test(n)) return 'SeaWorld Parks'
  if (/busch gardens/.test(n)) return 'SeaWorld Parks'
  if (/dollywood/.test(n)) return 'Dollywood'
  if (/kings island/.test(n)) return 'Kings Island'
  return 'Other'
}

function inferTimezone(parkName: string): string {
  const n = parkName.toLowerCase()
  if (/aulani/.test(n)) return 'Pacific/Honolulu'
  if (/disneyland|downtown disney|hollywood/.test(n)) return 'America/Los_Angeles'
  // Dollywood (Pigeon Forge, TN) and Kings Island (Mason, OH) are both Eastern
  return 'America/New_York'
}

async function findOrCreatePark(parkName: string): Promise<string> {
  const { data: existing } = await supabase
    .from('parks')
    .select('id')
    .ilike('name', `%${parkName}%`)
    .limit(1)

  if (existing && existing.length > 0) return existing[0].id

  const { data: newPark, error } = await supabase
    .from('parks')
    .insert({
      name: parkName,
      location: inferLocation(parkName),
      timezone: inferTimezone(parkName),
    })
    .select('id')
    .single()

  if (error) throw error
  return newPark.id
}

async function findOrCreateRestaurant(
  parkId: string,
  restaurantName: string,
  landName?: string
): Promise<string> {
  const { data: existing } = await supabase
    .from('restaurants')
    .select('id')
    .eq('park_id', parkId)
    .ilike('name', restaurantName)
    .limit(1)

  if (existing && existing.length > 0) return existing[0].id

  const { data: newRest, error } = await supabase
    .from('restaurants')
    .insert({
      park_id: parkId,
      name: restaurantName,
      land: landName,
    })
    .select('id')
    .single()

  if (error) throw error
  return newRest.id
}

/**
 * Check if a menu item already exists in the restaurant (fuzzy name match).
 * Returns the existing item ID if found, null otherwise.
 */
async function findExistingMenuItem(
  restaurantId: string,
  itemName: string
): Promise<string | null> {
  const { data: items } = await supabase
    .from('menu_items')
    .select('id, name')
    .eq('restaurant_id', restaurantId)

  if (!items || items.length === 0) return null

  const normalized = normalizeName(itemName)
  for (const item of items) {
    if (normalizeName(item.name) === normalized) {
      return item.id
    }
  }

  return null
}

async function importItem(item: EstimatedItem): Promise<'imported' | 'duplicate'> {
  const parkId = await findOrCreatePark(item.parkName)
  const restaurantId = await findOrCreateRestaurant(parkId, item.restaurantName, item.landName)

  // Duplicate check: skip if normalized name already exists in this restaurant
  const existingId = await findExistingMenuItem(restaurantId, item.itemName)
  if (existingId) {
    return 'duplicate'
  }

  const { data: menuItem, error: menuErr } = await supabase
    .from('menu_items')
    .insert({
      restaurant_id: restaurantId,
      name: item.itemName,
      description: item.description,
      price: item.price,
      category: item.category,
    })
    .select('id')
    .single()

  if (menuErr) throw menuErr

  if (item.nutrition) {
    const { error: nutErr } = await supabase
      .from('nutritional_data')
      .insert({
        menu_item_id: menuItem.id,
        calories: item.nutrition.calories,
        carbs: item.nutrition.carbs,
        fat: item.nutrition.fat,
        protein: item.nutrition.protein,
        sugar: item.nutrition.sugar,
        fiber: item.nutrition.fiber,
        sodium: item.nutrition.sodium,
        source: 'crowdsourced',
        confidence_score: item.nutrition.confidence,
      })

    if (nutErr) console.error(`  Nutrition insert error for ${item.itemName}:`, nutErr)
  }

  return 'imported'
}

async function importApproved(items: EstimatedItem[]): Promise<ApprovalResult> {
  const result: ApprovalResult = {
    imported: 0,
    skipped: 0,
    duplicates: 0,
    errors: [],
  }

  for (const item of items) {
    try {
      console.log(`  ${item.restaurantName} - ${item.itemName}...`)
      const outcome = await importItem(item)
      if (outcome === 'duplicate') {
        console.log(`    [SKIP] duplicate`)
        result.duplicates++
      } else {
        result.imported++
      }
    } catch (err) {
      const msg = `Error importing ${item.itemName}: ${err}`
      console.error(`  ${msg}`)
      result.errors.push(msg)
    }
  }

  return result
}

// CLI entry point
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const approveAll = args.includes('--all')
  const autoApprove = args.includes('--auto')

  const pendingDir = resolve(__dirname, '../data/pending')
  const approvedDir = resolve(__dirname, '../data/approved')

  if (!existsSync(pendingDir)) {
    console.error('No pending data found.')
    process.exit(1)
  }

  const files = readdirSync(pendingDir).filter((f: string) => f.startsWith('estimated-'))

  if (files.length === 0) {
    console.error('No estimated data found.')
    process.exit(1)
  }

  const latestFile = files.sort().pop()!
  const data = JSON.parse(readFileSync(resolve(pendingDir, latestFile), 'utf-8')) as MergeResult & { newItems: EstimatedItem[] }

  let itemsToApprove: EstimatedItem[]
  let deferred: EstimatedItem[]

  if (approveAll) {
    itemsToApprove = data.newItems
    deferred = []
    console.log(`Approving all ${itemsToApprove.length} new items...`)
  } else if (autoApprove) {
    // Auto mode: only approve items with high confidence AND nutrition data
    itemsToApprove = data.newItems.filter(
      item => item.confidence >= AUTO_APPROVE_MIN_CONFIDENCE && item.nutrition && !item.needsManualNutrition
    )
    deferred = data.newItems.filter(
      item => !(item.confidence >= AUTO_APPROVE_MIN_CONFIDENCE && item.nutrition && !item.needsManualNutrition)
    )
    console.log(`Auto-approving ${itemsToApprove.length} high-confidence items (${deferred.length} deferred for review)...`)
  } else {
    console.log('Interactive mode not yet implemented.')
    console.log('Use --all to approve all items, --auto for high-confidence only, or manually edit the pending JSON file.')
    process.exit(0)
  }

  if (itemsToApprove.length === 0) {
    console.log('No items to approve.')
    process.exit(0)
  }

  importApproved(itemsToApprove)
    .then(result => {
      if (!existsSync(approvedDir)) {
        mkdirSync(approvedDir, { recursive: true })
      }

      // Move file to approved (or keep in pending if items were deferred)
      if (deferred.length === 0) {
        renameSync(
          resolve(pendingDir, latestFile),
          resolve(approvedDir, latestFile)
        )
      } else {
        // Write deferred items back to pending for manual review
        const deferredData = { ...data, newItems: deferred }
        writeFileSync(resolve(pendingDir, latestFile), JSON.stringify(deferredData, null, 2))
        console.log(`\n${deferred.length} items remain in ${latestFile} for manual review`)
      }

      console.log('')
      console.log('=== Import Complete ===')
      console.log(`Imported: ${result.imported}`)
      console.log(`Duplicates skipped: ${result.duplicates}`)
      console.log(`Errors: ${result.errors.length}`)
    })
    .catch(console.error)
}
