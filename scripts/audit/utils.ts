import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import type { Item, NutData, GraduationState } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..')

/**
 * Resolve a path relative to the project root.
 */
export function rootPath(...segments: string[]): string {
  return resolve(ROOT, ...segments)
}

/**
 * Read .env.local from project root and return key-value pairs.
 */
export function loadEnv(): Record<string, string> {
  try {
    const envPath = resolve(ROOT, '.env.local')
    const content = readFileSync(envPath, 'utf-8')
    const vars: Record<string, string> = {}
    content.split('\n').forEach(line => {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx > 0) vars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
      }
    })
    return vars
  } catch {
    return {}
  }
}

/**
 * Create a Supabase client using env vars (with fallbacks).
 * Exits with error if required vars are missing.
 */
export function createSupabaseClient() {
  const envVars = loadEnv()

  const url =
    process.env.SUPABASE_URL ||
    envVars['SUPABASE_URL'] ||
    process.env.VITE_SUPABASE_URL ||
    envVars['VITE_SUPABASE_URL']

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    envVars['SUPABASE_SERVICE_ROLE_KEY']

  if (!url) {
    console.error('Missing SUPABASE_URL or VITE_SUPABASE_URL in environment or .env.local')
    process.exit(1)
  }

  if (!key) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY in environment or .env.local')
    process.exit(1)
  }

  return createClient(url, key)
}

/**
 * Paginated fetch of all menu_items with nested restaurant, park, and nutritional_data.
 * Fetches 500 items per page.
 */
export async function fetchAllItems(
  supabase: ReturnType<typeof createClient>
): Promise<Item[]> {
  const PAGE_SIZE = 500
  const all: Item[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('menu_items')
      .select(
        `id, name, category, is_vegetarian, is_fried, description,
         restaurant:restaurants(name, park:parks(name)),
         nutritional_data(id, calories, carbs, fat, sugar, protein, fiber, sodium, cholesterol, source, confidence_score)`
      )
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      console.error(`Fetch error at offset ${offset}:`, error.message)
      break
    }

    if (!data || data.length === 0) break

    all.push(...(data as unknown as Item[]))
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return all
}

/**
 * Get the first nutritional_data entry for an item, or null if none.
 */
export function nd(item: Item): NutData | null {
  return item.nutritional_data?.[0] ?? null
}

/**
 * Format item location as "Restaurant @ Park".
 */
export function loc(item: Item): string {
  const restaurant = item.restaurant?.name ?? 'Unknown Restaurant'
  const park = item.restaurant?.park?.name ?? 'Unknown Park'
  return `${restaurant} @ ${park}`
}

// ---- Alcoholic beverage detection ----

const NEGATIVE_PATTERNS = /\b(batter(?:ed)?|bread(?:ed)?|sauce|glaze|glazed|crust(?:ed)?|brined|braised|marinated|infused|cake|cookie|root\s*beer|ginger\s*beer|ginger\s*ale|butterbeer|cream\s*soda|rum\s*cake)\b/i

const BEER_PATTERNS = /\b(beer|ale|lager|stout|ipa|pilsner|porter|hefeweizen|saison|gose)\b/i
const WINE_PATTERNS = /\b(wine|merlot|chardonnay|cabernet|pinot|prosecco|champagne|riesling|moscato|sangria)\b/i
const COCKTAIL_PATTERNS = /\b(margarita|mojito|daiquiri|martini|manhattan|cosmopolitan|old\s*fashioned|negroni|paloma|pi[nñ]a\s*colada|mai\s*tai|long\s*island)\b/i
const SPIRIT_PATTERNS = /\b(bourbon|whiskey|vodka|rum|tequila|gin|sake|mead)\b/i
const OTHER_ALCOHOL_PATTERNS = /\b(hard\s*cider|hard\s*seltzer|mimosa|bellini|spritz|aperol)\b/i

const BAR_CONTEXT = /\b(bar|lounge|cantina|pub)\b/i

/**
 * Detect whether an item is likely an alcoholic beverage.
 * Uses comprehensive patterns with negative lookaheads for food items
 * containing beer/wine/rum as ingredients.
 */
export function isLikelyAlcoholic(name: string, item: Item): boolean {
  const text = name.toLowerCase()

  // Check negative patterns first — food items that contain alcohol-related words
  if (NEGATIVE_PATTERNS.test(text)) {
    return false
  }

  // Check description for negative patterns too
  if (item.description && NEGATIVE_PATTERNS.test(item.description)) {
    return false
  }

  // Direct pattern matches on item name
  if (BEER_PATTERNS.test(text)) return true
  if (WINE_PATTERNS.test(text)) return true
  if (COCKTAIL_PATTERNS.test(text)) return true
  if (SPIRIT_PATTERNS.test(text)) return true
  if (OTHER_ALCOHOL_PATTERNS.test(text)) return true

  // Bar context: beverage at a bar/lounge/cantina/pub
  const restaurantName = item.restaurant?.name ?? ''
  if (
    BAR_CONTEXT.test(restaurantName) &&
    item.category === 'beverage'
  ) {
    // Only flag as alcoholic if the name also hints at it
    // (prevents plain water/soda at a bar from being flagged)
    if (/\b(draft|on\s*tap|craft|flight|pour|neat|rocks|frozen|blended)\b/i.test(text)) {
      return true
    }
  }

  return false
}

// ---- Graduation state persistence ----

const GRADUATION_FILE = rootPath('audit', 'graduation-state.json')

const DEFAULT_GRADUATION_STATE: GraduationState = {
  mode: 'daily',
  consecutiveCleanDays: 0,
  lastAudit: '',
  autoFixesApplied: 0,
  graduationThreshold: 14,
  history: [],
}

/**
 * Load graduation state from audit/graduation-state.json, or return defaults.
 */
export function loadGraduationState(): GraduationState {
  if (!existsSync(GRADUATION_FILE)) {
    return { ...DEFAULT_GRADUATION_STATE }
  }

  try {
    const content = readFileSync(GRADUATION_FILE, 'utf-8')
    return JSON.parse(content) as GraduationState
  } catch {
    return { ...DEFAULT_GRADUATION_STATE }
  }
}

/**
 * Save graduation state to audit/graduation-state.json.
 */
export function saveGraduationState(state: GraduationState): void {
  writeFileSync(GRADUATION_FILE, JSON.stringify(state, null, 2) + '\n', 'utf-8')
}
