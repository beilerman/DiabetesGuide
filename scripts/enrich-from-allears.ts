/**
 * Enrich menu items with descriptions and photo URLs from AllEars scraped data.
 * Matches scraped items to existing Supabase items by fuzzy name + restaurant.
 *
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/enrich-from-allears.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { ScrapeResult } from './scrapers/types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const supabase = createClient(url, key)

/**
 * Normalize name for fuzzy matching
 * - Lowercase
 * - Remove special characters except alphanumeric and spaces
 * - Collapse multiple spaces
 * - Remove common suffixes/prefixes
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Simple Levenshtein distance for fuzzy matching
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  return matrix[b.length][a.length]
}

/**
 * Calculate similarity score (0-1, higher is better)
 */
function similarity(a: string, b: string): number {
  const normA = normalizeName(a)
  const normB = normalizeName(b)
  if (normA === normB) return 1
  const maxLen = Math.max(normA.length, normB.length)
  if (maxLen === 0) return 1
  const dist = levenshtein(normA, normB)
  return 1 - dist / maxLen
}

/**
 * Map AllEars park names to our database park names
 */
const PARK_NAME_MAP: Record<string, string> = {
  'Magic Kingdom': 'Magic Kingdom',
  'EPCOT': 'EPCOT',
  'Hollywood Studios': 'Hollywood Studios',
  'Animal Kingdom': 'Animal Kingdom',
  'Disney Springs': 'Disney Springs',
}

interface DbMenuItem {
  id: string
  name: string
  description: string | null
  photo_url: string | null
  restaurant: {
    id: string
    name: string
    park: {
      id: string
      name: string
    }
  }
}

interface ScrapedItem {
  itemName: string
  description?: string
  price?: number
  photoUrl?: string
  category?: string
}

interface ScrapedRestaurant {
  parkName: string
  restaurantName: string
  landName?: string
  items: ScrapedItem[]
}

async function loadScrapedData(): Promise<ScrapedRestaurant[]> {
  const scrapedDir = resolve(__dirname, '../data/scraped')
  const files = readdirSync(scrapedDir)
    .filter(f => f.startsWith('allears-puppeteer') && f.endsWith('.json'))
    .sort()
    .reverse() // Most recent first

  if (files.length === 0) {
    console.error('No AllEars scraped data found in data/scraped/')
    console.error('Run: npm run scrape:allears-puppeteer')
    process.exit(1)
  }

  const latestFile = files[0]
  console.log(`Loading scraped data from: ${latestFile}`)

  const data: ScrapeResult = JSON.parse(readFileSync(resolve(scrapedDir, latestFile), 'utf-8'))

  if (data.restaurants.length === 0) {
    console.error('Scraped file has no restaurants. Scraper may have failed.')
    console.error('Errors:', data.errors)
    process.exit(1)
  }

  console.log(`Loaded ${data.restaurants.length} restaurants with ${data.restaurants.reduce((sum, r) => sum + r.items.length, 0)} items`)
  return data.restaurants as ScrapedRestaurant[]
}

async function fetchDbItems(): Promise<DbMenuItem[]> {
  console.log('Fetching menu items from database...')

  // Fetch all items in batches to avoid Supabase 1000-row default limit
  let allRows: DbMenuItem[] = []
  let from = 0
  const batchSize = 1000

  while (true) {
    const { data: batch, error } = await supabase
      .from('menu_items')
      .select(`
        id,
        name,
        description,
        photo_url,
        restaurant:restaurants (
          id,
          name,
          park:parks (
            id,
            name
          )
        )
      `)
      .range(from, from + batchSize - 1)

    if (error) {
      console.error('Failed to fetch menu items:', error)
      process.exit(1)
    }
    if (!batch?.length) break

    // Flatten the nested restaurant/park data
    const flattened = batch.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      photo_url: row.photo_url,
      restaurant: Array.isArray(row.restaurant) ? row.restaurant[0] : row.restaurant
    })).filter((row: any) => row.restaurant?.park)

    allRows = allRows.concat(flattened)
    if (batch.length < batchSize) break
    from += batchSize
  }

  console.log(`Fetched ${allRows.length} menu items`)
  return allRows
}

interface MatchResult {
  dbItem: DbMenuItem
  scrapedItem: ScrapedItem
  restaurantScore: number
  itemScore: number
}

