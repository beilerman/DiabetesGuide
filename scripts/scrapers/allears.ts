import * as cheerio from 'cheerio'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import type { ScrapeResult, ScrapedRestaurant } from './types.js'
import { inferCategory, delay } from './utils.js'

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
