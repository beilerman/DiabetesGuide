/**
 * Insert AllEars 2026 Disney menus into the DB.
 *
 * Input: data/scraped/allears-disney-batch*.json — array of:
 *   { park, url, h1, count, items: [{name, description, price}] }
 *
 * Approach:
 *   1. For each menu, derive the venue name from the AllEars `h1` text
 *      ("Be Our Guest 2026 Lunch Menu and Prices" → "Be Our Guest").
 *   2. Find the matching DB restaurant by normalized name comparison.
 *   3. For each item, skip if a same-name item already exists; otherwise insert.
 *   4. Insert empty nutrition shells (the Codex pass will fill them).
 *
 * Conservative: never deletes or replaces existing items.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { unwrapOne, type RestaurantWithPark } from './lib/supabase-joins.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

interface ScrapedMenu {
  park: string
  url: string
  h1: string
  count: number
  items: { name: string; description: string; price: string }[]
}

interface DBRestaurant {
  id: string
  name: string
  park_id: string
  park_name?: string
}

function normalize(s: string): string {
  return s.toLowerCase()
    // Strip possessive 's first so "universal's" and "universal" match.
    .replace(/['‘’´`]s\b/g, '')
    .replace(/'|‘|’|´|`/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Extract venue name from AllEars h1 like "Be Our Guest 2026 Lunch Menu and Prices". */
