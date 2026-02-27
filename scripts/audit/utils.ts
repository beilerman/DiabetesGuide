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

// Food items that contain alcohol-related words in cooking context
const NEGATIVE_PATTERNS = /\b(batter(?:ed)?|bread(?:ed)?|sauce|glaze|glazed|crust(?:ed)?|brined|braised|marinated|infused|cookie|root\s*beer|ginger\s*beer|ginger\s*ale|butterbeer|cream\s*soda|rum\s*cake|punch\s*cake|beer\s*cheese|sweet\s*(?:and|&)\s*sour|sour\s*cream)\b/i

// Definitive cocktail/spirit patterns override negatives (e.g., "Grapefruit Cake Martini")
const DEFINITIVE_COCKTAIL = /\b(martinis?|margaritas?|mojitos?|daiquiris?|manhattans?|negronis?|cosmopolitans?|pi[nñ]a\s*coladas?|mai\s*tais?|long\s*islands?|espresso\s*martinis?|micheladas?|mules?|palomas?|mimosas?|bellinis?)\b/i

const BEER_PATTERNS = /\b(beer|ale|lager|stout|ipa|pilsner|porter|hefeweizen|saison|gose|shandy|wheat\s*beer|pale\s*ale|draught|amber|apa)\b/i
const WINE_PATTERNS = /\b(wines?|merlot|chardonnay|cabernet|pinot|prosecco|champagne|riesling|moscato|sangria|ros[eé]|sauvignon|shiraz|tempranillo|grüner|glühwein|malbec|grillo|vermentino|regale|brut|froscato|froz[eé']|friezling|cavicchioli|cotes\s*du\s*rhone)\b/i
const COCKTAIL_PATTERNS = /\b(margaritas?|mojitos?|daiquiris?|martinis?|manhattans?|cosmopolitans?|old\s*fashioned|negronis?|palomas?|pi[nñ]a\s*coladas?|mai\s*tais?|long\s*island|mules?|sours?|sling|collins|julep|caipirinha|rickey|gimlet|highball|toddy|smash|swizzle|spritzer|espresso\s*martinis?|coladas?|mudslides?|micheladas?|mimosas?|bellinis?|bees?\s*knees|punch|cosmo|ritas?|lava\s*flow)\b/i
const SPIRIT_PATTERNS = /\b(bourbon|whiskey|whisky|vodka|rum|tequila|gin|sake|mead|mezcal|absinthe|grappa|schnapps|amaretto|kahlua|bailey'?s|jägermeister|limoncello|amarula|cachaça|liqueur|malibu|raicilla|raclcilla|sotol)\b/i
const OTHER_ALCOHOL_PATTERNS = /\b(hard\s*cider|hard\s*seltzer|hard\s*lemonade|mimosas?|bellinis?|spritz|aperol|cocktail|on\s*the\s*rocks|neat|proof|abv|tipsy|boozy|spiked|spirited|with\s*alcohol|with\s*(?:rum|vodka|tequila|whiskey|bourbon|gin)|dole\s*whip\s*flight)\b/i

// Known brand beers (don't contain "beer" or "ale" in name)
const BRAND_BEER = /\b(michelob\s*ultra|miller\s*lite|bud\s*light|modelo\s*especial|heineken|corona(?!\s*chicken)|stella\s*artois|yuengling|kronenbourg|delirium\s*tremens|dragon'?s?\s*milk|duvel|guinness|crooked\s*can|perrier[- ]jouët|pbr|pabst|dos\s*equis|blue\s*moon|sam\s*adams|samuel\s*adams|budweiser|coors|tecate|pacifico|lagunitas|sierra\s*nevada|fat\s*tire|shock\s*top|landshark|kona|red\s*stripe)\b/i

// Known hard seltzers & ciders
const BRAND_SELTZER_CIDER = /\b(high\s*noon|white\s*claw|truly|topo\s*chico\s*hard|strongbow|angry\s*orchard|magners|aval\s*french|rekorderlig|woodchuck|smith\s*&\s*forge|ace\s*cider)\b/i

// Age restriction markers — definitive alcoholic indicator
const AGE_RESTRICTED = /\(21\+\)|must\s*be\s*21|adults?\s*only/i

const BAR_CONTEXT = /\b(bar|lounge|cantina|pub|tavern|taphouse|tap\s*house|taproom|tap\s*room|grog|grotto|grill\s*&?\s*bar|tonic|wine\s*bar)\b/i

// Non-alcoholic beverage patterns — used to EXCLUDE items at bars from being flagged
const NON_ALCOHOLIC_PATTERNS = /\b(water|dasani|aquafina|evian|coca[- ]?cola|coke|pepsi|sprite|fanta|dr\.?\s*pepper|mountain\s*dew|coffee|espresso|latte|cappuccino|americano|mocha|macchiato|cold\s*brew|tea|chai|matcha|juice|smoothie|milkshake|shake|float|malt|dole\s*whip|icee|slush|frapp|hot\s*chocolate|cocoa|apple\s*cider|milk(?!\s*stout)|chocolate\s*milk|powerade|gatorade|freestyle|fountain\s*drink|kids?\b|child|soda\b)\b/i

// Creative cocktail names that contain no standard alcohol keywords.
// Verified alcoholic via descriptions or menus.
const KNOWN_ALCOHOLIC_NAMES = new Set([
  'lost on safari',
  'sherbet lemon',
  'yak attack',
  'pink himalayan',
  'everest escape',
  'dockside iced tea',
  'beach bum',
  'texas tea',
  'shark tooth',
])

// Description-only alcohol patterns: spirits/cocktails mentioned in description
// but not in the item name. Uses same patterns as name-based checks.
function descriptionHasAlcohol(desc: string): boolean {
  if (SPIRIT_PATTERNS.test(desc)) return true
  if (COCKTAIL_PATTERNS.test(desc)) return true
  if (BEER_PATTERNS.test(desc)) return true
  if (WINE_PATTERNS.test(desc)) return true
  if (OTHER_ALCOHOL_PATTERNS.test(desc)) return true
  if (BRAND_BEER.test(desc)) return true
  if (DEFINITIVE_COCKTAIL.test(desc)) return true
  if (/\bDO\b/.test(desc) && /\b(Spain|France|Italy|Portugal)\b/i.test(desc)) return true
  return false
}

/**
 * Detect whether an item is likely an alcoholic beverage.
 *
 * Strategy (priority order):
 * 1. Definitive cocktail patterns (martini, margarita) ALWAYS win
 * 2. Brand beers/seltzers/ciders are definitive
 * 3. Age restriction markers (21+) are definitive
 * 4. Known creative cocktail names (verified from menus)
 * 5. General alcohol keyword matching on name
 * 6. Description-based detection (spirits/cocktails in description)
 * 7. Negative patterns block softer matches (e.g., "beer-battered" is food)
 * 8. Bar context: beverages at bars/lounges assumed alcoholic unless clearly non-alcoholic
 */
export function isLikelyAlcoholic(name: string, item: Item): boolean {
  const text = name.toLowerCase()
  const desc = item.description || ''

  // 1. Definitive cocktail/spirit patterns ALWAYS win (override negatives like "cake")
  if (DEFINITIVE_COCKTAIL.test(text)) return true

  // 2. Brand beer/seltzer/cider names are definitive
  if (BRAND_BEER.test(text)) return true
  if (BRAND_SELTZER_CIDER.test(text)) return true

  // 3. Age restriction markers are definitive
  if (AGE_RESTRICTED.test(text)) return true

  // 4. Known creative cocktail names (verified alcoholic)
  if (KNOWN_ALCOHOLIC_NAMES.has(text)) return true

  // 5. Check ALL alcohol patterns on name — these override negatives
  if (/\bcocktail\b/i.test(text) && !/\b(shrimp|prawn|fruit|crab|seafood)\b/i.test(text)) {
    return true
  }
  if (/\bbrew\b/i.test(text) && !/\bcold\s*brew\b/i.test(text)) {
    return true
  }
  if (/\bflight\b/i.test(text)) {
    return true
  }
  if (/frozen.*(?:alcohol|with\s+(?:rum|vodka|tequila))/i.test(text)) {
    return true
  }
  if (/with\s+alcohol/i.test(text)) return true
  if (BEER_PATTERNS.test(text)) return true
  if (WINE_PATTERNS.test(text)) return true
  if (COCKTAIL_PATTERNS.test(text)) return true
  if (SPIRIT_PATTERNS.test(text)) return true
  if (OTHER_ALCOHOL_PATTERNS.test(text)) return true

  // 6. Description-based detection — catches creative cocktail names like
  // "Lost on Safari" (desc: "Rum + fruit punch"), "Texas Tea" (desc: "bourbon, rum..."),
  // "Alberto Dante's Millionaire Cappuccino" (desc: "Baileys Irish Cream Liqueur...")
  if (desc && descriptionHasAlcohol(desc)) {
    return true
  }

  // 7. Negative patterns — food items with alcohol words in cooking context
  if (NEGATIVE_PATTERNS.test(text)) {
    return false
  }

  // 8. Bar context: items at bars/lounges/cantinas/pubs/taverns
  // assumed alcoholic unless clearly non-alcoholic
  const restaurantName = item.restaurant?.name ?? ''
  if (
    BAR_CONTEXT.test(restaurantName) &&
    !NON_ALCOHOLIC_PATTERNS.test(text)
  ) {
    return true
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
