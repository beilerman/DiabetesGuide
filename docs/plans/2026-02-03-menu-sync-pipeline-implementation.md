# Menu Sync Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an automated weekly pipeline that scrapes menu data from AllEars.net, estimates nutrition for new items, and generates a diff report for manual approval before importing to Supabase.

**Architecture:** Scraper pulls data from AllEars.net → normalizes to common schema → matches against existing DB → estimates nutrition via keyword similarity → generates diff report → approval script imports approved items.

**Tech Stack:** Node.js + TypeScript, Cheerio (HTML parsing), Supabase client, GitHub Actions (weekly cron)

---

## Task 1: Create Scraper Types and Shared Utilities

**Files:**
- Create: `scripts/scrapers/types.ts`
- Create: `scripts/scrapers/utils.ts`

**Step 1: Write the types file**

Create `scripts/scrapers/types.ts`:

```typescript
/**
 * Common types for all scraper modules
 */

export interface ScrapedItem {
  source: 'allears' | 'dfb' | 'official' | 'touringplans' | 'yelp'
  parkName: string
  restaurantName: string
  landName?: string
  itemName: string
  description?: string
  price?: number
  category?: 'entree' | 'appetizer' | 'dessert' | 'beverage' | 'side' | 'snack'
  scrapedAt: Date
  confidence: number // 0-100 based on source reliability
}

export interface ScrapedRestaurant {
  source: ScrapedItem['source']
  parkName: string
  restaurantName: string
  landName?: string
  cuisineType?: string
  items: Omit<ScrapedItem, 'source' | 'parkName' | 'restaurantName' | 'landName' | 'scrapedAt' | 'confidence'>[]
  scrapedAt: Date
}

export interface ScrapeResult {
  source: ScrapedItem['source']
  scrapedAt: Date
  restaurants: ScrapedRestaurant[]
  errors: string[]
}
```

**Step 2: Write the utils file**

Create `scripts/scrapers/utils.ts`:

```typescript
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname } from 'path'

/**
 * Normalize restaurant/item names for matching
 * - Lowercase
 * - Remove special characters except alphanumeric and spaces
 * - Collapse multiple spaces
 * - Trim
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Infer category from item name
 */
export function inferCategory(name: string): ScrapedItem['category'] | undefined {
  const n = name.toLowerCase()

  // Beverages
  if (/\b(drink|soda|lemonade|tea|coffee|smoothie|shake|beer|wine|cocktail|margarita|juice|water|milk)\b/.test(n)) {
    return 'beverage'
  }

  // Desserts
  if (/\b(cookie|cake|brownie|sundae|ice cream|gelato|mousse|pudding|churro|funnel|waffle|donut|cupcake|pie|tart|cobbler|crisp)\b/.test(n)) {
    // Exclude savory items with "crispy"
    if (/crispy/.test(n)) return undefined
    return 'dessert'
  }

  // Sides
  if (/\b(fries|coleslaw|corn|rice|beans|side salad|fruit cup|tots|onion rings)\b/.test(n)) {
    return 'side'
  }

  // Appetizers
  if (/\b(appetizer|starter|sampler|dip|wings|nachos|pretzel|popcorn)\b/.test(n)) {
    return 'appetizer'
  }

  // Snacks (smaller items, often portable)
  if (/\b(snack|popcorn|churro|pretzel|corn dog|turkey leg)\b/.test(n)) {
    return 'snack'
  }

  return undefined // Let entree be the default in the merge step
}

/**
 * Save scrape results to JSON file
 */
export function saveScrapeResult(result: ScrapeResult, outputPath: string): void {
  const dir = dirname(outputPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(outputPath, JSON.stringify(result, null, 2))
  console.log(`Saved ${result.restaurants.length} restaurants to ${outputPath}`)
}

/**
 * Delay helper for rate limiting
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

import type { ScrapedItem } from './types.js'
```

**Step 3: Verify files compile**

Run: `npx tsc scripts/scrapers/types.ts scripts/scrapers/utils.ts --noEmit --esModuleInterop --module nodenext --moduleResolution nodenext`

Expected: No errors (exit code 0)

**Step 4: Commit**

