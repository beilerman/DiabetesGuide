import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { ScrapeResult, ScrapedRestaurant, ScrapedItem } from '../scrapers/types.js'
import { normalizeName } from '../scrapers/utils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const supabase = createClient(url, key)

// Source priority for conflict resolution (higher = more trusted)
const SOURCE_PRIORITY: Record<ScrapedItem['source'], number> = {
  official: 100,
  universal: 90, // Official Universal JSON endpoints
  allears: 80,
  touringplans: 70,
  dfb: 60,
  yelp: 40,
}

export interface MergedItem {
  restaurantName: string
  parkName: string
  landName?: string
  itemName: string
  description?: string
  price?: number
  category: 'entree' | 'dessert' | 'beverage' | 'side' | 'snack'
  sources: ScrapedItem['source'][]
  confidence: number
  isNew: boolean
  existingId?: string
  priceConflict?: { source: string; price: number }[]
}

export interface MergeResult {
  mergedAt: Date
  newItems: MergedItem[]
  updatedItems: MergedItem[]
  potentiallyRemoved: { restaurantName: string; itemName: string; lastSeen: Date }[]
  conflicts: { item: string; issue: string }[]
}

/**
 * Fuzzy match score between two strings (0-100)
 */
function fuzzyMatch(a: string, b: string): number {
  const na = normalizeName(a)
  const nb = normalizeName(b)

  if (na === nb) return 100

  // Check if one contains the other
  if (na.includes(nb) || nb.includes(na)) {
    const longer = na.length > nb.length ? na : nb
    const shorter = na.length > nb.length ? nb : na
    return Math.floor((shorter.length / longer.length) * 90)
  }

  // Word overlap
  const wordsA = new Set(na.split(' '))
  const wordsB = new Set(nb.split(' '))
  const intersection = [...wordsA].filter(w => wordsB.has(w))
  const union = new Set([...wordsA, ...wordsB])

  return Math.floor((intersection.length / union.size) * 80)
}

/** Paginated full-table fetch (avoids the default 1000-row PostgREST cap). */
async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const all: T[] = []
  const page = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + page - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as T[]))
    if (data.length < page) break
    from += page
  }
  return all
}

/**
 * In-memory index of the whole DB, loaded ONCE per merge. Replaces the prior
 * N+1 storm — 3 Supabase round-trips per scraped item (~10k round-trips/run) —
 * with three paginated reads. Restaurant/item matching then happens in memory.
 */
class DbIndex {
  private parks: { id: string; name: string; norm: string }[] = []
  private restaurantsByPark = new Map<string, { id: string; name: string }[]>()
  private itemsByRestaurant = new Map<string, { id: string; name: string }[]>()

  static async load(): Promise<DbIndex> {
    const idx = new DbIndex()
    const parks = await fetchAll<{ id: string; name: string }>('parks', 'id, name')
    idx.parks = parks.map(p => ({ ...p, norm: normalizeName(p.name) }))

    const rests = await fetchAll<{ id: string; park_id: string; name: string }>(
      'restaurants', 'id, park_id, name',
    )
    for (const r of rests) {
      const arr = idx.restaurantsByPark.get(r.park_id) ?? []
      arr.push({ id: r.id, name: r.name })
      idx.restaurantsByPark.set(r.park_id, arr)
    }

    const items = await fetchAll<{ id: string; restaurant_id: string; name: string }>(
      'menu_items', 'id, restaurant_id, name',
    )
    for (const it of items) {
      const arr = idx.itemsByRestaurant.get(it.restaurant_id) ?? []
      arr.push({ id: it.id, name: it.name })
      idx.itemsByRestaurant.set(it.restaurant_id, arr)
    }

    console.log(`  index: ${parks.length} parks, ${rests.length} restaurants, ${items.length} items`)
    return idx
  }

  findMatchingRestaurant(restaurantName: string, parkName: string): { id: string; name: string } | null {
    const np = normalizeName(parkName)
    let best: { id: string; name: string } | null = null
    let bestScore = 0
    for (const park of this.parks) {
      if (!(park.norm.includes(np) || np.includes(park.norm))) continue
      for (const r of this.restaurantsByPark.get(park.id) ?? []) {
        const score = fuzzyMatch(restaurantName, r.name)
        if (score > bestScore && score >= 70) {
          bestScore = score
          best = r
        }
      }
    }
    return best
  }

  findMatchingMenuItem(itemName: string, restaurantId: string): { id: string; name: string } | null {
    let best: { id: string; name: string } | null = null
    let bestScore = 0
    for (const item of this.itemsByRestaurant.get(restaurantId) ?? []) {
      const score = fuzzyMatch(itemName, item.name)
      if (score > bestScore && score >= 75) {
        bestScore = score
        best = item
      }
    }
    return best
  }
}

/**
 * Merge scraped data with existing DB
 */
