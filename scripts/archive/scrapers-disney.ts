import puppeteer from 'puppeteer'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import type { ScrapeResult, ScrapedRestaurant } from './types.js'
import { inferCategory, delay } from './utils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Disney World dining pages by park
const WDW_PARKS: Record<string, string> = {
  'Magic Kingdom': 'https://disneyworld.disney.go.com/dining/magic-kingdom/',
  'EPCOT': 'https://disneyworld.disney.go.com/dining/epcot/',
  'Hollywood Studios': 'https://disneyworld.disney.go.com/dining/hollywood-studios/',
  'Animal Kingdom': 'https://disneyworld.disney.go.com/dining/animal-kingdom/',
  'Disney Springs': 'https://disneyworld.disney.go.com/dining/disney-springs/',
}

interface RestaurantInfo {
  name: string
  url: string
  park: string
}

/**
 * Extract restaurant links from a park dining page
 */
async function getRestaurantLinks(page: puppeteer.Page, parkName: string, parkUrl: string): Promise<RestaurantInfo[]> {
  console.log(`  Navigating to ${parkName} dining page...`)
  await page.goto(parkUrl, { waitUntil: 'networkidle2', timeout: 60000 })

  // Wait for content to load
  await delay(3000)

  // Scroll to load lazy content
  await autoScroll(page)

  // Extract restaurant links
  const restaurants = await page.evaluate(() => {
    const links: { name: string; url: string }[] = []

    // Disney uses various card/tile layouts for restaurants
    const selectors = [
      'a[href*="/dining/"][href*="/menus"]',
      '.card a[href*="/dining/"]',
      '.entityCard a',
      'a.cardLinkOverlay',
      '[data-testid="dining-card"] a',
      '.finderCard a',
    ]

    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach(link => {
        const href = (link as HTMLAnchorElement).href
        // Find the restaurant name from the card
        const card = link.closest('.card, .entityCard, .finderCard, [data-testid]')
        const nameEl = card?.querySelector('h2, h3, .cardName, .entityName, [data-testid="card-title"]')
        const name = nameEl?.textContent?.trim() || link.textContent?.trim()

        if (name && href && href.includes('/dining/') && !links.some(l => l.url === href)) {
          // Get the base restaurant URL (without /menus suffix)
          const baseUrl = href.replace(/\/menus\/?$/, '')
          links.push({ name, url: baseUrl })
        }
      })
    }

    // Also try to find restaurant links directly
    document.querySelectorAll('a[href*="/dining/"]').forEach(link => {
      const href = (link as HTMLAnchorElement).href
      const name = link.textContent?.trim()

      // Filter to actual restaurant pages (have park in URL path)
      if (name && href &&
          (href.includes('/magic-kingdom/') ||
           href.includes('/epcot/') ||
           href.includes('/hollywood-studios/') ||
           href.includes('/animal-kingdom/') ||
           href.includes('/disney-springs/')) &&
          !href.includes('/finder/') &&
          !links.some(l => l.url === href)) {
        links.push({ name, url: href.replace(/\/menus\/?$/, '') })
      }
    })

    return links
  })

  return restaurants.map(r => ({ ...r, park: parkName }))
}

/**
 * Auto-scroll to load lazy content
 */
async function autoScroll(page: puppeteer.Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0
      const distance = 500
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight
        window.scrollBy(0, distance)
        totalHeight += distance

        if (totalHeight >= scrollHeight) {
          clearInterval(timer)
          resolve()
        }
      }, 100)

      // Safety timeout
      setTimeout(() => {
        clearInterval(timer)
        resolve()
      }, 10000)
    })
  })
}

/**
 * Extract menu items from a restaurant's menu page
 */
