import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { dirname } from 'path'
import type { ScrapeResult, ScrapedItem } from './types.js'

/** The canonical set of menu categories accepted by the `menu_category` enum. */
export const MENU_CATEGORIES = ['entree', 'dessert', 'beverage', 'side', 'snack'] as const
export type MenuCategory = (typeof MENU_CATEGORIES)[number]

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

// ---------------------------------------------------------------------------
// Validation / sanitization for untrusted scraped data before DB insert.
// The scraper -> approve -> DB path is the single chokepoint where third-party
// content enters the database that the public app renders. Everything written
// must pass through these gates.
// ---------------------------------------------------------------------------

/** Coerce an arbitrary value to a valid menu_category, defaulting to 'entree'. */
export function coerceCategory(value: unknown): MenuCategory {
  return (MENU_CATEGORIES as readonly string[]).includes(value as string)
    ? (value as MenuCategory)
    : 'entree'
}

/**
 * Sanitize free text: strip control characters, trim, and cap length.
 * Returns undefined for empty/non-string input so callers can drop the field.
 */
export function sanitizeText(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== 'string') return undefined
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim()
  if (cleaned.length === 0) return undefined
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen).trim() : cleaned
}

/** Coerce to a finite integer clamped to [min, max], or null if not numeric. */
export function clampInt(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** Coerce to a plausible price (0..max), or undefined. */
export function clampPrice(value: unknown, max = 2000): number | undefined {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0 || n > max) return undefined
  return Math.round(n * 100) / 100
}

const ALLOWED_PHOTO_HOSTS: RegExp[] = [
  /(^|\.)disneyfoodblog\.com$/i,
  /(^|\.)allears\.net$/i,
  /(^|\.)universalorlando\.com$/i,
  /(^|\.)dollywood\.com$/i,
  /(^|\.)sixflags\.com$/i,
  /(^|\.)cloudinary\.com$/i,
]

/**
 * Validate a scraped photo URL: must be https on an allowlisted host.
 * Rejects javascript:/data: and attacker-controlled hosts that would render
 * as an <img src> phishing/tracking vector in the app.
 */
export function isSafePhotoUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const u = new URL(value)
    if (u.protocol !== 'https:') return undefined
    if (!ALLOWED_PHOTO_HOSTS.some(rx => rx.test(u.hostname))) return undefined
    return u.toString()
  } catch {
    return undefined
  }
}

/**
 * Write a scrape result to disk, log a summary, and exit the process with a
 * non-zero code when the scrape produced fewer than `minItems` total items.
 * This converts "ran clean but returned nothing" (the silent-breakage failure
 * mode of selector rot / expired creds) into a hard CI failure.
 */
export function finalizeScrapeCli(
  result: ScrapeResult,
  outputPath: string,
  opts: { minItems?: number } = {},
): never {
  const dir = dirname(outputPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(outputPath, JSON.stringify(result, null, 2))

  const totalItems = result.restaurants.reduce((sum, r) => sum + r.items.length, 0)
  console.log(`\nSaved ${result.restaurants.length} restaurants / ${totalItems} items to ${outputPath}`)
  if (result.errors.length > 0) {
    console.log(`Errors (${result.errors.length}):`)
    for (const e of result.errors) console.log(`  - ${e}`)
  }

  const minItems = opts.minItems ?? 1
  if (totalItems < minItems) {
    console.error(`FAIL: scraped only ${totalItems} items (expected >= ${minItems}). Treating as scraper failure.`)
    process.exit(1)
  }
  process.exit(0)
}

/**
 * Minimal `.env.local` loader for standalone scripts run via tsx outside the
 * inline-env CI invocations. Populates process.env for any key not already set.
 * Consolidates three hand-rolled copies that previously drifted.
 */
export function loadEnvLocal(path = '.env.local'): void {
  if (!existsSync(path)) return
  const content = readFileSync(path, 'utf-8')
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    // Strip surrounding quotes if present
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (key && process.env[key] === undefined) process.env[key] = val
  }
}