async function enrichFromAllears() {
  const scrapedRestaurants = await loadScrapedData()
  const dbItems = await fetchDbItems()

  // Build index of DB items by park name for faster matching
  const dbByPark = new Map<string, DbMenuItem[]>()
  for (const item of dbItems) {
    const parkName = item.restaurant.park.name
    if (!dbByPark.has(parkName)) dbByPark.set(parkName, [])
    dbByPark.get(parkName)!.push(item)
  }

  let updatedDescriptions = 0
  let updatedPhotos = 0
  let noMatches = 0
  let alreadyHasData = 0

  // Process each scraped restaurant
  for (const scrapedRest of scrapedRestaurants) {
    const dbParkName = PARK_NAME_MAP[scrapedRest.parkName]
    if (!dbParkName) {
      console.log(`  Skipping unknown park: ${scrapedRest.parkName}`)
      continue
    }

    const parkItems = dbByPark.get(dbParkName) || []
    if (parkItems.length === 0) {
      console.log(`  No DB items found for park: ${dbParkName}`)
      continue
    }

    // Find matching restaurant in DB
    const restaurantMatches = parkItems.filter(item =>
      similarity(item.restaurant.name, scrapedRest.restaurantName) > 0.7
    )

    if (restaurantMatches.length === 0) {
      // Try partial match
      const normalizedRestName = normalizeName(scrapedRest.restaurantName)
      const partialMatches = parkItems.filter(item => {
        const normalizedDbRest = normalizeName(item.restaurant.name)
        return normalizedDbRest.includes(normalizedRestName) ||
               normalizedRestName.includes(normalizedDbRest)
      })

      if (partialMatches.length === 0) {
        continue
      }

      restaurantMatches.push(...partialMatches)
    }

    // Get unique restaurant IDs from matches
    const matchedRestIds = new Set(restaurantMatches.map(m => m.restaurant.id))
    const restDbItems = parkItems.filter(item => matchedRestIds.has(item.restaurant.id))

    // Match scraped items to DB items
    for (const scrapedItem of scrapedRest.items) {
      // Skip if no useful data to add
      if (!scrapedItem.description && !scrapedItem.photoUrl) continue

      // Find best matching DB item
      let bestMatch: DbMenuItem | null = null
      let bestScore = 0

      for (const dbItem of restDbItems) {
        const score = similarity(dbItem.name, scrapedItem.itemName)
        if (score > bestScore && score > 0.75) {
          bestScore = score
          bestMatch = dbItem
        }
      }

      // Also try matching across all items in this park (different restaurant names)
      if (!bestMatch || bestScore < 0.9) {
        for (const dbItem of parkItems) {
          const score = similarity(dbItem.name, scrapedItem.itemName)
          if (score > bestScore && score > 0.85) {
            bestScore = score
            bestMatch = dbItem
          }
        }
      }

      if (!bestMatch) {
        noMatches++
        continue
      }

      // Determine what to update
      const update: Record<string, string> = {}

      // Update description if missing and scraped data has it
      if (!bestMatch.description && scrapedItem.description) {
        update.description = scrapedItem.description
      }

      // Update photo_url if missing and scraped data has it
      if (!bestMatch.photo_url && scrapedItem.photoUrl) {
        update.photo_url = scrapedItem.photoUrl
      }

      if (Object.keys(update).length === 0) {
        alreadyHasData++
        continue
      }

      // Apply update
      const { error } = await supabase
        .from('menu_items')
        .update(update)
        .eq('id', bestMatch.id)

      if (error) {
        console.error(`  Failed to update ${bestMatch.name}:`, error)
        continue
      }

      if (update.description) updatedDescriptions++
      if (update.photo_url) updatedPhotos++

      // Update local cache to avoid duplicate updates
      if (update.description) bestMatch.description = update.description
      if (update.photo_url) bestMatch.photo_url = update.photo_url
    }
  }

  console.log('')
  console.log('=== Enrichment Complete ===')
  console.log(`Descriptions added: ${updatedDescriptions}`)
  console.log(`Photo URLs added: ${updatedPhotos}`)
  console.log(`Already had data: ${alreadyHasData}`)
  console.log(`No match found: ${noMatches}`)
}

enrichFromAllears().catch(console.error)
