import puppeteer from 'puppeteer'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import type { ScrapeResult, ScrapedRestaurant } from './types.js'
import { inferCategory, delay } from './utils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// AllEars dining search pages by park (correct URL structure)
const PARK_URLS: Record<string, string> = {
  'Magic Kingdom': 'https://allears.net/dining/menu/search/all/magic-kingdom/all/all/',
  'EPCOT': 'https://allears.net/dining/menu/search/all/epcot/all/all/',
  'Hollywood Studios': 'https://allears.net/dining/menu/search/all/hollywood-studios/all/all/',
  'Animal Kingdom': 'https://allears.net/dining/menu/search/all/animal-kingdom/all/all/',
  'Disney Springs': 'https://allears.net/dining/menu/search/all/disney-springs/all/all/',
}

interface RestaurantLink {
  name: string
  url: string
  land?: string
}

/**
 * Extract restaurant links from a park search page
 */
async function getRestaurantLinks(page: puppeteer.Page, parkUrl: string): Promise<RestaurantLink[]> {
  await page.goto(parkUrl, { waitUntil: 'domcontentloaded', timeout: 45000 })

  // Wait for content to load
  await delay(5000)

  // Extract restaurant links from dining cards
  const links = await page.evaluate(() => {
    const results: { name: string; url: string; land?: string }[] = []
    const seen = new Set<string>()

    let currentLand: string | undefined

    // Process all h3 land headers and their following dining cards
    document.querySelectorAll('.fsearch_subrendergroup, .dining-card-slide').forEach(el => {
      if (el.classList.contains('fsearch_subrendergroup')) {
        // This is a land header
        const landLink = el.querySelector('.fsearch_subrendergroupLink')
        currentLand = landLink?.textContent?.trim()
      } else if (el.classList.contains('dining-card-slide')) {
        // This is a restaurant card
        const link = el.querySelector('a')
        if (link) {
          const href = link.href
          let name = link.textContent?.trim() || ''

          // Clean up restaurant name - remove meal type suffix like "- Lunch/Dinner"
          name = name.replace(/\s*-\s*(Snacks|All-Day|Breakfast|Lunch|Dinner|Lunch\/Dinner|Children's.*|Brunch)$/i, '').trim()

          // Deduplicate by restaurant base URL (drops trailing meal-type segment)
          const restaurantKey = href
            .replace(/\/[^/]+\/?$/, '')
            .toLowerCase()

          if (name && href.includes('/dining/menu/') && !seen.has(restaurantKey)) {
            seen.add(restaurantKey)
            results.push({
              name,
              url: href, // Keep one menu URL to scrape
              land: currentLand,
            })
          }
        }
      }
    })

    return results
  })

  return links
}

/**
 * Extract menu items from a restaurant menu page
 */
async function getMenuItems(page: puppeteer.Page, menuUrl: string): Promise<ScrapedRestaurant['items']> {
  // Use domcontentloaded for faster loading, shorter timeout
  try {
    await page.goto(menuUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  } catch {
    // Retry once with longer timeout
    try {
      await page.goto(menuUrl, { waitUntil: 'domcontentloaded', timeout: 45000 })
    } catch {
      return [] // Give up after second try
    }
  }

  // Wait for content
  await delay(3000)

  // Extract menu items
  const items = await page.evaluate(() => {
    const menuItems: { itemName: string; description?: string; price?: number; photoUrl?: string }[] = []
    const seen = new Set<string>()
    const toPhotoUrl = (imgEl: HTMLImageElement | null): string | undefined => {
      if (!imgEl) return undefined

      const rawSrc =
        imgEl.getAttribute('data-src') ||
        imgEl.getAttribute('data-lazy-src') ||
        imgEl.getAttribute('src') ||
        ''

      if (!rawSrc || rawSrc.startsWith('data:')) return undefined

      let absoluteUrl = rawSrc
      if (rawSrc.startsWith('//')) {
        absoluteUrl = `https:${rawSrc}`
      } else if (!/^https?:\/\//i.test(rawSrc)) {
        try {
          absoluteUrl = new URL(rawSrc, window.location.href).href
        } catch {
          return undefined
        }
      }

      const lower = absoluteUrl.toLowerCase()
      const hasImageHint =
        /\.(jpg|jpeg|png|webp|gif|avif)(\?|#|$)/i.test(absoluteUrl) ||
        lower.includes('/wp-content/')

      if (!hasImageHint) return undefined
      if (lower.includes('placeholder') || lower.includes('icon') || lower.includes('avatar')) return undefined

      return absoluteUrl
    }

    // AllEars uses .menuItems__item divs with .item-title, .item-description, .item-price
    document.querySelectorAll('.menuItems__item').forEach(el => {
      const titleEl = el.querySelector('.item-title')
      const descEl = el.querySelector('.item-description')
      const priceEl = el.querySelector('.item-price')

      // Get item name from title (may be in an anchor tag or direct text)
      let itemName = titleEl?.querySelector('a')?.textContent?.trim() ||
                     titleEl?.textContent?.trim() || ''

      // Clean up the name (remove trailing comma)
      itemName = itemName.replace(/,\s*$/, '').trim()

      const description = descEl?.textContent?.trim()
      const priceText = priceEl?.textContent?.trim() || ''

      // Try to find photo URL - look for img in item card or nearby
      const photoUrl = toPhotoUrl(el.querySelector('img') as HTMLImageElement | null)

      if (itemName && itemName.length > 2 && !seen.has(itemName.toLowerCase())) {
        seen.add(itemName.toLowerCase())

        // Parse price if present
        let price: number | undefined
        if (priceText) {
          const priceMatch = priceText.match(/\$?([\d.]+)/)
          if (priceMatch) {
            price = parseFloat(priceMatch[1])
          }
        }

        menuItems.push({
          itemName,
          description: description || undefined,
          price,
          photoUrl,
        })
      }
    })

    // Fallback: check for table-based menus
    if (menuItems.length === 0) {
      document.querySelectorAll('table tr').forEach(row => {
        const cells = row.querySelectorAll('td')
        if (cells.length >= 1) {
          const itemName = cells[0]?.textContent?.trim() || ''
          const description = cells.length >= 2 ? cells[1]?.textContent?.trim() : undefined
          const priceText = cells.length >= 3 ? cells[cells.length - 1]?.textContent?.trim() : ''

          // Try to find photo in table row
          const photoUrl = toPhotoUrl(row.querySelector('img') as HTMLImageElement | null)

          if (itemName && itemName.length > 2 && !seen.has(itemName.toLowerCase())) {
            // Skip header rows
            if (itemName.toLowerCase() === 'item' ||
                itemName.toLowerCase() === 'menu item' ||
                itemName.toLowerCase() === 'price' ||
                itemName.toLowerCase() === 'description') {
              return
            }

            seen.add(itemName.toLowerCase())

            let price: number | undefined
            if (priceText) {
              const priceMatch = priceText.match(/\$?([\d.]+)/)
              if (priceMatch) {
                price = parseFloat(priceMatch[1])
              }
            }

            menuItems.push({
              itemName,
              description: description || undefined,
              price,
              photoUrl,
            })
          }
        }
      })
    }

    return menuItems
  })

  // Add category inference - spread item to preserve photoUrl
  return items.map(item => ({
    itemName: item.itemName,
    description: item.description,
    price: item.price,
    photoUrl: item.photoUrl,
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
    const restaurantLinks = await getRestaurantLinks(page, parkUrl)
    console.log(`  Found ${restaurantLinks.length} restaurants`)

    for (const link of restaurantLinks) {
      try {
        console.log(`    ${link.name}...`)
        await delay(2000) // Rate limit to avoid detection

        const items = await getMenuItems(page, link.url)

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
  } finally {
    await page.close()
  }

  return restaurants
}

/**
 * Main scraper function
 */
export async function scrapeAllEarsPuppeteer(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    source: 'allears',
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
const isDirectRun = typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  scrapeAllEarsPuppeteer()
    .then(result => {
      const outputDir = resolve(__dirname, '../../data/scraped')
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true })
      }

      const timestamp = new Date().toISOString().slice(0, 10)
      const outputPath = resolve(outputDir, `allears-puppeteer-${timestamp}.json`)
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