async function getMenuItems(page: puppeteer.Page, restaurantUrl: string): Promise<ScrapedRestaurant['items']> {
  const menuUrl = restaurantUrl.endsWith('/menus') ? restaurantUrl : `${restaurantUrl}/menus/`

  try {
    await page.goto(menuUrl, { waitUntil: 'networkidle2', timeout: 60000 })
  } catch (err) {
    // Try without trailing slash
    try {
      await page.goto(menuUrl.replace(/\/$/, ''), { waitUntil: 'networkidle2', timeout: 60000 })
    } catch {
      return []
    }
  }

  // Wait for menu content
  await delay(2000)

  // Extract menu items
  const items = await page.evaluate(() => {
    const menuItems: { itemName: string; description?: string; price?: number }[] = []

    // Disney menu page selectors
    const itemSelectors = [
      '.menuItem',
      '.menu-item',
      '[data-testid="menu-item"]',
      '.menuListItem',
      'li[class*="menu"]',
      '.menuSection li',
      '.menuContent li',
    ]

    for (const selector of itemSelectors) {
      document.querySelectorAll(selector).forEach(el => {
        // Try to find item name
        const nameEl = el.querySelector('h3, h4, .itemName, .menuItemName, [data-testid="item-name"], strong')
        const name = nameEl?.textContent?.trim()

        // Try to find description
        const descEl = el.querySelector('p, .itemDescription, .menuItemDescription, [data-testid="item-description"]')
        const description = descEl?.textContent?.trim()

        // Try to find price
        const priceEl = el.querySelector('.price, .itemPrice, .menuItemPrice, [data-testid="item-price"]')
        const priceText = priceEl?.textContent?.trim() || ''
        const priceMatch = priceText.match(/\$?([\d.]+)/)
        const price = priceMatch ? parseFloat(priceMatch[1]) : undefined

        if (name && name.length > 2 && name.length < 150) {
          menuItems.push({ itemName: name, description, price })
        }
      })
    }

    // Also try table-based menus
    if (menuItems.length === 0) {
      document.querySelectorAll('table tr').forEach(row => {
        const cells = row.querySelectorAll('td')
        if (cells.length >= 1) {
          const name = cells[0]?.textContent?.trim()
          const description = cells.length >= 2 ? cells[1]?.textContent?.trim() : undefined
          const priceText = cells[cells.length - 1]?.textContent?.trim() || ''
          const priceMatch = priceText.match(/\$?([\d.]+)/)
          const price = priceMatch ? parseFloat(priceMatch[1]) : undefined

          if (name && name.length > 2 && !name.toLowerCase().includes('item') && !name.toLowerCase().includes('price')) {
            menuItems.push({ itemName: name, description, price })
          }
        }
      })
    }

    // Try generic list items in menu sections
    if (menuItems.length === 0) {
      document.querySelectorAll('[class*="menu"] ul li, [class*="Menu"] ul li').forEach(el => {
        const text = el.textContent?.trim() || ''
        // Parse "Item Name - $Price" or "Item Name $Price"
        const match = text.match(/^(.+?)(?:\s*[-–]\s*|\s+)\$?([\d.]+)$/)
        if (match) {
          menuItems.push({
            itemName: match[1].trim(),
            price: parseFloat(match[2]),
          })
        } else if (text.length > 2 && text.length < 100) {
          menuItems.push({ itemName: text })
        }
      })
    }

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
  console.log(`\nScraping ${parkName}...`)

  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })

  // Set a realistic user agent
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  )

  const restaurants: ScrapedRestaurant[] = []

  try {
    const restaurantLinks = await getRestaurantLinks(page, parkName, parkUrl)
    console.log(`  Found ${restaurantLinks.length} restaurants`)

    for (const restaurant of restaurantLinks) {
      try {
        console.log(`    ${restaurant.name}...`)
        await delay(2000) // Rate limit

        const items = await getMenuItems(page, restaurant.url)

        if (items.length > 0) {
          restaurants.push({
            source: 'official',
            parkName,
            restaurantName: restaurant.name,
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
export async function scrapeDisney(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    source: 'official',
    scrapedAt: new Date(),
    restaurants: [],
    errors: [],
  }

  console.log('Launching browser...')
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })

  try {
    for (const [parkName, url] of Object.entries(WDW_PARKS)) {
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
  scrapeDisney()
    .then(result => {
      const outputDir = resolve(__dirname, '../../data/scraped')
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true })
      }

      const timestamp = new Date().toISOString().slice(0, 10)
      const outputPath = resolve(outputDir, `disney-${timestamp}.json`)
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