function venueFromH1(h1: string): string {
  return h1
    .replace(/\b(2026|2025|2024|2023|2022)\b/g, '')
    // Meal types — handle "all day" with space, hyphen, or no separator
    .replace(/\b(breakfast|lunch|dinner|brunch|snacks?|all[\s-]?day|child(?:ren)?|kids?)\b/gi, '')
    .replace(/\bmenu(s)?\b/gi, '')
    .replace(/\bprices?\b/gi, '')
    .replace(/\bduring\s+\d{4}/gi, '')
    .replace(/\s+and\s+$/i, '')
    .replace(/\s+\|\s+.*$/, '')
    .replace(/\s+-\s+.*$/, '')
    // Strip stray punctuation that h1 sometimes leaves at the end
    .replace(/\s*[\/'`'’´]\s*$/g, '')
    .replace(/\s*[\/'`'’´]\s*[\/'`'’´]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Disney-park slug from AllEars URL family → DB-park-name regex hints. */
const PARK_HINTS: Record<string, RegExp[]> = {
  'magic-kingdom':         [/magic kingdom/i],
  'epcot':                 [/^epcot|^walt disney world festivals/i],
  'hollywood-studios':     [/hollywood studios/i],
  'animal-kingdom':        [/animal kingdom/i],
  'disney-springs':        [/disney springs/i],
  'typhoon-lagoon':        [/typhoon lagoon/i],
  'blizzard-beach':        [/blizzard beach/i],
  'resort-hotels':         [/resort|hotel|inn$/i],
  'dlr-disneyland':        [/disneyland park/i],
  'dlr-dca':               [/california adventure/i],
  'dlr-downtown':          [/downtown disney/i],
}

async function loadAllRestaurants(): Promise<DBRestaurant[]> {
  const { data, error } = await sb.from('restaurants').select('id, name, park_id, park:parks(name)')
  if (error) throw new Error(error.message)
  type Row = { id: string; name: string; park_id: string } & Pick<RestaurantWithPark, 'park'>
  return (data ?? []).map((r) => {
    const row = r as Row
    return {
      id: row.id,
      name: row.name,
      park_id: row.park_id,
      park_name: unwrapOne(row.park)?.name ?? undefined,
    }
  })
}

const PARK_FOR_SLUG: Record<string, { name: string; location: string; timezone: string }> = {
  'magic-kingdom':       { name: 'Magic Kingdom Park', location: 'Walt Disney World', timezone: 'America/New_York' },
  'epcot':               { name: 'EPCOT', location: 'Walt Disney World', timezone: 'America/New_York' },
  'hollywood-studios':   { name: "Disney's Hollywood Studios", location: 'Walt Disney World', timezone: 'America/New_York' },
  'animal-kingdom':      { name: "Disney's Animal Kingdom", location: 'Walt Disney World', timezone: 'America/New_York' },
  'disney-springs':      { name: 'Disney Springs', location: 'Walt Disney World', timezone: 'America/New_York' },
  'typhoon-lagoon':      { name: "Disney's Typhoon Lagoon Water Park", location: 'Walt Disney World', timezone: 'America/New_York' },
  'blizzard-beach':      { name: "Disney's Blizzard Beach Water Park", location: 'Walt Disney World', timezone: 'America/New_York' },
  'resort-hotels':       { name: 'Walt Disney World Resorts', location: 'Walt Disney World', timezone: 'America/New_York' },
  'dlr-disneyland':      { name: 'Disneyland Park', location: 'Disneyland Resort', timezone: 'America/Los_Angeles' },
  'dlr-dca':             { name: 'Disney California Adventure Park', location: 'Disneyland Resort', timezone: 'America/Los_Angeles' },
  'dlr-downtown':        { name: 'Downtown Disney District', location: 'Disneyland Resort', timezone: 'America/Los_Angeles' },
}

async function findOrCreatePark(parkSlug: string): Promise<string | null> {
  const meta = PARK_FOR_SLUG[parkSlug]
  if (!meta) return null
  // Find by exact normalized name
  const { data: existing } = await sb.from('parks').select('id, name')
  for (const p of existing ?? []) {
    if (normalize((p as { id: string; name: string }).name) === normalize(meta.name)) return (p as { id: string; name: string }).id
  }
  const { data: row, error } = await sb.from('parks').insert({
    name: meta.name, location: meta.location, timezone: meta.timezone,
  }).select('id').single()
  if (error) { console.error(`createPark failed (${meta.name}): ${error.message}`); return null }
  console.log(`  + created park: ${meta.name}`)
  return (row as { id: string }).id
}

async function findOrCreateRestaurant(parkSlug: string, restName: string, rests: DBRestaurant[]): Promise<DBRestaurant | null> {
  const parkId = await findOrCreatePark(parkSlug)
  if (!parkId) return null
  const target = normalize(restName)
  for (const r of rests) {
    if (r.park_id === parkId && normalize(r.name) === target) return r
  }
  const { data: row, error } = await sb.from('restaurants').insert({
    park_id: parkId, name: restName,
  }).select('id, name, park_id').single()
  if (error) { console.error(`createRestaurant failed (${restName}): ${error.message}`); return null }
  const newRest: DBRestaurant = { id: (row as { id: string }).id, name: restName, park_id: parkId }
  rests.push(newRest)
  console.log(`  + created restaurant: ${restName} (${parkSlug})`)
  return newRest
}

function findRestaurantByVenue(rests: DBRestaurant[], venue: string, parkSlug: string): DBRestaurant | null {
  const target = normalize(venue)
  if (!target) return null

  const hints = PARK_HINTS[parkSlug] ?? []
  const inHintedPark = (r: DBRestaurant) => {
    if (hints.length === 0) return true
    return hints.some(h => h.test(r.park_name ?? ''))
  }

  // Exact normalized match first, restricted to hinted park
  for (const r of rests) {
    if (!inHintedPark(r)) continue
    if (normalize(r.name) === target) return r
  }
  // Then exact normalized match anywhere
  for (const r of rests) {
    if (normalize(r.name) === target) return r
  }
  // Then prefix/contains in hinted park
  for (const r of rests) {
    if (!inHintedPark(r)) continue
    const n = normalize(r.name)
    if (n.startsWith(target) || target.startsWith(n)) return r
  }
  // Last resort: substring match in hinted park, but only if 75%+ of chars overlap
  let best: { r: DBRestaurant; score: number } | null = null
  for (const r of rests) {
    if (!inHintedPark(r)) continue
    const n = normalize(r.name)
    if (n.includes(target) || target.includes(n)) {
      const score = Math.min(n.length, target.length) / Math.max(n.length, target.length)
      if (score >= 0.75 && (!best || score > best.score)) best = { r, score }
    }
  }
  return best?.r ?? null
}

function inferCategory(name: string, description: string): 'entree' | 'snack' | 'beverage' | 'dessert' | 'side' {
  const t = `${name} ${description}`.toLowerCase()
  if (/\b(coffee|tea|cocoa|water|milk|juice|soda|coke|sprite|fanta|lemonade|fountain|beverage|drink|smoothie|shake|cocktail|beer|wine|sake)\b/.test(t)) return 'beverage'
  if (/\b(churro|cookie|cake|brownie|sundae|ice cream|gelato|sweet|mousse|pudding|pie|donut|doughnut|cupcake|tart|pastry|cinnamon roll|funnel cake)\b/.test(t)) return 'dessert'
  if (/\b(fries|rice|beans|salad|chips|side|slaw|corn on the cob|guacamole|salsa)\b/.test(t) && !/\bbowl\b|\bnachos\b|\bburger\b|\bsandwich\b/.test(t)) return 'side'
  if (/\b(pretzel|popcorn|nachos\b|chip|snack)\b/.test(t) && !/\bbowl\b/.test(t)) return 'snack'
  return 'entree'
}

function parsePrice(p: string): number | null {
  const m = p.match(/\$?([\d.]+)/)
  if (!m) return null
  const n = parseFloat(m[1])
  return isFinite(n) ? n : null
}

async function main() {
  const files = readdirSync(resolve(ROOT, 'data', 'scraped'))
    .filter(f => /^allears-disney-batch.*\.json$/.test(f))
    .map(f => resolve(ROOT, 'data', 'scraped', f))
  if (files.length === 0) { console.error('No allears-disney-batch*.json files found'); process.exit(1) }
  console.log(`Loading: ${files.map(f => f.split(/[/\\]/).pop()).join(', ')}`)

  const menus: ScrapedMenu[] = []
  for (const f of files) {
    const data = JSON.parse(readFileSync(f, 'utf-8')) as ScrapedMenu[]
    menus.push(...data)
  }
  console.log(`Loaded ${menus.length} menus`)

  const rests = await loadAllRestaurants()
  console.log(`Loaded ${rests.length} DB restaurants`)

  let venueMatched = 0
  let venueMissed = 0
  let itemsInserted = 0
  let itemsSkippedExisting = 0
  let errors = 0
  const missedVenues: string[] = []

  for (const menu of menus) {
    if (!menu.h1) continue
    const venue = venueFromH1(menu.h1)
    let rest = findRestaurantByVenue(rests, venue, menu.park)
    if (!rest) {
      // Auto-create the restaurant (and park if needed) so DLR-side venues land somewhere.
      rest = await findOrCreateRestaurant(menu.park, venue, rests)
      if (!rest) {
        venueMissed++
        missedVenues.push(`${venue} (${menu.park})`)
        continue
      }
    }
    venueMatched++

    // Existing items in the restaurant
    const { data: existing } = await sb.from('menu_items').select('name').eq('restaurant_id', rest.id)
    const existingNames = new Set((existing ?? []).map(r => normalize((r as { name: string }).name)))

    for (const item of menu.items) {
      const itemName = item.name?.trim()
      if (!itemName) continue
      const norm = normalize(itemName)
      if (existingNames.has(norm)) { itemsSkippedExisting++; continue }

      const description = item.description?.trim() || null
      const price = item.price ? parsePrice(item.price) : null
      const category = inferCategory(itemName, description ?? '')

      const { data: row, error } = await sb.from('menu_items')
        .insert({ restaurant_id: rest.id, name: itemName, description, price, category })
        .select('id')
        .single()
      if (error) { errors++; continue }

      // Empty nutrition shell (Codex/AI pass will fill later)
      const { error: nutErr } = await sb.from('nutritional_data').insert({
        menu_item_id: (row as { id: string }).id,
        source: 'crowdsourced',
        confidence_score: null,
      })
      if (nutErr) errors++
      else itemsInserted++
      existingNames.add(norm)
    }
  }

  console.log(`\n=== Done ===`)
  console.log(`Venues matched:  ${venueMatched}`)
  console.log(`Venues missed:   ${venueMissed}`)
  console.log(`Items inserted:  ${itemsInserted}`)
  console.log(`Items skipped (already exist): ${itemsSkippedExisting}`)
  console.log(`Errors: ${errors}`)
  if (missedVenues.length > 0) {
    console.log(`\nMissed venues (first 30):`)
    for (const v of missedVenues.slice(0, 30)) console.log(`  - ${v}`)
  }
}

main().catch(err => {
  console.error('insert-allears-disney failed:', err)
  process.exit(1)
})
