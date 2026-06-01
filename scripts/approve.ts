import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import type { MergeResult } from './sync/merge.js'
import type { EstimatedItem } from './sync/estimate-nutrition.js'
import {
  normalizeName,
  sanitizeText,
  coerceCategory,
  clampInt,
  clampPrice,
} from './scrapers/utils.js'

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
// Safety circuit-breaker: refuse an unattended (--auto) run that would import an
// implausible number of items in one go (spoofed/runaway upstream). Override via env.
const AUTO_APPROVE_MAX_ITEMS = parseInt(process.env.AUTO_APPROVE_MAX_ITEMS || '1500', 10)
const INSERT_CHUNK = 500

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

/** Paginated full-table fetch (avoids the default 1000-row PostgREST cap). */
async function fetchAll<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
): Promise<T[]> {
  const all: T[] = []
  const page = 1000
  let from = 0
  for (;;) {
    const { data, error } = await client.from(table).select(columns).range(from, from + page - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as T[]))
    if (data.length < page) break
    from += page
  }
  return all
}

/**
 * In-memory mirror of parks/restaurants/menu_items loaded ONCE per run.
 * Replaces the per-item lookup storm (3-5 round-trips/item) with a single
 * paginated read, and gives cross-run idempotency: items already in the DB are
 * recognized without a UNIQUE constraint (which is added separately as a net).
 */
class ImportCache {
  // normalized park name -> id
  private parks = new Map<string, string>()
  // `${parkId}|${normRestName}` -> id
  private restaurants = new Map<string, string>()
  // `${restaurantId}|${normItemName}` -> existing item id
  private items = new Map<string, string>()

  static async load(client: SupabaseClient): Promise<ImportCache> {
    const c = new ImportCache()
    const parks = await fetchAll<{ id: string; name: string }>(client, 'parks', 'id, name')
    for (const p of parks) c.parks.set(normalizeName(p.name), p.id)

    const rests = await fetchAll<{ id: string; park_id: string; name: string }>(
      client, 'restaurants', 'id, park_id, name',
    )
    for (const r of rests) c.restaurants.set(`${r.park_id}|${normalizeName(r.name)}`, r.id)

    const items = await fetchAll<{ id: string; restaurant_id: string; name: string }>(
      client, 'menu_items', 'id, restaurant_id, name',
    )
    for (const it of items) c.items.set(`${it.restaurant_id}|${normalizeName(it.name)}`, it.id)

    console.log(`  cache: ${parks.length} parks, ${rests.length} restaurants, ${items.length} items`)
    return c
  }

  async resolvePark(client: SupabaseClient, parkName: string): Promise<string> {
    const norm = normalizeName(parkName)
    const hit = this.parks.get(norm)
    if (hit) return hit
    // substring fallback to mirror the prior ilike('%name%') behavior
    for (const [k, id] of this.parks) {
      if (k.includes(norm) || norm.includes(k)) {
        this.parks.set(norm, id)
        return id
      }
    }
    const { data, error } = await client
      .from('parks')
      .insert({ name: parkName, location: inferLocation(parkName), timezone: inferTimezone(parkName) })
      .select('id')
      .single()
    if (error) throw error
    this.parks.set(norm, data.id)
    return data.id
  }

  async resolveRestaurant(
    client: SupabaseClient, parkId: string, restaurantName: string, landName?: string,
  ): Promise<string> {
    const cacheKey = `${parkId}|${normalizeName(restaurantName)}`
    const hit = this.restaurants.get(cacheKey)
    if (hit) return hit
    const { data, error } = await client
      .from('restaurants')
      .insert({ park_id: parkId, name: restaurantName, land: landName })
      .select('id')
      .single()
    if (error) throw error
    this.restaurants.set(cacheKey, data.id)
    return data.id
  }

  hasItem(restaurantId: string, itemName: string): boolean {
    return this.items.has(`${restaurantId}|${normalizeName(itemName)}`)
  }