export async function mergeScrapedData(scrapeResults: ScrapeResult[]): Promise<MergeResult> {
  const result: MergeResult = {
    mergedAt: new Date(),
    newItems: [],
    updatedItems: [],
    potentiallyRemoved: [],
    conflicts: [],
  }

  console.log('Loading DB index for matching...')
  const dbIndex = await DbIndex.load()

  // Group items by normalized restaurant+item name
  const itemMap = new Map<string, {
    items: (ScrapedRestaurant['items'][0] & {
      source: ScrapedItem['source']
      parkName: string
      restaurantName: string
      landName?: string
    })[]
  }>()

  for (const scrape of scrapeResults) {
    for (const restaurant of scrape.restaurants) {
      for (const item of restaurant.items) {
        const key = `${normalizeName(restaurant.parkName)}|${normalizeName(restaurant.restaurantName)}|${normalizeName(item.itemName)}`

        if (!itemMap.has(key)) {
          itemMap.set(key, { items: [] })
        }

        itemMap.get(key)!.items.push({
          ...item,
          source: scrape.source,
          parkName: restaurant.parkName,
          restaurantName: restaurant.restaurantName,
          landName: restaurant.landName,
        })
      }
    }
  }

  // Process each unique item
  for (const [, { items }] of itemMap) {
    // Sort by source priority (highest first)
    items.sort((a, b) => (SOURCE_PRIORITY[b.source] || 0) - (SOURCE_PRIORITY[a.source] || 0))

    const primary = items[0]

    // Check for price conflicts (>15% difference). Use a nullish check so a
    // legitimately-free ($0) item isn't dropped by the falsy filter.
    const prices = items.filter(i => i.price != null).map(i => ({ source: i.source, price: i.price! }))
    let priceConflict: MergedItem['priceConflict'] | undefined

    if (prices.length >= 2) {
      const maxPrice = Math.max(...prices.map(p => p.price))
      const minPrice = Math.min(...prices.map(p => p.price))
      if (minPrice > 0 && (maxPrice - minPrice) / minPrice > 0.15) {
        priceConflict = prices
        result.conflicts.push({
          item: `${primary.restaurantName} - ${primary.itemName}`,
          issue: `Price conflict: ${prices.map(p => `${p.source}: $${p.price}`).join(' vs ')}`,
        })
      }
    }

    // Check if item exists in DB (in-memory, no round-trip)
    const matchingRestaurant = dbIndex.findMatchingRestaurant(primary.restaurantName, primary.parkName)
    let existingItem: { id: string; name: string } | null = null

    if (matchingRestaurant) {
      existingItem = dbIndex.findMatchingMenuItem(primary.itemName, matchingRestaurant.id)
    }

    const merged: MergedItem = {
      restaurantName: primary.restaurantName,
      parkName: primary.parkName,
      landName: primary.landName,
      itemName: primary.itemName,
      description: primary.description,
      price: primary.price,
      category: primary.category || 'entree',
      sources: [...new Set(items.map(i => i.source))],
      confidence: SOURCE_PRIORITY[primary.source] || 50,
      isNew: !existingItem,
      existingId: existingItem?.id,
      priceConflict,
    }

    if (existingItem) {
      result.updatedItems.push(merged)
    } else {
      result.newItems.push(merged)
    }
  }

  return result
}

// CLI entry point
import { pathToFileURL } from 'url'

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scrapedDir = resolve(__dirname, '../../data/scraped')
  const maxAgeDays = parseInt(process.env.MERGE_MAX_AGE_DAYS || '7')

  if (!existsSync(scrapedDir)) {
    console.error('No scraped data found. Run scrapers first.')
    process.exit(1)
  }

  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  const allFiles = readdirSync(scrapedDir).filter(f => f.endsWith('.json'))

  // Only read files from the last N days to avoid re-merging stale data
  const files: string[] = []
  for (const file of allFiles) {
    const filePath = resolve(scrapedDir, file)
    const stat = statSync(filePath)
    if (stat.mtimeMs >= cutoff) {
      files.push(file)
    } else {
      console.log(`  Skipping stale file: ${file}`)
    }
  }

  const scrapeResults: ScrapeResult[] = []

  for (const file of files) {
    const data = JSON.parse(readFileSync(resolve(scrapedDir, file), 'utf-8'))
    scrapeResults.push(data)
  }

  console.log(`Merging ${files.length} scrape results (${allFiles.length - files.length} stale files skipped)...`)

  mergeScrapedData(scrapeResults)
    .then(result => {
      const pendingDir = resolve(__dirname, '../../data/pending')
      if (!existsSync(pendingDir)) {
        mkdirSync(pendingDir, { recursive: true })
      }

      const timestamp = new Date().toISOString().slice(0, 10)
      const outputPath = resolve(pendingDir, `merged-${timestamp}.json`)
      writeFileSync(outputPath, JSON.stringify(result, null, 2))

      console.log('')
      console.log('=== Merge Complete ===')
      console.log(`New items: ${result.newItems.length}`)
      console.log(`Updated items: ${result.updatedItems.length}`)
      console.log(`Conflicts: ${result.conflicts.length}`)
      console.log(`Output: ${outputPath}`)
    })
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
}
