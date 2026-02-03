import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import type { MergeResult } from './sync/merge.js'
import type { EstimatedItem } from './sync/estimate-nutrition.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const supabase = createClient(url, key)

interface ApprovalResult {
  imported: number
  skipped: number
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
  return 'Other'
}

function inferTimezone(parkName: string): string {
  const n = parkName.toLowerCase()
  if (/aulani/.test(n)) return 'Pacific/Honolulu'
  if (/disneyland|downtown disney|hollywood/.test(n)) return 'America/Los_Angeles'
  return 'America/New_York'
}

async function findOrCreatePark(parkName: string): Promise<string> {
  const { data: existing } = await supabase
    .from('parks')
    .select('id')
    .ilike('name', `%${parkName}%`)
    .single()

  if (existing) return existing.id

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
    .single()

  if (existing) return existing.id

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

async function importItem(item: EstimatedItem): Promise<void> {
  const parkId = await findOrCreatePark(item.parkName)
  const restaurantId = await findOrCreateRestaurant(parkId, item.restaurantName, item.landName)

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
}

async function importApproved(items: EstimatedItem[]): Promise<ApprovalResult> {
  const result: ApprovalResult = {
    imported: 0,
    skipped: 0,
    errors: [],
  }

  for (const item of items) {
    try {
      console.log(`  ${item.restaurantName} - ${item.itemName}...`)
      await importItem(item)
      result.imported++
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

  const pendingDir = resolve(__dirname, 'data/pending')
  const approvedDir = resolve(__dirname, 'data/approved')

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

  if (approveAll) {
    console.log(`Approving all ${data.newItems.length} new items...`)

    importApproved(data.newItems)
      .then(result => {
        if (!existsSync(approvedDir)) {
          mkdirSync(approvedDir, { recursive: true })
        }
        renameSync(
          resolve(pendingDir, latestFile),
          resolve(approvedDir, latestFile)
        )

        console.log('')
        console.log('=== Import Complete ===')
        console.log(`Imported: ${result.imported}`)
        console.log(`Errors: ${result.errors.length}`)
      })
      .catch(console.error)
  } else {
    console.log('Interactive mode not yet implemented.')
    console.log('Use --all to approve all items, or manually edit the pending JSON file.')
  }
}
