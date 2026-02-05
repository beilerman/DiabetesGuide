import puppeteer from 'puppeteer'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import type { ScrapeResult, ScrapedRestaurant } from './types.js'
import { inferCategory, delay } from './utils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DINING_LIST_URL = 'https://www.dollywood.com/themepark/dining/'
const PARK_NAME = 'Dollywood'

interface RestaurantLink {
  name: string
  url: string
  landName?: string
}

/**
 * Map Dollywood menu section names to our category types.
 * Falls back to inferCategory() from item name if no section match.
 */
function sectionToCategory(sectionName: string): ScrapedRestaurant['items'][number]['category'] | undefined {
  const s = sectionName.toLowerCase()

  if (/beverage|refreshing sips|drinks/.test(s)) return 'beverage'
  if (/dessert|sweet tastes|sweets/.test(s)) return 'dessert'
  if (/side|bountiful greens|salad/.test(s)) return 'side'
  if (/starter|appetizer|snack|topper|preserves|butters/.test(s)) return 'snack'
  if (/youngster|kid/.test(s)) return 'entree' // kids meals are still entrees
  // "Smoky Mountain Classics", "Signature Southern Specialties", "Sandwiches" etc. -> entree
  if (/classic|special|sandwich|main|entree|platter|combo/.test(s)) return 'entree'
  if (/seasonal/.test(s)) return undefined // seasonal items vary, let inferCategory handle it

  return undefined
}

/**
 * Extract restaurant links and land names from the main Dollywood dining page
 */
