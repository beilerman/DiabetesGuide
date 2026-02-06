/**
 * Disney Food Blog (disneyfoodblog.com) scraper
 * Extracts food photos and item names from review articles.
 *
 * DFB has great food photography with descriptive filenames.
 * Image URL pattern: https://www.disneyfoodblog.com/wp-content/uploads/YYYY/MM/[descriptive-filename]-700x525.jpg
 */

import puppeteer from 'puppeteer'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import type { ScrapeResult, ScrapedRestaurant } from './types.js'
import { delay } from './utils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// DFB review/guide pages organized by park - expanded with more review articles
const PARK_PAGES: Record<string, string[]> = {
  'Magic Kingdom': [
    'https://www.disneyfoodblog.com/magic-kingdom-restaurants/',
    'https://www.disneyfoodblog.com/2023/12/10/everything-you-need-to-eat-in-magic-kingdom-in-2024/',
    'https://www.disneyfoodblog.com/2024/03/17/our-favorite-meal-at-every-magic-kingdom-restaurant/',
    'https://www.disneyfoodblog.com/2024/05/09/dfb-goals-lydia-just-ate-at-every-magic-kingdom-fast-food-restaurant-heres-what-she-wants-you-to-know/',
    'https://www.disneyfoodblog.com/2024/05/28/were-ranking-every-snack-in-fantasyland-in-magic-kingdom-so-you-dont-have-to/',
    'https://www.disneyfoodblog.com/2024/09/18/review-a-popular-magic-kingdom-restaurant-just-got-a-menu-overhaul/',
    'https://www.disneyfoodblog.com/sleepy-hollow-refreshments/',
    'https://www.disneyfoodblog.com/caseys-corner/',
    'https://www.disneyfoodblog.com/pecos-bill-tall-tale-inn-and-cafe/',
    'https://www.disneyfoodblog.com/cosmic-rays-starlight-cafe/',
    'https://www.disneyfoodblog.com/the-friars-nook/',
  ],
  'EPCOT': [
    'https://www.disneyfoodblog.com/epcot-restaurants/',
    'https://www.disneyfoodblog.com/2023/12/12/everything-you-need-to-eat-in-epcot-in-2024/',
    'https://www.disneyfoodblog.com/les-halles-boulangerie-patisserie/',
    'https://www.disneyfoodblog.com/la-cantina-de-san-angel/',
    'https://www.disneyfoodblog.com/katsura-grill/',
    'https://www.disneyfoodblog.com/tangierine-cafe/',
    'https://www.disneyfoodblog.com/sunshine-seasons/',
    'https://www.disneyfoodblog.com/connections-cafe-eatery/',
  ],
  'Hollywood Studios': [
    'https://www.disneyfoodblog.com/hollywood-studios-restaurants/',
    'https://www.disneyfoodblog.com/2023/12/09/everything-you-need-to-eat-in-hollywood-studios-in-2024/',
    'https://www.disneyfoodblog.com/docking-bay-7-food-and-cargo/',
    'https://www.disneyfoodblog.com/woodys-lunch-box/',
    'https://www.disneyfoodblog.com/backlot-express/',
    'https://www.disneyfoodblog.com/rotos-roasters/',
    'https://www.disneyfoodblog.com/abc-commissary/',
  ],
  'Animal Kingdom': [
    'https://www.disneyfoodblog.com/animal-kingdom-restaurants/',
    'https://www.disneyfoodblog.com/2023/12/11/everything-you-need-to-eat-in-animal-kingdom-in-2024/',
    'https://www.disneyfoodblog.com/satuli-canteen/',
    'https://www.disneyfoodblog.com/flame-tree-barbecue/',
    'https://www.disneyfoodblog.com/restaurantosaurus/',
    'https://www.disneyfoodblog.com/harambe-market/',
  ],
  'Disney Springs': [
    'https://www.disneyfoodblog.com/disney-springs-restaurants/',
    'https://www.disneyfoodblog.com/the-basket-at-wine-bar-george/',
    'https://www.disneyfoodblog.com/chicken-guy/',
    'https://www.disneyfoodblog.com/blaze-fast-fired-pizza/',
    'https://www.disneyfoodblog.com/d-luxe-burger/',
    'https://www.disneyfoodblog.com/earl-of-sandwich/',
  ],
}

interface ExtractedItem {
  itemName: string
  photoUrl: string
  restaurant?: string
  description?: string
}

