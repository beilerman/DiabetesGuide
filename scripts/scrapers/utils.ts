import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname } from 'path'
import type { ScrapeResult, ScrapedItem } from './types.js'

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
    // Exclude savory items with "crispy" - let them fall through to other categories
    if (!/crispy/.test(n)) {
      return 'dessert'
    }
  }

  // Sides
  if (/\b(fries|coleslaw|corn|rice|beans|side salad|fruit cup|tots|onion rings)\b/.test(n)) {
    return 'side'
  }

  // Snacks (smaller items, often portable)
  if (/\b(snack|popcorn|churro|pretzel|corn dog|turkey leg|wings|nachos|dip)\b/.test(n)) {
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