  markItem(restaurantId: string, itemName: string, id: string): void {
    this.items.set(`${restaurantId}|${normalizeName(itemName)}`, id)
  }
}

/** A scraped item validated/sanitized and resolved to a restaurant_id, ready to insert. */
interface PreparedItem {
  key: string // `${restaurantId}|${normName}` — unique within a batch
  restaurantId: string
  itemName: string
  payload: {
    restaurant_id: string
    name: string
    description: string | null
    price: number | null
    category: string
  }
  nutrition: EstimatedItem['nutrition']
}

function prepareItem(item: EstimatedItem, restaurantId: string): PreparedItem | null {
  const name = sanitizeText(item.itemName, 200)
  if (!name) return null // unusable name — drop
  const normName = normalizeName(name)
  return {
    key: `${restaurantId}|${normName}`,
    restaurantId,
    itemName: name,
    payload: {
      restaurant_id: restaurantId,
      name,
      description: sanitizeText(item.description, 2000) ?? null,
      price: clampPrice(item.price) ?? null,
      category: coerceCategory(item.category),
    },
    nutrition: item.nutrition,
  }
}

async function importApproved(items: EstimatedItem[]): Promise<ApprovalResult> {
  const result: ApprovalResult = { imported: 0, skipped: 0, duplicates: 0, errors: [] }

  console.log('Loading existing parks/restaurants/items into cache...')
  const cache = await ImportCache.load(supabase)

  // Phase 1: validate, resolve park/restaurant, dedup -> list of prepared inserts
  const prepared: PreparedItem[] = []
  const seenInBatch = new Set<string>()
  for (const item of items) {
    try {
      const parkId = await cache.resolvePark(supabase, item.parkName)
      const restaurantId = await cache.resolveRestaurant(supabase, parkId, item.restaurantName, item.landName)

      const p = prepareItem(item, restaurantId)
      if (!p) {
        result.skipped++
        continue
      }
      if (cache.hasItem(restaurantId, p.itemName) || seenInBatch.has(p.key)) {
        result.duplicates++
        continue
      }
      seenInBatch.add(p.key)
      prepared.push(p)
    } catch (err) {
      const msg = `Error preparing ${item.itemName}: ${err}`
      console.error(`  ${msg}`)
      result.errors.push(msg)
    }
  }

  // Phase 2: chunked bulk insert of menu_items, then nutritional_data, with a
  // compensating delete if a row's nutrition write fails (prevents orphans).
  for (let i = 0; i < prepared.length; i += INSERT_CHUNK) {
    const chunk = prepared.slice(i, i + INSERT_CHUNK)
    const { data: inserted, error: insErr } = await supabase
      .from('menu_items')
      .insert(chunk.map(c => c.payload))
      .select('id, restaurant_id, name')

    if (insErr || !inserted) {
      result.errors.push(`menu_items chunk insert failed: ${insErr?.message ?? 'no data returned'}`)
      continue
    }

    // Map returned rows back to prepared items by their unique key.
    const idByKey = new Map<string, string>()
    for (const row of inserted) {
      idByKey.set(`${row.restaurant_id}|${normalizeName(row.name)}`, row.id)
    }

    const nutritionRows: Record<string, unknown>[] = []
    const nutritionKeys: string[] = []
    for (const c of chunk) {
      const id = idByKey.get(c.key)
      if (!id) continue
      cache.markItem(c.restaurantId, c.itemName, id)
      result.imported++
      if (c.nutrition) {
        nutritionRows.push({
          menu_item_id: id,
          calories: clampInt(c.nutrition.calories, 0, 5000),
          carbs: clampInt(c.nutrition.carbs, 0, 2000),
          fat: clampInt(c.nutrition.fat, 0, 2000),
          protein: clampInt(c.nutrition.protein, 0, 2000),
          sugar: clampInt(c.nutrition.sugar, 0, 2000),
          fiber: clampInt(c.nutrition.fiber, 0, 2000),
          sodium: clampInt(c.nutrition.sodium, 0, 50000),
          source: 'crowdsourced',
          confidence_score: clampInt(c.nutrition.confidence, 0, 100),
        })
        nutritionKeys.push(c.key)
      }
    }

    if (nutritionRows.length > 0) {
      const { error: nutErr } = await supabase.from('nutritional_data').insert(nutritionRows)
      if (nutErr) {
        // Roll back the menu_items whose nutrition failed so we never leave an
        // item with silently-missing nutrition (the prior swallowed-error bug).
        const orphanIds = nutritionKeys.map(k => idByKey.get(k)!).filter(Boolean)
        await supabase.from('menu_items').delete().in('id', orphanIds)
        result.imported -= orphanIds.length
        result.errors.push(`nutrition insert failed for ${orphanIds.length} items (rolled back): ${nutErr.message}`)
      }
    }
  }

  return result
}

