import puppeteer from 'puppeteer'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import type { ScrapeResult, ScrapedRestaurant } from './types.js'
import { inferCategory, delay } from './utils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// TouringPlans dining pages by park
const PARK_URLS: Record<string, string> = {
  'Magic Kingdom': 'https://touringplans.com/magic-kingdom/dining',
  'EPCOT': 'https://touringplans.com/epcot/dining',
  'Hollywood Studios': 'https://touringplans.com/hollywood-studios/dining',
  'Animal Kingdom': 'https://touringplans.com/animal-kingdom/dining',
  'Disney Springs': 'https://touringplans.com/disney-springs/dining',
}

interface RestaurantInfo {
  name: string
  url: string
  land?: string
}

/**
 * Extract restaurant links from a park dining page
 */
async function getRestaurantLinks(page: puppeteer.Page, parkUrl: string): Promise<RestaurantInfo[]> {
  await page.goto(parkUrl, { waitUntil: 'networkidle2', timeout: 30000 })

  // Wait for content to load
  await delay(2000)

  // Extract restaurant links - TouringPlans lists restaurants in cards/links
  const restaurants = await page.evaluate(() => {
    const links: { name: string; url: string; land?: string }[] = []

    // Look for restaurant links in the page
    const restaurantLinks = document.querySelectorAll('a[href*="/dining/"]')

    restaurantLinks.forEach(link => {
      const href = (link as HTMLAnchorElement).href
      const name = link.textContent?.trim()

      // Skip non-restaurant links (navigation, etc.)
      if (name && href && !href.includes('/dining/ratings') && !href.includes('/dining/reservations')) {
        // Check if it's a specific restaurant page (has restaurant slug after /dining/)
        const match = href.match(/\/dining\/([^\/\?]+)$/)
        if (match && match[1] && !['dining', 'menus'].includes(match[1])) {
          links.push({ name, url: href })
        }
      }
    })

    // Deduplicate by URL
    const seen = new Set<string>()
    return links.filter(l => {
      if (seen.has(l.url)) return false
      seen.add(l.url)
      return true
    })
  })

  return restaurants
}

/**
 * Extract menu items from a restaurant page
 */
async function getMenuItems(page: puppeteer.Page, restaurantUrl: string): Promise<ScrapedRestaurant['items']> {
  await page.goto(restaurantUrl, { waitUntil: 'networkidle2', timeout: 30000 })

  // Wait for menu content to load
  await delay(2000)

  // Try to find and click a "Menu" tab if it exists
  try {
    await page.click('a[href*="menu"], button:has-text("Menu"), [data-tab="menu"]')
    await delay(1000)
  } catch {
    // Menu tab might not exist or be visible
  }

  // Extract menu items
  const items = await page.evaluate(() => {
    const menuItems: { itemName: string; description?: string; price?: number }[] = []

    // Look for menu item patterns - TouringPlans might use various structures
    // Try common patterns: tables, lists, cards

    // Pattern 1: Look for elements that look like menu items
    const possibleItems = document.querySelectorAll(
      '.menu-item, .dining-item, [class*="menu"] li, [class*="menu"] tr, ' +
      '.item-name, .dish-name, h3, h4'
    )

    possibleItems.forEach(el => {
      const text = el.textContent?.trim()
      if (text && text.length > 2 && text.length < 100) {
        // Try to parse price if present
        const priceMatch = text.match(/\$(\d+(?:\.\d{2})?)/)
        const price = priceMatch ? parseFloat(priceMatch[1]) : undefined

        // Clean the item name (remove price)
        let itemName = text.replace(/\$\d+(?:\.\d{2})?/, '').trim()

        // Skip if it's a header or navigation
        if (!itemName.toLowerCase().includes('menu') &&
            !itemName.toLowerCase().includes('back') &&
            itemName.length > 2) {
          menuItems.push({ itemName, price })
        }
      }
    })

    // Pattern 2: Try to find structured menu data
    const menuSections = document.querySelectorAll('[class*="menu"]')
    menuSections.forEach(section => {
      const items = section.querySelectorAll('li, tr, .item')
      items.forEach(item => {
        const nameEl = item.querySelector('.name, .title, td:first-child, strong')
        const priceEl = item.querySelector('.price, td:last-child')
        const descEl = item.querySelector('.description, .desc, p')

        if (nameEl) {
          const itemName = nameEl.textContent?.trim()
          const price = priceEl ? parseFloat(priceEl.textContent?.replace(/[^0-9.]/g, '') || '') : undefined
          const description = descEl?.textContent?.trim()

          if (itemName && itemName.length > 2) {
            menuItems.push({
              itemName,
              price: isNaN(price!) ? undefined : price,
              description
            })
          }
        }
      })
    })

    // Deduplicate
    const seen = new Set<string>()
    return menuItems.filter(item => {
      const key = item.itemName.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })

  // Add category inference
  return items.map(item => ({
    ...item,
    category: inferCategory(item.itemName),
  }))
}

/**
 * Scrape all restaurants for a park
 */
async function scrapePark(
  browser: puppeteer.Browser,
  parkName: string,
  parkUrl: string
): Promise<ScrapedRestaurant[]> {
  console.log(`Scraping ${parkName}...`)

  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })

  // Set a realistic user agent
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  )

  const restaurants: ScrapedRestaurant[] = []

  try {
    const restaurantLinks = await getRestaurantLinks(page, parkUrl)
    console.log(`  Found ${restaurantLinks.length} restaurants`)

    for (const restaurant of restaurantLinks) {
      try {
        console.log(`    ${restaurant.name}...`)
        await delay(1000) // Rate limit

        const items = await getMenuItems(page, restaurant.url)

        if (items.length > 0) {
          restaurants.push({
            source: 'touringplans',
            parkName,
            restaurantName: restaurant.name,
            landName: restaurant.land,
            items,
            scrapedAt: new Date(),
          })
          console.log(`      ${items.length} items`)
        } else {
          console.log(`      No items found`)
        }
      } catch (err) {
        console.error(`    Error scraping ${restaurant.name}:`, err)
      }
    }
  } finally {
    await page.close()
  }

  return restaurants
}

/**
 * Main scraper function
 */
export async function scrapeTouringPlans(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    source: 'touringplans',
    scrapedAt: new Date(),
    restaurants: [],
    errors: [],
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    for (const [parkName, url] of Object.entries(PARK_URLS)) {
      try {
        const parkRestaurants = await scrapePark(browser, parkName, url)
        result.restaurants.push(...parkRestaurants)
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
  scrapeTouringPlans()
    .then(result => {
      const outputDir = resolve(__dirname, '../../data/scraped')
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true })
      }

      const timestamp = new Date().toISOString().slice(0, 10)
      const outputPath = resolve(outputDir, `touringplans-${timestamp}.json`)
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
