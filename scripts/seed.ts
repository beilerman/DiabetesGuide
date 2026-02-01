import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
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

async function seed() {
  const raw = JSON.parse(readFileSync(resolve(__dirname, '../data/source.json'), 'utf-8'))
  const parks: RawPark[] = raw.parks

  let parkCount = 0
  let restCount = 0
  let itemCount = 0

  for (const park of parks) {
    const { data: parkRow, error: parkErr } = await supabase
      .from('parks')
      .insert({ name: park.name, location: 'Walt Disney World', timezone: 'America/New_York' })
      .select('id')
      .single()
    if (parkErr) { console.error('Park insert error:', parkErr); continue }
    parkCount++

    const restMap = new Map<string, { land: string; restaurant: string; items: RawItem[] }>()
    for (const item of park.menuItems) {
      const key = `${item.land}|||${item.restaurant}`
      if (!restMap.has(key)) restMap.set(key, { land: item.land, restaurant: item.restaurant, items: [] })
      restMap.get(key)!.items.push(item)
    }

    for (const [, rest] of restMap) {
      const { data: restRow, error: restErr } = await supabase
        .from('restaurants')
        .insert({ park_id: parkRow.id, name: rest.restaurant, land: rest.land })
        .select('id')
        .single()
      if (restErr) { console.error('Restaurant insert error:', restErr); continue }
      restCount++

      for (const item of rest.items) {
        const { data: menuRow, error: menuErr } = await supabase
          .from('menu_items')
          .insert({
            restaurant_id: restRow.id,
            name: item.name,
            description: item.description || null,
            category: inferCategory(item),
            is_fried: item.isFried,
            is_vegetarian: item.vegetarian,
          })
          .select('id')
          .single()
        if (menuErr) { console.error('Menu item insert error:', menuErr); continue }

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
        if (nutErr) console.error('Nutrition insert error:', nutErr)

        itemCount++
      }
    }
  }

  console.log(`Seeded: ${parkCount} parks, ${restCount} restaurants, ${itemCount} menu items`)
}

seed().catch(console.error)
