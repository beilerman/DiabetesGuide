/**
 * Enrich menu items with photo URLs from Disney Food Blog scraped data.
 * Uses fuzzy keyword matching between DFB image filenames and DB item names.
 *
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/enrich-from-dfb.ts
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
 * Extract meaningful keywords from a DFB image filename
 */
function extractKeywords(photoUrl: string): string[] {
  const urlParts = photoUrl.split('/')
  const filename = urlParts[urlParts.length - 1]

  // Remove extension and dimensions
  let name = filename
    .replace(/-\d+x\d+\.(jpg|jpeg|png|webp)$/i, '')
    .replace(/\.(jpg|jpeg|png|webp)$/i, '')
    .toLowerCase()

  // Split into parts
  const parts = name.split('-')

  // Filter out noise words
  const noiseWords = new Set([
    'wdw', 'dlr', 'disney', 'world', 'disneyland', 'resort',
    'magic', 'kingdom', 'epcot', 'hollywood', 'studios', 'animal',
    'springs', 'frontierland', 'adventureland', 'tomorrowland',
    'fantasyland', 'liberty', 'square', 'main', 'street', 'usa',
    '2020', '2021', '2022', '2023', '2024', '2025', '2026',
    'new', 'menu', 'review', 'food', 'restaurant', 'cafe', 'tavern',
    'inn', 'table', 'lounge', 'bar', 'grill', 'house', 'kitchen',
    'bakery', 'stand', 'cart', 'the', 'and', 'of', 'at', 'in', 'with',
    'full', 'spread', 'shot', 'close', 'up', 'stock', 'photo',
    'exterior', 'interior', 'entrance', 'sign', 'logo', 'atmo',
    'atmosphere', 'decor', 'seating', 'dining', 'room', 'area',
    'min', 'max', 'img', 'pic', 'image'
  ])

  // Extract meaningful keywords (3+ chars, not noise)
  const keywords = parts.filter(part =>
    part.length >= 3 &&
    !noiseWords.has(part) &&
    !/^\d+$/.test(part)
  )

  return keywords
}

/**
 * Normalize name for matching
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
 * Calculate how many keywords match the item name
 * Returns score based on exact word matches (partial matches ignored)
 */
function keywordMatchScore(keywords: string[], itemName: string): number {
  const normalizedName = normalizeName(itemName)
  const nameWords = new Set(normalizedName.split(' '))

  let exactMatches = 0
  const matchedKeywords: string[] = []

  for (const keyword of keywords) {
    // Only count exact word matches (4+ char keywords)
    if (keyword.length >= 4 && nameWords.has(keyword)) {
      exactMatches += 1
      matchedKeywords.push(keyword)
    }
  }

  // Require at least 2 exact matches for a valid score
  if (exactMatches < 2) return 0

  // Score favors more matches relative to item name length
  // An item with 3 words and 2 matches scores higher than 10 words with 2 matches
  return exactMatches / Math.sqrt(nameWords.size)
}