```bash
git add scripts/scrapers/types.ts scripts/scrapers/utils.ts
git commit -m "feat(scraper): add shared types and utilities

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Build AllEars.net Scraper

**Files:**
- Create: `scripts/scrapers/allears.ts`

**Step 1: Create the AllEars scraper**

Create `scripts/scrapers/allears.ts`:

```typescript
import * as cheerio from 'cheerio'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import type { ScrapeResult, ScrapedRestaurant } from './types.js'
import { normalizeName, inferCategory, delay } from './utils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// AllEars dining index pages by park
const PARK_URLS: Record<string, string> = {
  'Magic Kingdom': 'https://allears.net/dining/magic-kingdom-restaurant-menus/',
  'EPCOT': 'https://allears.net/dining/epcot-restaurant-menus/',
  'Hollywood Studios': 'https://allears.net/dining/hollywood-studios-restaurant-menus/',
  'Animal Kingdom': 'https://allears.net/dining/animal-kingdom-restaurant-menus/',
  'Disney Springs': 'https://allears.net/dining/disney-springs-restaurant-menus/',
}

interface RestaurantLink {
  name: string
  url: string
  land?: string
}

/**
 * Fetch HTML from URL with error handling
 */
async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'DiabetesGuide/1.0 (menu data for diabetes meal planning)',
    },
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`)
  }
  return response.text()
}

/**
 * Parse the park index page to get restaurant links
 */
function parseRestaurantIndex(html: string): RestaurantLink[] {
  const $ = cheerio.load(html)
  const links: RestaurantLink[] = []

  // AllEars lists restaurants in sections by land
  // Look for h2/h3 headers followed by restaurant links
  let currentLand: string | undefined

  $('article .entry-content').find('h2, h3, p, ul').each((_, el) => {
    const $el = $(el)
    const tagName = el.tagName.toLowerCase()

    if (tagName === 'h2' || tagName === 'h3') {
      // This might be a land name
      const text = $el.text().trim()
      if (text && !text.toLowerCase().includes('menu') && !text.toLowerCase().includes('restaurant')) {
        currentLand = text
      }
    }

    // Look for links to restaurant menu pages
    $el.find('a').each((_, link) => {
      const href = $(link).attr('href') || ''
      const name = $(link).text().trim()

      // AllEars restaurant menu URLs typically contain "menu" and the restaurant name
      if (href.includes('allears.net') && href.includes('menu') && name) {
        links.push({
          name,
          url: href,
          land: currentLand,
        })
      }
    })
  })

  return links
}

/**
 * Parse a restaurant menu page to extract items
 */
function parseMenuPage(html: string, restaurantName: string): ScrapedRestaurant['items'] {
  const $ = cheerio.load(html)
  const items: ScrapedRestaurant['items'] = []

  // AllEars typically lists menu items in tables or lists
  // Tables usually have: Item Name | Description | Price
  $('table tr').each((_, row) => {
    const cells = $(row).find('td')
    if (cells.length >= 1) {
      const itemName = $(cells[0]).text().trim()
      const description = cells.length >= 2 ? $(cells[1]).text().trim() : undefined
      const priceText = cells.length >= 3 ? $(cells[2]).text().trim() : undefined

      if (itemName && itemName.length > 2) {
        // Parse price if present (e.g., "$14.99")
        let price: number | undefined
        if (priceText) {
          const priceMatch = priceText.match(/\$?([\d.]+)/)
          if (priceMatch) {
            price = parseFloat(priceMatch[1])
          }
        }

        items.push({
          itemName,
          description: description || undefined,
          price,
          category: inferCategory(itemName),
        })
      }
    }
  })

  // Also check for list-based menus
  if (items.length === 0) {
    $('article .entry-content ul li, article .entry-content ol li').each((_, li) => {
      const text = $(li).text().trim()
      // Try to parse "Item Name - $Price" or just "Item Name"
      const match = text.match(/^(.+?)(?:\s*[-–]\s*\$?([\d.]+))?$/)
      if (match && match[1]) {
        const itemName = match[1].trim()
        const price = match[2] ? parseFloat(match[2]) : undefined

        if (itemName.length > 2) {
          items.push({
            itemName,
            price,
            category: inferCategory(itemName),
          })
        }
      }
    })
  }

  return items
}

/**
 * Scrape all restaurants for a park
 */
async function scrapePark(parkName: string, indexUrl: string): Promise<ScrapedRestaurant[]> {
  console.log(`Scraping ${parkName}...`)

  const indexHtml = await fetchPage(indexUrl)
  const restaurantLinks = parseRestaurantIndex(indexHtml)

  console.log(`  Found ${restaurantLinks.length} restaurants`)

  const restaurants: ScrapedRestaurant[] = []

  for (const link of restaurantLinks) {
    try {
      console.log(`    ${link.name}...`)
      await delay(500) // Rate limit

      const menuHtml = await fetchPage(link.url)
      const items = parseMenuPage(menuHtml, link.name)

      if (items.length > 0) {
        restaurants.push({
          source: 'allears',
          parkName,
          restaurantName: link.name,
          landName: link.land,
          items,
          scrapedAt: new Date(),
        })
        console.log(`      ${items.length} items`)
      } else {
        console.log(`      No items found`)
      }
    } catch (err) {
      console.error(`    Error scraping ${link.name}:`, err)
    }
  }

  return restaurants
}

/**
 * Main scraper function
 */
export async function scrapeAllEars(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    source: 'allears',
    scrapedAt: new Date(),
    restaurants: [],
    errors: [],
  }

  for (const [parkName, url] of Object.entries(PARK_URLS)) {
    try {
      const parkRestaurants = await scrapePark(parkName, url)
      result.restaurants.push(...parkRestaurants)
    } catch (err) {
      const msg = `Error scraping ${parkName}: ${err}`
      console.error(msg)
      result.errors.push(msg)
    }
  }

  return result
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeAllEars()
    .then(result => {
      const outputDir = resolve(__dirname, '../../data/scraped')
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true })
      }

      const timestamp = new Date().toISOString().slice(0, 10)
      const outputPath = resolve(outputDir, `allears-${timestamp}.json`)
      writeFileSync(outputPath, JSON.stringify(result, null, 2))

      console.log('')
      console.log('=== Scrape Complete ===')
      console.log(`Restaurants: ${result.restaurants.length}`)
      console.log(`Total items: ${result.restaurants.reduce((sum, r) => sum + r.items.length, 0)}`)
      console.log(`Errors: ${result.errors.length}`)
      console.log(`Output: ${outputPath}`)
    })
    .catch(console.error)
}
```

