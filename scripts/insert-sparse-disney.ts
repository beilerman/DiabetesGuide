/**
 * One-off: insert the AllEars-sourced 2026 menus for 5 sparse Disney venues.
 *
 * Skips items that already exist (by normalized name within the same restaurant) so
 * this is safe to re-run after partial inserts.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

interface MenuItem {
  name: string
  description: string
  price: string
}

const VENUE_TO_RESTAURANT_ID: Record<string, string> = {
  'pecos-bill':     'eb0bb0e1-d32d-4b96-895e-4a991d4ea311', // Pecos Bill Tall Tale Inn @ Magic Kingdom
  'lunching-pad':   'e55f28a8-e94b-4253-a8d5-6735dc63ae64', // The Lunching Pad @ Magic Kingdom
  'leaning-palms':  '6c5f20b7-a6bb-485e-be23-f612dd6a4d5c', // Leaning Palms @ Typhoon Lagoon
  'the-market-hs':  '744f4a2c-14a8-46b0-8566-c75ec5939fcd', // The Market @ Hollywood Studios
  'napolini':       'ac76ff5e-8913-4422-b83b-4a35cece493d', // Napolini Pizzeria @ Downtown Disney District
}

type Category = 'entree' | 'snack' | 'beverage' | 'dessert' | 'side'

function inferCategory(name: string, description: string): Category {
  const text = `${name} ${description}`.toLowerCase()
  if (/\b(coffee|tea|cocoa|water|milk|juice|soda|coke|sprite|fanta|lemonade|fountain|beverage|drink|slush|smoothie|beer|wine|cocktail|margarita)\b/.test(text)) return 'beverage'
  if (/\b(churro|cookie|cake|brownie|sundae|ice cream|gelato|sweet|mousse|pudding|pie|donut|doughnut|cupcake|tart|pastry)\b/.test(text)) return 'dessert'
  if (/\b(fries|rice|beans|salad|chips|side|slaw|corn on the cob|guacamole|salsa|queso|dip)\b/.test(text) && !/\bbowl\b|\bnachos\b|\bburger\b|\bsandwich\b/.test(text)) return 'side'
  if (/\b(pretzel|popcorn|nachos\b|chip|snack)\b/.test(text) && !/\bbowl\b/.test(text)) return 'snack'
  return 'entree'
}

function parsePrice(p: string): number | null {
  const m = p.match(/\$?([\d.]+)/)
  if (!m) return null
  const n = parseFloat(m[1])
  return isFinite(n) ? n : null
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

async function existingItemNames(restaurantId: string): Promise<Set<string>> {
  const { data, error } = await sb.from('menu_items').select('name').eq('restaurant_id', restaurantId)
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((r) => normalize((r as { name: string }).name)))
}

async function main() {
  const dataPath = resolve(__dirname, '..', 'data', 'scraped', 'sparse-disney-menus-2026-05-03.json')
  const all = JSON.parse(readFileSync(dataPath, 'utf-8')) as Record<string, MenuItem[]>

  let totalInserted = 0
  let totalSkipped = 0
  let totalErrors = 0

  for (const [venueKey, items] of Object.entries(all)) {
    if (!Array.isArray(items)) continue
    const restaurantId = VENUE_TO_RESTAURANT_ID[venueKey]
    if (!restaurantId) {
      console.warn(`No restaurant_id mapped for ${venueKey} — skipping ${items.length} items`)
      continue
    }
    const existing = await existingItemNames(restaurantId)
    let inserted = 0
    let skipped = 0
    for (const item of items) {
      const name = item.name?.trim()
      if (!name) continue
      if (existing.has(normalize(name))) { skipped++; continue }
      const description = item.description?.trim() || null
      const price = item.price ? parsePrice(item.price) : null
      const category = inferCategory(name, description ?? '')

      const { data: row, error } = await sb
        .from('menu_items')
        .insert({
          restaurant_id: restaurantId,
          name,
          description,
          price,
          category,
        })
        .select('id')
        .single()

      if (error) {
        console.error(`  FAIL ${venueKey}: ${name} — ${error.message}`)
        totalErrors++
        continue
      }

      // Insert empty nutrition shell (NULL confidence so the audit doesn't flag it)
      const { error: nutErr } = await sb.from('nutritional_data').insert({
        menu_item_id: (row as { id: string }).id,
        source: 'crowdsourced',
        confidence_score: null,
      })
      if (nutErr) {
        console.error(`  NUT_FAIL ${venueKey}: ${name} — ${nutErr.message}`)
        totalErrors++
      }
      inserted++
      existing.add(normalize(name))
    }
    console.log(`${venueKey.padEnd(16)} inserted=${inserted}, skipped=${skipped}`)
    totalInserted += inserted
    totalSkipped += skipped
  }

  console.log(`\nTotal: inserted=${totalInserted}, skipped=${totalSkipped}, errors=${totalErrors}`)
}

main().catch((err) => {
  console.error('insert-sparse-disney failed:', err)
  process.exit(1)
})