/**
 * Parse food item name from DFB image filename
 * Example: "2024-WDW-Magic-Kingdom-Frontierland-Pecos-Bill-Tall-Tale-Inn-and-Cafe-new-menu-Barbecue-Cheddar-Seasoned-Fries-700x525.jpg"
 * -> "Barbecue Cheddar Seasoned Fries"
 */
function parseItemFromFilename(filename: string): { itemName: string; restaurant?: string } | null {
  // Remove extension and dimensions
  let name = filename
    .replace(/-\d+x\d+\.(jpg|jpeg|png|webp)$/i, '')
    .replace(/\.(jpg|jpeg|png|webp)$/i, '')

  // Common patterns to extract restaurant and item
  // Pattern: YYYY-location-park-area-restaurant-item
  const parts = name.split('-')

  // Skip if too short
  if (parts.length < 5) return null

  // Skip non-food images
  const lowerName = name.toLowerCase()
  if (
    lowerName.includes('exterior') ||
    lowerName.includes('interior') ||
    lowerName.includes('entrance') ||
    lowerName.includes('sign') ||
    lowerName.includes('atmosphere') ||
    lowerName.includes('atmo') ||
    lowerName.includes('decor') ||
    lowerName.includes('seating') ||
    lowerName.includes('logo') ||
    lowerName.includes('wait-time') ||
    lowerName.includes('queue') ||
    lowerName.includes('character') ||
    lowerName.includes('meeting')
  ) {
    return null
  }

  // Try to find common restaurant indicators and extract item after
  const restaurantIndicators = [
    'cafe', 'restaurant', 'inn', 'tavern', 'bakery', 'bar', 'grill', 'kitchen',
    'canteen', 'cantina', 'house', 'table', 'terrace', 'lounge', 'stand', 'cart'
  ]

  let restaurantEndIndex = -1
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i].toLowerCase()
    if (restaurantIndicators.some(ind => part.includes(ind))) {
      restaurantEndIndex = i
      break
    }
  }

  // Also check for "menu" or "new-menu" which indicates item follows
  const menuIndex = parts.findIndex(p => p.toLowerCase() === 'menu' || p.toLowerCase() === 'new')
  if (menuIndex > 0 && menuIndex > restaurantEndIndex) {
    // Skip past "new menu" or just "menu"
    let startIndex = menuIndex + 1
    if (parts[menuIndex].toLowerCase() === 'new' && parts[menuIndex + 1]?.toLowerCase() === 'menu') {
      startIndex = menuIndex + 2
    }

    if (startIndex < parts.length) {
      const itemParts = parts.slice(startIndex)
      const itemName = itemParts
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(' ')
        .replace(/\s+\d+$/, '') // Remove trailing numbers

      if (itemName.length > 3) {
        // Try to extract restaurant name
        let restaurant: string | undefined
        if (restaurantEndIndex > 0) {
          // Find where restaurant name starts (after park/location info)
          const locationKeywords = ['wdw', 'magic', 'kingdom', 'epcot', 'hollywood', 'studios', 'animal', 'disney', 'springs', 'frontierland', 'adventureland', 'tomorrowland', 'fantasyland', 'liberty', 'main', 'street']
          let restaurantStartIndex = 0
          for (let i = 0; i <= restaurantEndIndex; i++) {
            if (!locationKeywords.includes(parts[i].toLowerCase())) {
              restaurantStartIndex = i
              break
            }
          }
          if (restaurantStartIndex < restaurantEndIndex) {
            restaurant = parts.slice(restaurantStartIndex, restaurantEndIndex + 1)
              .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
              .join(' ')
              .replace(/\s+And\s+/g, ' & ')
          }
        }

        return { itemName, restaurant }
      }
    }
  }

  // Fallback: take last few meaningful words as item name
  const meaningfulParts = parts.filter(p =>
    p.length > 2 &&
    !['wdw', 'dlr', 'magic', 'kingdom', 'epcot', 'hollywood', 'studios', 'animal', 'disney', 'springs', '2024', '2025', '2026', 'new', 'menu', 'review'].includes(p.toLowerCase())
  )

  if (meaningfulParts.length >= 2) {
    // Take last 3-5 parts as item name
    const itemParts = meaningfulParts.slice(-Math.min(5, meaningfulParts.length))
    const itemName = itemParts
      .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(' ')

    if (itemName.length > 5) {
      return { itemName }
    }
  }

  return null
}