**Step 2: Add cheerio dependency**

Run: `npm install cheerio`

**Step 3: Verify scraper compiles**

Run: `npx tsc scripts/scrapers/allears.ts --noEmit --esModuleInterop --module nodenext --moduleResolution nodenext --skipLibCheck`

Expected: No errors

**Step 4: Test scraper on one page (manual verification)**

Run: `npx tsx scripts/scrapers/allears.ts`

Expected: Output showing restaurants scraped from AllEars, JSON file created in `data/scraped/`

**Step 5: Commit**

```bash
git add scripts/scrapers/allears.ts package.json package-lock.json
git commit -m "feat(scraper): add AllEars.net scraper

Scrapes restaurant index pages for WDW parks and Disney Springs.
Extracts menu items from individual restaurant pages.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Build Merge Logic

**Files:**
- Create: `scripts/sync/merge.ts`

**Step 1: Create the merge module**

Create `scripts/sync/merge.ts`:

```typescript
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
  category: 'entree' | 'appetizer' | 'dessert' | 'beverage' | 'side' | 'snack'
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
if (import.meta.url === `file://${process.argv[1]}`) {
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
```

**Step 2: Verify merge module compiles**

Run: `npx tsc scripts/sync/merge.ts --noEmit --esModuleInterop --module nodenext --moduleResolution nodenext --skipLibCheck`

Expected: No errors

**Step 3: Commit**

```bash
git add scripts/sync/merge.ts
git commit -m "feat(sync): add merge logic for cross-referencing scraped data

- Fuzzy matching for restaurants and menu items
- Source priority for conflict resolution
- Price conflict detection (>15% difference)
- Identifies new vs updated items

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Build Nutrition Estimator

**Files:**
- Create: `scripts/sync/estimate-nutrition.ts`

**Step 1: Create the nutrition estimator**

Create `scripts/sync/estimate-nutrition.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { MergeResult, MergedItem } from './merge.js'
import { normalizeName } from '../scrapers/utils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const supabase = createClient(url, key)

export interface NutritionEstimate {
  calories: number
  carbs: number
  fat: number
  protein: number
  sugar?: number
  fiber?: number
  sodium?: number
  confidence: number // 0-100
  matchedItems: { name: string; similarity: number }[]
}

export interface EstimatedItem extends MergedItem {
  nutrition?: NutritionEstimate
  needsManualNutrition: boolean
}

// Keywords for food type matching
const FOOD_KEYWORDS: Record<string, string[]> = {
  burger: ['burger', 'hamburger', 'cheeseburger', 'patty'],
  sandwich: ['sandwich', 'sub', 'hoagie', 'wrap', 'panini'],
  pizza: ['pizza', 'flatbread'],
  chicken: ['chicken', 'wing', 'tender', 'nugget', 'fried chicken'],
  beef: ['beef', 'steak', 'ribeye', 'sirloin', 'brisket'],
  pork: ['pork', 'bacon', 'ham', 'ribs', 'pulled pork'],
  seafood: ['fish', 'shrimp', 'lobster', 'salmon', 'tuna', 'crab'],
  salad: ['salad', 'greens', 'caesar'],
  soup: ['soup', 'chili', 'stew', 'chowder'],
  pasta: ['pasta', 'spaghetti', 'fettuccine', 'mac and cheese', 'macaroni'],
  taco: ['taco', 'burrito', 'quesadilla', 'nachos', 'enchilada'],
  dessert: ['cake', 'cookie', 'brownie', 'ice cream', 'sundae', 'pie', 'churro'],
  beverage: ['soda', 'lemonade', 'tea', 'coffee', 'smoothie', 'shake', 'juice'],
  fries: ['fries', 'tots', 'potato', 'chips'],
  pretzel: ['pretzel'],
}

/**
 * Extract keywords from item name
 */
function extractKeywords(name: string): string[] {
  const normalized = normalizeName(name)
  const words = normalized.split(' ')
  const keywords: string[] = []

  for (const [category, terms] of Object.entries(FOOD_KEYWORDS)) {
    for (const term of terms) {
      if (normalized.includes(term)) {
        keywords.push(category)
        break
      }
    }
  }

  // Add individual significant words
  for (const word of words) {
    if (word.length > 3 && !['with', 'and', 'the'].includes(word)) {
      keywords.push(word)
    }
  }

  return [...new Set(keywords)]
}

/**
 * Calculate similarity between two items based on keywords
 */
function calculateSimilarity(keywords1: string[], keywords2: string[]): number {
  if (keywords1.length === 0 || keywords2.length === 0) return 0

  const set1 = new Set(keywords1)
  const set2 = new Set(keywords2)
  const intersection = [...set1].filter(k => set2.has(k))
  const union = new Set([...set1, ...set2])

  // Jaccard similarity
  return Math.floor((intersection.length / union.size) * 100)
}

/**
 * Get existing items with nutrition from DB for matching
 */
async function getExistingItemsWithNutrition(): Promise<{
  id: string
  name: string
  category: string
  calories: number
  carbs: number
  fat: number
  protein: number
  sugar: number | null
  fiber: number | null
  sodium: number | null
  keywords: string[]
}[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select(`
      id,
      name,
      category,
      nutritional_data (
        calories,
        carbs,
        fat,
        protein,
        sugar,
        fiber,
        sodium
      )
    `)

  if (error) throw error

  return (data || [])
    .filter(item => item.nutritional_data && (item.nutritional_data as any).calories)
    .map(item => {
      const nutrition = item.nutritional_data as any
      return {
        id: item.id,
        name: item.name,
        category: item.category,
        calories: nutrition.calories,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        protein: nutrition.protein,
        sugar: nutrition.sugar,
        fiber: nutrition.fiber,
        sodium: nutrition.sodium,
        keywords: extractKeywords(item.name),
      }
    })
}

/**
 * Estimate nutrition for a new item
 */
function estimateNutrition(
  item: MergedItem,
  existingItems: Awaited<ReturnType<typeof getExistingItemsWithNutrition>>
): NutritionEstimate | null {
  const itemKeywords = extractKeywords(item.itemName)

  if (itemKeywords.length === 0) return null

  // Find matching items by category first, then by keywords
  const categoryMatches = existingItems.filter(e => e.category === item.category)
  const pool = categoryMatches.length >= 5 ? categoryMatches : existingItems

  // Score all items
  const scored = pool.map(existing => ({
    ...existing,
    similarity: calculateSimilarity(itemKeywords, existing.keywords),
  }))

  // Sort by similarity descending
  scored.sort((a, b) => b.similarity - a.similarity)

  // Take top 3 matches above 50% similarity
  const topMatches = scored.filter(s => s.similarity >= 50).slice(0, 3)

  if (topMatches.length === 0) return null

  // Weighted average based on similarity
  const totalWeight = topMatches.reduce((sum, m) => sum + m.similarity, 0)

  const estimate: NutritionEstimate = {
    calories: Math.round(topMatches.reduce((sum, m) => sum + (m.calories * m.similarity), 0) / totalWeight),
    carbs: Math.round(topMatches.reduce((sum, m) => sum + (m.carbs * m.similarity), 0) / totalWeight),
    fat: Math.round(topMatches.reduce((sum, m) => sum + (m.fat * m.similarity), 0) / totalWeight),
    protein: Math.round(topMatches.reduce((sum, m) => sum + (m.protein * m.similarity), 0) / totalWeight),
    confidence: Math.round(topMatches[0].similarity * 0.8), // Discount confidence slightly
    matchedItems: topMatches.map(m => ({ name: m.name, similarity: m.similarity })),
  }

  // Optional fields (only if all matches have them)
  if (topMatches.every(m => m.sugar !== null)) {
    estimate.sugar = Math.round(topMatches.reduce((sum, m) => sum + ((m.sugar || 0) * m.similarity), 0) / totalWeight)
  }
  if (topMatches.every(m => m.fiber !== null)) {
    estimate.fiber = Math.round(topMatches.reduce((sum, m) => sum + ((m.fiber || 0) * m.similarity), 0) / totalWeight)
  }
  if (topMatches.every(m => m.sodium !== null)) {
    estimate.sodium = Math.round(topMatches.reduce((sum, m) => sum + ((m.sodium || 0) * m.similarity), 0) / totalWeight)
  }

  return estimate
}

/**
 * Add nutrition estimates to merged items
 */
export async function addNutritionEstimates(mergeResult: MergeResult): Promise<EstimatedItem[]> {
  const existingItems = await getExistingItemsWithNutrition()
  console.log(`Loaded ${existingItems.length} existing items with nutrition for matching`)

  const estimatedItems: EstimatedItem[] = []

  for (const item of mergeResult.newItems) {
    const estimate = estimateNutrition(item, existingItems)

    estimatedItems.push({
      ...item,
      nutrition: estimate || undefined,
      needsManualNutrition: !estimate || estimate.confidence < 50,
    })
  }

  return estimatedItems
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const pendingDir = resolve(__dirname, '../../data/pending')
  const files = existsSync(pendingDir)
    ? require('fs').readdirSync(pendingDir).filter((f: string) => f.startsWith('merged-'))
    : []

  if (files.length === 0) {
    console.error('No merged data found. Run merge.ts first.')
    process.exit(1)
  }

  // Use most recent merge
  const latestFile = files.sort().pop()!
  const mergeResult: MergeResult = JSON.parse(readFileSync(resolve(pendingDir, latestFile), 'utf-8'))

  console.log(`Estimating nutrition for ${mergeResult.newItems.length} new items...`)

  addNutritionEstimates(mergeResult)
    .then(estimated => {
      const withNutrition = estimated.filter(e => e.nutrition)
      const needsManual = estimated.filter(e => e.needsManualNutrition)

      const outputPath = resolve(pendingDir, latestFile.replace('merged-', 'estimated-'))
      writeFileSync(outputPath, JSON.stringify({
        ...mergeResult,
        newItems: estimated,
      }, null, 2))

      console.log('')
      console.log('=== Nutrition Estimation Complete ===')
      console.log(`With nutrition: ${withNutrition.length}`)
      console.log(`  High confidence (80%+): ${withNutrition.filter(e => e.nutrition!.confidence >= 80).length}`)
      console.log(`  Medium confidence (50-79%): ${withNutrition.filter(e => e.nutrition!.confidence >= 50 && e.nutrition!.confidence < 80).length}`)
      console.log(`  Low confidence (<50%): ${withNutrition.filter(e => e.nutrition!.confidence < 50).length}`)
      console.log(`Needs manual entry: ${needsManual.length}`)
      console.log(`Output: ${outputPath}`)
    })
    .catch(console.error)
}
```

**Step 2: Verify estimator compiles**

Run: `npx tsc scripts/sync/estimate-nutrition.ts --noEmit --esModuleInterop --module nodenext --moduleResolution nodenext --skipLibCheck`

Expected: No errors

**Step 3: Commit**

```bash
git add scripts/sync/estimate-nutrition.ts
git commit -m "feat(sync): add nutrition estimation via keyword similarity

- Extracts food keywords from item names
- Matches against existing DB items with nutrition
- Weighted average from top 3 similar items
- Confidence scoring based on match quality

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Build Diff Report Generator

**Files:**
- Create: `scripts/sync/generate-diff.ts`

**Step 1: Create the diff report generator**

Create `scripts/sync/generate-diff.ts`:

```typescript
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { MergeResult, MergedItem } from './merge.js'
import type { EstimatedItem } from './estimate-nutrition.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface DiffReport {
  generatedAt: Date
  summary: {
    newItems: number
    updatedItems: number
    flaggedRemovals: number
    conflicts: number
    coverageChange: string
  }
  newItemsByPark: Record<string, EstimatedItem[]>
  needsReview: {
    priceConflicts: MergedItem[]
    lowConfidence: EstimatedItem[]
    potentiallyDiscontinued: MergeResult['potentiallyRemoved']
  }
  approveAllUrl: string
  reviewUrl: string
}