interface DbMenuItem {
  id: string
  name: string
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

interface ScrapedPhoto {
  photoUrl: string
  keywords: string[]
  parkName: string
}

const PARK_NAME_MAP: Record<string, string> = {
  'Magic Kingdom': 'Magic Kingdom',
  'EPCOT': 'EPCOT',
  'Hollywood Studios': 'Hollywood Studios',
  'Animal Kingdom': 'Animal Kingdom',
  'Disney Springs': 'Disney Springs',
}

async function loadScrapedPhotos(): Promise<ScrapedPhoto[]> {
  const scrapedDir = resolve(__dirname, '../data/scraped')
  const files = readdirSync(scrapedDir)
    .filter(f => f.startsWith('dfb') && f.endsWith('.json'))
    .sort()
    .reverse() // Most recent first

  if (files.length === 0) {
    console.error('No DFB scraped data found in data/scraped/')
    console.error('Run: npm run scrape:dfb')
    process.exit(1)
  }

  const latestFile = files[0]
  console.log(`Loading scraped data from: ${latestFile}`)

  const data: ScrapeResult = JSON.parse(readFileSync(resolve(scrapedDir, latestFile), 'utf-8'))

  const photos: ScrapedPhoto[] = []
  const seen = new Set<string>()

  for (const restaurant of data.restaurants) {
    for (const item of restaurant.items) {
      if (item.photoUrl && !seen.has(item.photoUrl)) {
        seen.add(item.photoUrl)
        const keywords = extractKeywords(item.photoUrl)
        if (keywords.length >= 2) { // Need at least 2 meaningful keywords
          photos.push({
            photoUrl: item.photoUrl,
            keywords,
            parkName: restaurant.parkName,
          })
        }
      }
    }
  }

  console.log(`Loaded ${photos.length} photos with valid keywords`)
  return photos
}

async function fetchDbItems(): Promise<DbMenuItem[]> {
  console.log('Fetching menu items from database...')

  let allRows: DbMenuItem[] = []
  let from = 0
  const batchSize = 1000

  while (true) {
    const { data: batch, error } = await supabase
      .from('menu_items')
      .select(`
        id,
        name,
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
      .is('photo_url', null) // Only items without photos
      .range(from, from + batchSize - 1)

    if (error) {
      console.error('Failed to fetch menu items:', error)
      process.exit(1)
    }
    if (!batch?.length) break

    const flattened = batch.map((row: any) => ({
      id: row.id,
      name: row.name,
      photo_url: row.photo_url,
      restaurant: Array.isArray(row.restaurant) ? row.restaurant[0] : row.restaurant
    })).filter((row: any) => row.restaurant?.park)

    allRows = allRows.concat(flattened)
    if (batch.length < batchSize) break
    from += batchSize
  }

  console.log(`Fetched ${allRows.length} menu items without photos`)
  return allRows
}

async function enrichFromDFB() {
  const photos = await loadScrapedPhotos()
  const dbItems = await fetchDbItems()

  // Group DB items by park for faster matching
  const dbByPark = new Map<string, DbMenuItem[]>()
  for (const item of dbItems) {
    const parkName = item.restaurant.park.name
    if (!dbByPark.has(parkName)) dbByPark.set(parkName, [])
    dbByPark.get(parkName)!.push(item)
  }

  let updated = 0
  let noMatch = 0
  const matchedItemIds = new Set<string>()

  // Match each photo to the best DB item
  for (const photo of photos) {
    const dbParkName = PARK_NAME_MAP[photo.parkName]
    if (!dbParkName) continue

    // Get items from this park + items from all parks (some photos might match cross-park)
    const candidateItems = [
      ...(dbByPark.get(dbParkName) || []),
    ]

    if (candidateItems.length === 0) continue

    // Find best matching item
    let bestMatch: DbMenuItem | null = null
    let bestScore = 0
    const MIN_SCORE = 0.6 // Require meaningful exact matches

    for (const item of candidateItems) {
      if (matchedItemIds.has(item.id)) continue // Don't assign same photo to multiple items

      const score = keywordMatchScore(photo.keywords, item.name)
      if (score > bestScore && score >= MIN_SCORE) {
        bestScore = score
        bestMatch = item
      }
    }

    // Debug: show top candidates for first few photos
    if (noMatch < 5 && !bestMatch) {
      const topCandidates = candidateItems
        .map(item => ({ name: item.name, score: keywordMatchScore(photo.keywords, item.name) }))
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
      console.log(`  Keywords: ${photo.keywords.join(', ')}`)
      console.log(`  Top candidates: ${topCandidates.map(c => `${c.name} (${c.score.toFixed(2)})`).join(', ') || 'none'}`)
    }

    if (bestMatch) {
      // Update the item with the photo URL
      const { error } = await supabase
        .from('menu_items')
        .update({ photo_url: photo.photoUrl })
        .eq('id', bestMatch.id)

      if (error) {
        console.error(`  Failed to update ${bestMatch.name}:`, error)
      } else {
        updated++
        matchedItemIds.add(bestMatch.id)
        if (updated <= 20) {
          console.log(`  ✓ ${bestMatch.name} ← ${photo.keywords.join(' ')}`)
        }
      }
    } else {
      noMatch++
    }
  }

  console.log('')
  console.log('=== Enrichment Complete ===')
  console.log(`Photos matched: ${updated}`)
  console.log(`No match found: ${noMatch}`)
}

enrichFromDFB().catch(console.error)
