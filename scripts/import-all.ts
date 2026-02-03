import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const supabase = createClient(url, key)

interface RawItem {
  land: string
  restaurant: string
  name: string
  description: string
  calories: number
  carbs: number
  fat: number
  type: 'food' | 'drink'
  vegetarian: boolean
  isFried: boolean
}

interface RawPark {
  id: string
  name: string
  subtitle?: string
  lands: string[]
  menuItems: RawItem[]
}

function inferCategory(item: RawItem): string {
  if (item.type === 'drink') return 'beverage'
  const n = item.name.toLowerCase()
  if (/cookie|cake|churro|brownie|sundae|ice cream|mousse|pudding|crisp/.test(n)) return 'dessert'
  if (/fries|coleslaw|corn|rice|beans|salad|fruit|side/.test(n)) return 'side'
  if (item.calories < 300) return 'snack'
  return 'entree'
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

async function importAll() {
  const parksDir = resolve(__dirname, '../data/parks')
  const files = readdirSync(parksDir).filter(f => f.endsWith('.json')).sort()

  let totalNewParks = 0
  let totalExistingParks = 0
  let totalNewRestaurants = 0
  let totalNewItems = 0
  let totalSkippedItems = 0

  for (const file of files) {
    console.log(`Importing ${file}...`)
    const raw = JSON.parse(readFileSync(resolve(parksDir, file), 'utf-8'))
    const parks: RawPark[] = raw.parks

    for (const park of parks) {
      // Check if park already exists
      const { data: existingPark } = await supabase
        .from('parks')
        .select('id')
        .eq('name', park.name)
        .single()

      let parkId: string
      if (existingPark) {
        parkId = existingPark.id
        console.log(`  Park: ${park.name} (existing)`)
        totalExistingParks++
      } else {
        const { data: newPark, error: parkErr } = await supabase
          .from('parks')
          .insert({ name: park.name, location: inferLocation(park.name), timezone: inferTimezone(park.name) })
          .select('id')
          .single()
        if (parkErr) { console.error('  Park insert error:', parkErr); continue }
        parkId = newPark.id
        console.log(`  Park: ${park.name} (new)`)
        totalNewParks++
      }

      // Group items by restaurant
      const restMap = new Map<string, { land: string; restaurant: string; items: RawItem[] }>()
      for (const item of park.menuItems) {
        const k = `${item.land}|||${item.restaurant}`
        if (!restMap.has(k)) restMap.set(k, { land: item.land, restaurant: item.restaurant, items: [] })
        restMap.get(k)!.items.push(item)
      }

      let fileNewRest = 0
      let fileExistingRest = 0
      let fileNewItems = 0
      let fileSkippedItems = 0

      for (const [, rest] of restMap) {
        // Check if restaurant exists for this park
        const { data: existingRest } = await supabase
          .from('restaurants')
          .select('id')
          .eq('park_id', parkId)
          .eq('name', rest.restaurant)
          .single()

        let restId: string
        if (existingRest) {
          restId = existingRest.id
          fileExistingRest++
        } else {
          const { data: newRest, error: restErr } = await supabase
            .from('restaurants')
            .insert({ park_id: parkId, name: rest.restaurant, land: rest.land })
            .select('id')
            .single()
          if (restErr) { console.error('  Restaurant insert error:', restErr); continue }
          restId = newRest.id
          fileNewRest++
        }

        for (const item of rest.items) {
          // Check if menu item exists for this restaurant
          const { data: existingItem } = await supabase
            .from('menu_items')
            .select('id')
            .eq('restaurant_id', restId)
            .eq('name', item.name)
            .single()

          if (existingItem) {
            fileSkippedItems++
            continue
          }

          const { data: menuRow, error: menuErr } = await supabase
            .from('menu_items')
            .insert({
              restaurant_id: restId,
              name: item.name,
              description: item.description || null,
              category: inferCategory(item),
              is_fried: item.isFried,
              is_vegetarian: item.vegetarian,
            })
            .select('id')
            .single()
          if (menuErr) { console.error('  Menu item insert error:', menuErr); continue }

          const { error: nutErr } = await supabase
            .from('nutritional_data')
            .insert({
              menu_item_id: menuRow.id,
              calories: item.calories,
              carbs: item.carbs,
              fat: item.fat,
              source: 'official',
              confidence_score: 70,
            })
          if (nutErr) console.error('  Nutrition insert error:', nutErr)

          fileNewItems++
        }
      }

      console.log(`  Restaurants: ${fileNewRest} new, ${fileExistingRest} existing`)
      console.log(`  Items: ${fileNewItems} new, ${fileSkippedItems} skipped`)
      totalNewRestaurants += fileNewRest
      totalNewItems += fileNewItems
      totalSkippedItems += fileSkippedItems
    }
  }

  console.log('')
  console.log('=== Import Complete ===')
  console.log(`Parks: ${totalNewParks} new, ${totalExistingParks} existing`)
  console.log(`Restaurants: ${totalNewRestaurants} new`)
  console.log(`Menu items: ${totalNewItems} new, ${totalSkippedItems} skipped (duplicate)`)
}

importAll().catch(console.error)