/**
 * Group items by park
 */
function groupByPark(items: EstimatedItem[]): Record<string, EstimatedItem[]> {
  const grouped: Record<string, EstimatedItem[]> = {}

  for (const item of items) {
    const park = item.parkName
    if (!grouped[park]) {
      grouped[park] = []
    }
    grouped[park].push(item)
  }

  return grouped
}

/**
 * Generate markdown diff report
 */
export function generateDiffReport(
  mergeResult: MergeResult & { newItems: EstimatedItem[] }
): DiffReport {
  const newItemsByPark = groupByPark(mergeResult.newItems)

  const priceConflicts = mergeResult.newItems.filter(i => i.priceConflict)
  const lowConfidence = mergeResult.newItems.filter(i =>
    i.needsManualNutrition || (i.nutrition && i.nutrition.confidence < 50)
  )

  return {
    generatedAt: new Date(),
    summary: {
      newItems: mergeResult.newItems.length,
      updatedItems: mergeResult.updatedItems.length,
      flaggedRemovals: mergeResult.potentiallyRemoved.length,
      conflicts: mergeResult.conflicts.length,
      coverageChange: `+${mergeResult.newItems.length} items`,
    },
    newItemsByPark,
    needsReview: {
      priceConflicts,
      lowConfidence,
      potentiallyDiscontinued: mergeResult.potentiallyRemoved,
    },
    approveAllUrl: 'npx tsx scripts/approve.ts --all',
    reviewUrl: 'npx tsx scripts/approve.ts --interactive',
  }
}