async function getRestaurantLinks(page: puppeteer.Page): Promise<RestaurantLink[]> {
  console.log('Fetching dining listing page...')
  await page.goto(DINING_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await delay(5000)

  const links = await page.evaluate(() => {
    const results: { name: string; url: string; landName?: string }[] = []
    const seen = new Set<string>()

    // Restaurant cards on the listing page follow a pattern:
    // H3 with restaurant name, sometimes followed by land name text,
    // then a "More Details" link to the restaurant page.
    //
    // We find all "More Details" links that point to /themepark/dining/<slug>/
    // and extract the restaurant name from the preceding H3.
    document.querySelectorAll('a[href*="/themepark/dining/"]').forEach(a => {
      const href = (a as HTMLAnchorElement).href
      const text = (a.textContent || '').trim()

      // Only "More Details" links (not nav links)
      if (text !== 'More Details') return

      // Extract slug for dedup
      const slugMatch = href.match(/\/themepark\/dining\/([^/]+)\/?$/)
      if (!slugMatch) return
      const slug = slugMatch[1]
      if (seen.has(slug)) return
      seen.add(slug)

      // Find the parent card container and get the H3 restaurant name
      // Walk up to find a container that has the H3
      let container = a.parentElement
      for (let i = 0; i < 10 && container; i++) {
        const h3 = container.querySelector('h3')
        if (h3) {
          const name = (h3.textContent || '').trim()
          // Try to find land name — it's usually in a text node or small element
          // between the H3 and the "More Details" link
          let landName: string | undefined
          const allText = (container.textContent || '').trim()
          // The land name appears on its own line between restaurant name and "More Details"
          const lines = allText.split('\n').map(l => l.trim()).filter(Boolean)
          // Pattern: [restaurant name, land name, "More Details"]
          for (const line of lines) {
            if (line !== name && line !== 'More Details' && line.length > 2 && line.length < 40) {
              // Check if it's a known Dollywood land
              if (/Showstreet|Country Fair|Craftsman|Rivertown|Village|Timber|Jukebox|Wildwood|Wilderness|Throughout/i.test(line)) {
                landName = line
                break
              }
            }
          }

          results.push({ name, url: href, landName })
          break
        }
        container = container.parentElement
      }
    })

    return results
  })

  console.log(`Found ${links.length} restaurants on listing page`)
  return links
}

/**
 * Extract menu items from a single Dollywood restaurant page.
 * The page uses Bootstrap collapse accordions for menu sections.
 * We force-expand all sections via JS, then parse the structured HTML.
 */
async function getMenuItems(
  page: puppeteer.Page,
  restaurantUrl: string
): Promise<{ items: ScrapedRestaurant['items']; landName?: string }> {
  try {
    await page.goto(restaurantUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  } catch {
    // Retry once with longer timeout
    try {
      await page.goto(restaurantUrl, { waitUntil: 'domcontentloaded', timeout: 45000 })
    } catch {
      return { items: [] }
    }
  }

  await delay(3000)

  const result = await page.evaluate(() => {
    // Force-expand all Bootstrap collapse sections
    document.querySelectorAll('.collapse').forEach(el => {
      (el as HTMLElement).classList.add('show')
      ;(el as HTMLElement).style.display = 'block'
    })

    const menuDiv = document.querySelector('.menu')
    if (!menuDiv) return { sections: [], landName: undefined }

    // Try to extract land name from the page (usually in a standalone text element)
    let landName: string | undefined
    const pageText = document.body.innerText
    const landPatterns = [
      'Showstreet', 'Country Fair', "Craftsman's Valley", 'Rivertown Junction',
      'The Village', 'Timber Canyon', 'Jukebox Junction', 'Wildwood Grove',
      'Wilderness Pass', 'Throughout the Park',
    ]
    for (const land of landPatterns) {
      if (pageText.includes(land)) {
        landName = land
        break
      }
    }

    // Parse each accordion section
    const sections: { sectionName: string; items: { itemName: string; description?: string; price?: number; dietaryIcons: string[] }[] }[] = []

    menuDiv.querySelectorAll('.accord').forEach(accord => {
      const headerBtn = accord.querySelector('.accord-header button')
      const sectionName = (headerBtn?.textContent || '').trim()
      if (!sectionName) return

      const collapseDiv = accord.querySelector('.collapse')
      if (!collapseDiv) return

      const sectionItems: typeof sections[number]['items'] = []
      const seen = new Set<string>()

      // Each menu item is a .row with border-bottom
      collapseDiv.querySelectorAll('.row.m-0').forEach(row => {
        const nameEl = row.querySelector('.col-9 strong, .text-left strong')
        const priceEl = row.querySelector('.col-3 strong, .text-right strong')
        const descEl = row.querySelector('.col-md-12.pt-1')

        const itemName = (nameEl?.textContent || '').trim()
        if (!itemName || itemName.length < 2) return
        if (seen.has(itemName.toLowerCase())) return
        seen.add(itemName.toLowerCase())

        // Parse price
        let price: number | undefined
        const priceText = (priceEl?.textContent || '').trim()
        if (priceText) {
          const priceMatch = priceText.match(/\$?([\d.]+)/)
          if (priceMatch) {
            price = parseFloat(priceMatch[1])
          }
        }

        // Parse description
        let description: string | undefined
        if (descEl) {
          const descText = (descEl.textContent || '').trim()
          if (descText && descText !== itemName) {
            description = descText
          }
        }

        // Parse dietary icons
        const dietaryIcons: string[] = []
        row.querySelectorAll('.dietary-icon').forEach(icon => {
          const iconText = (icon.textContent || '').trim().toLowerCase()
          if (iconText) dietaryIcons.push(iconText)
        })

        sectionItems.push({ itemName, description, price, dietaryIcons })
      })

      if (sectionItems.length > 0) {
        sections.push({ sectionName, items: sectionItems })
      }
    })

    return { sections, landName }
  })

  // Transform sections into flat items with categories
  const items: ScrapedRestaurant['items'] = []
  const seen = new Set<string>()

  for (const section of result.sections) {
    const sectionCategory = sectionToCategory(section.sectionName)

    for (const item of section.items) {
      if (seen.has(item.itemName.toLowerCase())) continue
      seen.add(item.itemName.toLowerCase())

      // Use section-based category, then fall back to name-based inference
      const category = sectionCategory ?? inferCategory(item.itemName) ?? 'entree'

      items.push({
        itemName: item.itemName,
        description: item.description,
        price: item.price,
        category,
      })
    }
  }

  return { items, landName: result.landName }
}

/**
 * Main scraper function for Dollywood theme park dining
 */
export async function scrapeDollywood(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    source: 'official',
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
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )

    // Step 1: Get all restaurant links from the listing page
    let restaurantLinks: RestaurantLink[]
    try {
      restaurantLinks = await getRestaurantLinks(page)
    } catch (err) {
      const msg = `Failed to load dining listing page: ${err}`
      console.error(msg)
      result.errors.push(msg)
      await browser.close()
      return result
    }

    // Step 2: Scrape each restaurant's menu
    for (const link of restaurantLinks) {
      try {
        console.log(`  Scraping: ${link.name}...`)
        await delay(2000) // Rate limit: 2s between pages

        const { items, landName } = await getMenuItems(page, link.url)

        // Use land from listing page first, then from detail page
        const resolvedLand = link.landName || landName

        if (items.length > 0) {
          result.restaurants.push({
            source: 'official',
            parkName: PARK_NAME,
            restaurantName: link.name,
            landName: resolvedLand,
            items,
            scrapedAt: new Date(),
          })
          console.log(`    -> ${items.length} items` + (resolvedLand ? ` (${resolvedLand})` : ''))
        } else {
          console.log(`    -> No menu items found`)
        }
      } catch (err) {
        const msg = `Error scraping ${link.name}: ${err}`
        console.error(`    -> ${msg}`)
        result.errors.push(msg)
      }
    }

    await page.close()
  } finally {
    await browser.close()
  }

  return result
}

// CLI entry point
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  scrapeDollywood()
    .then(result => {
      const outputDir = resolve(__dirname, '../../data/scraped')
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true })
      }

      const timestamp = new Date().toISOString().slice(0, 10)
      const outputPath = resolve(outputDir, `dollywood-${timestamp}.json`)
      writeFileSync(outputPath, JSON.stringify(result, null, 2))

      const totalItems = result.restaurants.reduce((sum, r) => sum + r.items.length, 0)

      console.log('')
      console.log('=== Dollywood Scrape Complete ===')
      console.log(`Restaurants: ${result.restaurants.length}`)
      console.log(`Total items: ${totalItems}`)
      console.log(`Errors: ${result.errors.length}`)
      if (result.errors.length > 0) {
        result.errors.forEach(e => console.log(`  - ${e}`))
      }
      console.log(`Output: ${outputPath}`)
    })
    .catch(console.error)
}
