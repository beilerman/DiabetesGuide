import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs'
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

/**
 * Find best matching restaurant in DB
 */
async function findMatchingRestaurant(
  restaurantName: string,
  parkName: string
): Promise<{ id: string; name: string } | null> {
  // First try exact park name match
  const { data: parks } = await supabase
    .from('parks')
    .select('id, name')
    .ilike('name', `%${parkName}%`)

  if (!parks || parks.length === 0) return null

  const parkIds = parks.map(p => p.id)

  // Get all restaurants for these parks
  const { data: restaurants } = await supabase
    .from('restaurants')
    .select('id, name')
    .in('park_id', parkIds)

  if (!restaurants || restaurants.length === 0) return null

  // Find best fuzzy match
  let bestMatch: { id: string; name: string } | null = null
  let bestScore = 0

  for (const restaurant of restaurants) {
    const score = fuzzyMatch(restaurantName, restaurant.name)
    if (score > bestScore && score >= 70) {
      bestScore = score
      bestMatch = restaurant
    }
  }

  return bestMatch
}

/**
 * Find best matching menu item in DB
 */
async function findMatchingMenuItem(
  itemName: string,
  restaurantId: string
): Promise<{ id: string; name: string } | null> {
  const { data: items } = await supabase
    .from('menu_items')
    .select('id, name')
    .eq('restaurant_id', restaurantId)

  if (!items || items.length === 0) return null

  let bestMatch: { id: string; name: string } | null = null
  let bestScore = 0

  for (const item of items) {
    const score = fuzzyMatch(itemName, item.name)
    if (score > bestScore && score >= 75) {
      bestScore = score
      bestMatch = item
    }
  }

  return bestMatch
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
  for (const [key, { items }] of itemMap) {
    // Sort by source priority (highest first)
    items.sort((a, b) => (SOURCE_PRIORITY[b.source] || 0) - (SOURCE_PRIORITY[a.source] || 0))

    const primary = items[0]

    // Check for price conflicts (>15% difference)
    const prices = items.filter(i => i.price).map(i => ({ source: i.source, price: i.price! }))
    let priceConflict: MergedItem['priceConflict'] | undefined

    if (prices.length >= 2) {
      const maxPrice = Math.max(...prices.map(p => p.price))
      const minPrice = Math.min(...prices.map(p => p.price))
      if ((maxPrice - minPrice) / minPrice > 0.15) {
        priceConflict = prices
        result.conflicts.push({
          item: `${primary.restaurantName} - ${primary.itemName}`,
          issue: `Price conflict: ${prices.map(p => `${p.source}: $${p.price}`).join(' vs ')}`,
        })
      }
    }

    // Check if item exists in DB
    const matchingRestaurant = await findMatchingRestaurant(primary.restaurantName, primary.parkName)
    let existingItem: { id: string; name: string } | null = null

    if (matchingRestaurant) {
      existingItem = await findMatchingMenuItem(primary.itemName, matchingRestaurant.id)
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

  if (!existsSync(scrapedDir)) {
    console.error('No scraped data found. Run scrapers first.')
    process.exit(1)
  }

  const files = readdirSync(scrapedDir).filter(f => f.endsWith('.json'))
  const scrapeResults: ScrapeResult[] = []

  for (const file of files) {
    const data = JSON.parse(readFileSync(resolve(scrapedDir, file), 'utf-8'))
    scrapeResults.push(data)
  }

  console.log(`Merging ${files.length} scrape results...`)

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
    .catch(console.error)
}