/**
 * Format report as markdown for email/display
 */
export function formatReportAsMarkdown(report: DiffReport): string {
  const lines: string[] = []

  lines.push(`# DiabetesGuide Menu Sync — ${report.generatedAt.toISOString().slice(0, 10)}`)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push(`- **New items:** ${report.summary.newItems}`)
  lines.push(`- **Updated items:** ${report.summary.updatedItems}`)
  lines.push(`- **Flagged removals:** ${report.summary.flaggedRemovals}`)
  lines.push(`- **Conflicts:** ${report.summary.conflicts}`)
  lines.push('')

  lines.push('## New Items by Park')
  lines.push('')

  for (const [park, items] of Object.entries(report.newItemsByPark)) {
    lines.push(`### ${park} (${items.length} items)`)
    lines.push('')

    for (const item of items.slice(0, 10)) { // Show first 10 per park
      const nutrition = item.nutrition
        ? `Est. ${item.nutrition.calories} cal, ${item.nutrition.carbs}g carbs (${item.nutrition.confidence}% confidence)`
        : 'Needs manual nutrition'

      lines.push(`- **${item.restaurantName}:** ${item.itemName}${item.price ? ` — $${item.price}` : ''}`)
      lines.push(`  - ${nutrition}`)
    }

    if (items.length > 10) {
      lines.push(`- ... and ${items.length - 10} more`)
    }
    lines.push('')
  }

  if (report.needsReview.priceConflicts.length > 0) {
    lines.push('## Needs Review: Price Conflicts')
    lines.push('')
    for (const item of report.needsReview.priceConflicts) {
      const prices = item.priceConflict!.map(p => `${p.source}: $${p.price}`).join(' vs ')
      lines.push(`- **${item.itemName}** (${item.restaurantName}): ${prices}`)
    }
    lines.push('')
  }

  if (report.needsReview.lowConfidence.length > 0) {
    lines.push('## Needs Review: Low Confidence Nutrition')
    lines.push('')
    for (const item of report.needsReview.lowConfidence.slice(0, 10)) {
      lines.push(`- **${item.itemName}** (${item.restaurantName}): ${item.nutrition ? `${item.nutrition.confidence}% confidence` : 'No matches found'}`)
    }
    if (report.needsReview.lowConfidence.length > 10) {
      lines.push(`- ... and ${report.needsReview.lowConfidence.length - 10} more`)
    }
    lines.push('')
  }

  lines.push('## Actions')
  lines.push('')
  lines.push('```bash')
  lines.push('# Approve all new items')
  lines.push(report.approveAllUrl)
  lines.push('')
  lines.push('# Review individually')
  lines.push(report.reviewUrl)
  lines.push('```')

  return lines.join('\n')
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const pendingDir = resolve(__dirname, '../../data/pending')
  const files = existsSync(pendingDir)
    ? require('fs').readdirSync(pendingDir).filter((f: string) => f.startsWith('estimated-'))
    : []

  if (files.length === 0) {
    console.error('No estimated data found. Run estimate-nutrition.ts first.')
    process.exit(1)
  }

  const latestFile = files.sort().pop()!
  const data = JSON.parse(readFileSync(resolve(pendingDir, latestFile), 'utf-8'))

  const report = generateDiffReport(data)
  const markdown = formatReportAsMarkdown(report)

  const outputPath = resolve(pendingDir, latestFile.replace('estimated-', 'report-').replace('.json', '.md'))
  writeFileSync(outputPath, markdown)

  // Also save JSON report
  const jsonPath = resolve(pendingDir, latestFile.replace('estimated-', 'report-'))
  writeFileSync(jsonPath, JSON.stringify(report, null, 2))

  console.log(markdown)
  console.log('')
  console.log(`Report saved to: ${outputPath}`)
}
```

**Step 2: Verify generator compiles**

Run: `npx tsc scripts/sync/generate-diff.ts --noEmit --esModuleInterop --module nodenext --moduleResolution nodenext --skipLibCheck`

Expected: No errors

**Step 3: Commit**

```bash
git add scripts/sync/generate-diff.ts
git commit -m "feat(sync): add diff report generator