/**
 * Extract food images from a DFB page
 */
async function extractFoodImages(page: puppeteer.Page): Promise<ExtractedItem[]> {
  const items: ExtractedItem[] = []
  const seen = new Set<string>()

  // Get all images from the page
  const images = await page.evaluate(() => {
    const imgs: { src: string; alt: string }[] = []
    document.querySelectorAll('img').forEach(img => {
      const src = img.src || img.dataset.src || img.dataset.lazySrc || ''
      const alt = img.alt || ''
      if (src.includes('wp-content/uploads') && src.includes('disneyfoodblog.com')) {
        imgs.push({ src, alt })
      }
    })
    return imgs
  })

  for (const img of images) {
    // Extract filename from URL
    const urlParts = img.src.split('/')
    const filename = urlParts[urlParts.length - 1]

    const parsed = parseItemFromFilename(filename)
    if (parsed && !seen.has(parsed.itemName.toLowerCase())) {
      seen.add(parsed.itemName.toLowerCase())
      items.push({
        itemName: parsed.itemName,
        photoUrl: img.src,
        restaurant: parsed.restaurant,
        description: img.alt || undefined,
      })
    }
  }

  return items
}

/**
 * Scrape a single park's pages
 */
async function scrapePark(
  browser: puppeteer.Browser,
  parkName: string,
  urls: string[]
): Promise<ExtractedItem[]> {
  console.log(`\nScraping ${parkName}...`)

  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  )

  const allItems: ExtractedItem[] = []
  const seen = new Set<string>()

  for (const url of urls) {
    try {
      console.log(`  ${url}...`)
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await delay(2000)

      // Scroll down to trigger lazy loading
      await page.evaluate(async () => {
        for (let i = 0; i < 10; i++) {
          window.scrollBy(0, 500)
          await new Promise(r => setTimeout(r, 200))
        }
        window.scrollTo(0, 0)
      })
      await delay(1000)

      const items = await extractFoodImages(page)
      console.log(`    Found ${items.length} food images`)

      for (const item of items) {
        const key = item.itemName.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          allItems.push(item)
        }
      }
    } catch (err) {
      console.error(`  Error scraping ${url}:`, err)
    }

    await delay(2000) // Rate limit
  }

  await page.close()
  return allItems
}

/**
 * Main scraper function
 */
export async function scrapeDFB(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    source: 'dfb',
    scrapedAt: new Date(),
    restaurants: [],
    errors: [],
  }

  console.log('Launching browser...')
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  })

  try {
    for (const [parkName, urls] of Object.entries(PARK_PAGES)) {
      try {
        const items = await scrapePark(browser, parkName, urls)

        // Group by restaurant if available, otherwise use "Various" as restaurant
        const byRestaurant = new Map<string, ExtractedItem[]>()
        for (const item of items) {
          const restName = item.restaurant || 'Various'
          if (!byRestaurant.has(restName)) byRestaurant.set(restName, [])
          byRestaurant.get(restName)!.push(item)
        }

        for (const [restaurantName, restItems] of byRestaurant) {
          result.restaurants.push({
            source: 'dfb',
            parkName,
            restaurantName,
            items: restItems.map(item => ({
              itemName: item.itemName,
              description: item.description,
              photoUrl: item.photoUrl,
            })),
            scrapedAt: new Date(),
          })
        }

        console.log(`  Total unique items for ${parkName}: ${items.length}`)
      } catch (err) {
        const msg = `Error scraping ${parkName}: ${err}`
        console.error(msg)
        result.errors.push(msg)
      }
    }
  } finally {
    await browser.close()
  }

  return result
}

// CLI entry point
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  scrapeDFB()
    .then(result => {
      const outputDir = resolve(__dirname, '../../data/scraped')
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true })
      }

      const timestamp = new Date().toISOString().slice(0, 10)
      const outputPath = resolve(outputDir, `dfb-${timestamp}.json`)
      writeFileSync(outputPath, JSON.stringify(result, null, 2))

      const totalItems = result.restaurants.reduce((sum, r) => sum + r.items.length, 0)
      console.log('')
      console.log('=== Scrape Complete ===')
      console.log(`Restaurants: ${result.restaurants.length}`)
      console.log(`Total items with photos: ${totalItems}`)
      console.log(`Errors: ${result.errors.length}`)
      console.log(`Output: ${outputPath}`)
    })
    .catch(console.error)
}