// CLI entry point
async function main(): Promise<void> {
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
  const data = JSON.parse(readFileSync(resolve(pendingDir, latestFile), 'utf-8')) as Omit<MergeResult, 'newItems'> & { newItems: EstimatedItem[] }

  let itemsToApprove: EstimatedItem[]
  let deferred: EstimatedItem[]

  const isHighConfidence = (item: EstimatedItem) =>
    item.confidence >= AUTO_APPROVE_MIN_CONFIDENCE && !!item.nutrition && !item.needsManualNutrition

  // --auto is the safe, gated mode and ALWAYS wins if both flags are present
  // (the npm script must never silently widen an automated run to --all).
  if (autoApprove) {
    if (approveAll) {
      console.warn('Both --auto and --all passed; using --auto (high-confidence only) for safety.')
    }
    itemsToApprove = data.newItems.filter(isHighConfidence)
    deferred = data.newItems.filter(item => !isHighConfidence(item))
    console.log(`Auto-approving ${itemsToApprove.length} high-confidence items (${deferred.length} deferred for review)...`)

    if (itemsToApprove.length > AUTO_APPROVE_MAX_ITEMS) {
      console.error(
        `Refusing to auto-approve ${itemsToApprove.length} items (> AUTO_APPROVE_MAX_ITEMS=${AUTO_APPROVE_MAX_ITEMS}). ` +
        `This is an anomalous volume — review data/pending/${latestFile} manually or raise the limit explicitly.`,
      )
      process.exit(1)
    }
  } else if (approveAll) {
    itemsToApprove = data.newItems
    deferred = []
    console.log(`Approving all ${itemsToApprove.length} new items...`)
  } else {
    console.log('No mode flag given. Use --auto for high-confidence only, or --all to import everything.')
    process.exit(0)
  }

  if (itemsToApprove.length === 0) {
    console.log('No items to approve.')
    process.exit(0)
  }

  const result = await importApproved(itemsToApprove)

  if (!existsSync(approvedDir)) {
    mkdirSync(approvedDir, { recursive: true })
  }

  // Move file to approved (or keep deferred items in pending for manual review)
  if (deferred.length === 0) {
    renameSync(resolve(pendingDir, latestFile), resolve(approvedDir, latestFile))
  } else {
    const deferredData = { ...data, newItems: deferred }
    writeFileSync(resolve(pendingDir, latestFile), JSON.stringify(deferredData, null, 2))
    console.log(`\n${deferred.length} items remain in ${latestFile} for manual review`)
  }

  console.log('')
  console.log('=== Import Complete ===')
  console.log(`Imported:           ${result.imported}`)
  console.log(`Duplicates skipped: ${result.duplicates}`)
  console.log(`Unusable skipped:   ${result.skipped}`)
  console.log(`Errors:             ${result.errors.length}`)

  // Surface failures to the caller (CI) instead of exiting 0 on a broken import.
  if (result.errors.length > 0) {
    process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