- Groups new items by park
- Flags price conflicts and low confidence items
- Generates markdown report for review
- Includes approve commands

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Build Approval Script

**Files:**
- Create: `scripts/approve.ts`

**Step 1: Create the approval script**

Create `scripts/approve.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
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

/**
 * Find or create park by name
 */
async function findOrCreatePark(parkName: string): Promise<string> {
  // Try to find existing park
  const { data: existing } = await supabase
    .from('parks')
    .select('id')
    .ilike('name', `%${parkName}%`)
    .single()

  if (existing) return existing.id

  // Create new park
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

/**
 * Find or create restaurant
 */
async function findOrCreateRestaurant(
  parkId: string,
  restaurantName: string,
  landName?: string
): Promise<string> {
  // Try to find existing
  const { data: existing } = await supabase
    .from('restaurants')
    .select('id')
    .eq('park_id', parkId)
    .ilike('name', restaurantName)
    .single()

  if (existing) return existing.id

  // Create new
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

/**
 * Import a single item
 */
async function importItem(item: EstimatedItem): Promise<void> {
  const parkId = await findOrCreatePark(item.parkName)
  const restaurantId = await findOrCreateRestaurant(parkId, item.restaurantName, item.landName)

  // Insert menu item
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

  // Insert nutrition if available
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

/**
 * Import all approved items
 */
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

// Location/timezone helpers (same as import-all.ts)
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

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const approveAll = args.includes('--all')

  const pendingDir = resolve(__dirname, 'data/pending')
  const approvedDir = resolve(__dirname, 'data/approved')

  if (!existsSync(pendingDir)) {
    console.error('No pending data found.')
    process.exit(1)
  }

  const files = require('fs').readdirSync(pendingDir).filter((f: string) => f.startsWith('estimated-'))

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
        // Move to approved
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
```

**Step 2: Verify approval script compiles**

Run: `npx tsc scripts/approve.ts --noEmit --esModuleInterop --module nodenext --moduleResolution nodenext --skipLibCheck`

Expected: No errors

**Step 3: Commit**

```bash
git add scripts/approve.ts
git commit -m "feat(sync): add approval script for importing to Supabase

- Finds or creates parks and restaurants
- Imports menu items with nutrition data
- Moves processed files to approved/

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Add npm Scripts

**Files:**
- Modify: `package.json`

**Step 1: Add sync scripts to package.json**

Add to the "scripts" section:

```json
{
  "scripts": {
    "scrape:allears": "tsx scripts/scrapers/allears.ts",
    "sync:merge": "tsx scripts/sync/merge.ts",
    "sync:estimate": "tsx scripts/sync/estimate-nutrition.ts",
    "sync:report": "tsx scripts/sync/generate-diff.ts",
    "sync:approve": "tsx scripts/approve.ts --all",
    "sync:full": "npm run scrape:allears && npm run sync:merge && npm run sync:estimate && npm run sync:report"
  }
}
```

**Step 2: Test the scrape command runs**

Run: `npm run scrape:allears`

Expected: Scraper starts, outputs progress (may take a few minutes)

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add npm scripts for menu sync pipeline

- scrape:allears - Run AllEars scraper
- sync:merge - Merge scraped data with DB
- sync:estimate - Estimate nutrition for new items
- sync:report - Generate diff report
- sync:approve - Import approved items
- sync:full - Run complete pipeline

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Create GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/weekly-menu-sync.yml`

**Step 1: Create the workflow file**

Create `.github/workflows/weekly-menu-sync.yml`:

```yaml
name: Weekly Menu Sync

on:
  schedule:
    # Run every Sunday at 11 PM ET (4 AM UTC Monday)
    - cron: '0 4 * * 1'
  workflow_dispatch: # Allow manual trigger

jobs:
  sync:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run AllEars scraper
        run: npm run scrape:allears

      - name: Merge with database
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: npm run sync:merge

      - name: Estimate nutrition
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: npm run sync:estimate

      - name: Generate diff report
        run: npm run sync:report

      - name: Upload report artifact
        uses: actions/upload-artifact@v4
        with:
          name: menu-sync-report-${{ github.run_id }}
          path: data/pending/report-*.md
          retention-days: 30

      - name: Commit pending data
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/pending/ data/scraped/
          git commit -m "chore: weekly menu sync data [skip ci]" || echo "No changes to commit"
          git push
```

**Step 2: Commit workflow**

```bash
mkdir -p .github/workflows
git add .github/workflows/weekly-menu-sync.yml
git commit -m "ci: add weekly menu sync GitHub Actions workflow

Runs every Sunday night:
- Scrapes AllEars.net
- Merges with database
- Estimates nutrition
- Generates diff report
- Uploads report as artifact

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Add data directories to .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: Update .gitignore**

Add to `.gitignore`:

```
# Menu sync data (large JSON files)
data/scraped/
data/approved/
```

Note: `data/pending/` is NOT ignored so the diff reports can be reviewed in PRs.

**Step 2: Create placeholder files**

```bash
mkdir -p data/scraped data/pending data/approved
echo "# Scraped data (gitignored)" > data/scraped/.gitkeep
echo "# Approved data (gitignored)" > data/approved/.gitkeep
```

**Step 3: Commit**

```bash
git add .gitignore data/scraped/.gitkeep data/approved/.gitkeep
git commit -m "chore: add menu sync data directories

- data/scraped/ - Raw scraper output (gitignored)
- data/pending/ - Merged items awaiting approval (tracked)
- data/approved/ - Imported items (gitignored)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Manual Integration Test

**Files:** None (testing only)

**Step 1: Run full pipeline manually**

```bash
# Set environment variables
export $(grep -v '^#' .env.local | xargs)

# Run full sync
npm run sync:full
```

**Step 2: Verify outputs**

- Check `data/scraped/` has JSON file with restaurants
- Check `data/pending/` has merged, estimated, and report files
- Review the markdown report for accuracy

**Step 3: (Optional) Test approval**

If the data looks good:
```bash
npm run sync:approve
```

Verify items appear in Supabase.

---

## Rollout Notes

1. **Phase 1 (this plan):** AllEars scraper only — run manually for 2-3 weeks
2. **Phase 2:** Enable GitHub Actions workflow once stable
3. **Phase 3:** Add additional scrapers (official-wdw.ts, dfb.ts, etc.)
4. **Phase 4:** Add email notification for diff reports (SendGrid/Resend)

## Success Criteria

- AllEars scraper extracts 50+ restaurants with menu items
- Merge correctly identifies new vs existing items
- Nutrition estimates have 60%+ average confidence
- Diff report clearly shows what will change
- Approval imports items without errors
