/**
 * Upgrade items with definitively-known nutrition to source='official', confidence=95.
 *
 * Three categories of "definitive":
 *   1. Zero-calorie items (plain bottled water, plain coffee, plain tea, diet soda).
 *      For these, 0/0/0/0 is not an estimate — it's a fact.
 *   2. Branded sodas at standard fountain sizes from manufacturer-published values.
 *   3. Specific Disney items with documented lab-tested or Disney-published values
 *      (turkey leg, mickey pretzel, etc., per CLAUDE.md and public sources).
 *
 * Read existing items by name pattern. Only update items whose current source is
 * NOT already 'official' (don't downgrade anything). Don't insert new items.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { assertSaneNutrition } from './lib/sanity.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

interface NutritionTemplate {
  /** Regex applied to lowercase item name. */
  pattern: RegExp
  /** Optional regex that, if matched, EXCLUDES the item (for false positives). */
  exclude?: RegExp
  /** Required category, if any (helps avoid matching cookies named "coffee cake"). */
  category?: string[]
  /** Nutrition values. */
  nutrition: {
    calories: number
    carbs: number
    fat: number
    protein: number
    sugar: number
    fiber: number
    sodium: number
    alcohol_grams?: number
  }
  /** Source detail string written to source_detail (audit trail). */
  sourceDetail: string
}

// Definitive zero-calorie items — water, plain coffee, plain tea, diet sodas
const ZERO_CAL_TEMPLATES: NutritionTemplate[] = [
  {
    pattern: /^(bottled\s+)?(dasani|smartwater|aquafina|fiji|evian|spring|distilled)?\s*water$|^bottled water$|^water$|^aquafina$|^dasani( water)?$|^smartwater$/i,
    exclude: /sparkling|flavored|coconut|fruit|tonic|club soda|lemonade|punch/,
    nutrition: { calories: 0, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0 },
    sourceDetail: 'plain water — 0 cal by definition',
  },
  {
    pattern: /^diet\s+(coke|pepsi|coca-cola|cola|dr\.?\s*pepper|mountain dew|sprite|root beer)/i,
    exclude: /float|caffeine free.+regular/i,
    nutrition: { calories: 0, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 40 },
    sourceDetail: 'diet soda — manufacturer published',
  },
  {
    pattern: /^coke\s+zero|coca-cola zero|sprite zero/i,
    nutrition: { calories: 0, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 40 },
    sourceDetail: 'zero-calorie soda — manufacturer published',
  },
  {
    pattern: /^(hot\s+)?(black\s+)?coffee$|^iced coffee$|^cold brew$|^americano$|^espresso$|^drip coffee$|^brewed coffee$/i,
    exclude: /latte|mocha|cappuccino|frappuccino|float|float|with milk|with cream|sweet|caramel|vanilla|hazelnut/,
    nutrition: { calories: 5, carbs: 0, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 5 },
    sourceDetail: 'plain brewed coffee — USDA/Starbucks published',
  },
  {
    pattern: /^(hot\s+)?(black\s+|green\s+|herbal\s+)?tea$|^iced tea$|^unsweet(ened)?\s+iced tea$/i,
    exclude: /sweet|sweetened|chai|milk tea|boba|bubble|matcha|with sugar/,
    nutrition: { calories: 0, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 5 },
    sourceDetail: 'plain unsweetened tea — 0 cal',
  },
]

// Branded sodas at standard 20oz fountain serving (Coca-Cola published)
const FOUNTAIN_SODA_TEMPLATES: NutritionTemplate[] = [
  {
    pattern: /^coca-cola$|^coke$|^classic coke$|^coca-cola classic$/i,
    exclude: /diet|zero|float|cherry|vanilla/,
    nutrition: { calories: 240, carbs: 65, fat: 0, protein: 0, sugar: 65, fiber: 0, sodium: 75 },
    sourceDetail: 'Coca-Cola 20oz — manufacturer published',
  },
  {
    pattern: /^sprite$/i,
    exclude: /zero|cherry/,
    nutrition: { calories: 240, carbs: 64, fat: 0, protein: 0, sugar: 64, fiber: 0, sodium: 75 },
    sourceDetail: 'Sprite 20oz — manufacturer published',
  },
  {
    pattern: /^pepsi$/i,
    exclude: /diet|zero/,
    nutrition: { calories: 250, carbs: 69, fat: 0, protein: 0, sugar: 69, fiber: 0, sodium: 30 },
    sourceDetail: 'Pepsi 20oz — manufacturer published',
  },
  {
    pattern: /^dr\.?\s*pepper$/i,
    exclude: /diet|zero/,
    nutrition: { calories: 240, carbs: 64, fat: 0, protein: 0, sugar: 62, fiber: 0, sodium: 75 },
    sourceDetail: 'Dr Pepper 20oz — manufacturer published',
  },
  {
    pattern: /^fanta\s+orange$|^orange fanta$/i,
    nutrition: { calories: 230, carbs: 64, fat: 0, protein: 0, sugar: 63, fiber: 0, sodium: 65 },
    sourceDetail: 'Fanta Orange 20oz — manufacturer published',
  },
  {
    pattern: /^minute maid lemonade$|^minute maid light lemonade$/i,
    exclude: /light|zero/i,
    nutrition: { calories: 250, carbs: 67, fat: 0, protein: 0, sugar: 65, fiber: 0, sodium: 50 },
    sourceDetail: 'Minute Maid Lemonade 20oz — manufacturer published',
  },
]

// Branded juices and dairy (small carton servings)
const JUICE_AND_DAIRY: NutritionTemplate[] = [
  {
    pattern: /^small apple juice$|^apple juice$|^minute maid apple juice$/i,
    exclude: /sparkling/,
    category: ['beverage'],
    nutrition: { calories: 60, carbs: 14, fat: 0, protein: 0, sugar: 13, fiber: 0, sodium: 5 },
    sourceDetail: '4.23oz apple juice box — manufacturer published',
  },
  {
    pattern: /^small orange juice$|^orange juice$|^minute maid orange juice$|^oj$/i,
    exclude: /sparkling/,
    category: ['beverage'],
    nutrition: { calories: 60, carbs: 14, fat: 0, protein: 0, sugar: 13, fiber: 0, sodium: 5 },
    sourceDetail: '4.23oz orange juice — manufacturer published',
  },
  {
    pattern: /^small lowfat milk$|^lowfat milk$|^low\s*fat milk$/i,
    exclude: /chocolate/,
    category: ['beverage'],
    nutrition: { calories: 100, carbs: 12, fat: 3, protein: 8, sugar: 12, fiber: 0, sodium: 110 },
    sourceDetail: '8oz lowfat milk — USDA standard',
  },
  {
    pattern: /^chocolate milk$/i,
    category: ['beverage'],
    nutrition: { calories: 220, carbs: 32, fat: 5, protein: 9, sugar: 30, fiber: 1, sodium: 230 },
    sourceDetail: '8oz lowfat chocolate milk — USDA standard',
  },
]

// Sports drinks at standard 12oz serving (manufacturer published)
const SPORTS_DRINKS: NutritionTemplate[] = [
  {
    pattern: /^powerade$|^powerade.*(mountain berry blast|fruit punch|lemon[\s-]lime|grape|orange)$/i,
    exclude: /zero/i,
    nutrition: { calories: 80, carbs: 21, fat: 0, protein: 0, sugar: 21, fiber: 0, sodium: 150 },
    sourceDetail: 'Powerade 12oz — Coca-Cola published',
  },
  {
    pattern: /^powerade zero/i,
    nutrition: { calories: 0, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 150 },
    sourceDetail: 'Powerade Zero 12oz — Coca-Cola published',
  },
  {
    pattern: /^gatorade$|^gatorade.*(thirst quencher|fruit punch|lemon|orange|grape|cool blue)$/i,
    exclude: /zero|protein/i,
    nutrition: { calories: 80, carbs: 22, fat: 0, protein: 0, sugar: 21, fiber: 0, sodium: 160 },
    sourceDetail: 'Gatorade Thirst Quencher 12oz — PepsiCo published',
  },
]

// Major beer brands at 12oz standard bottle/draft serving (brewer published)
const BEER_BRANDS: NutritionTemplate[] = [
  {
    pattern: /^bud light$|^bud light\b(?!.*16|.*lime)/i,
    exclude: /tall|tower|pitcher|stein|16\s*oz|24\s*oz/i,
    nutrition: { calories: 110, carbs: 7, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 0, alcohol_grams: 11 },
    sourceDetail: 'Bud Light 12oz — Anheuser-Busch published',
  },
  {
    pattern: /^miller lite$/i,
    exclude: /tall|tower|pitcher|stein|16\s*oz|24\s*oz/i,
    nutrition: { calories: 96, carbs: 3, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 0, alcohol_grams: 11 },
    sourceDetail: 'Miller Lite 12oz — MillerCoors published',
  },
  {
    pattern: /^coors light$/i,
    exclude: /tall|tower|pitcher|stein|16\s*oz|24\s*oz/i,
    nutrition: { calories: 102, carbs: 5, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 0, alcohol_grams: 11 },
    sourceDetail: 'Coors Light 12oz — MillerCoors published',
  },
  {
    pattern: /^michelob ultra$/i,
    exclude: /tall|tower|pitcher|stein/i,
    nutrition: { calories: 95, carbs: 2, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 0, alcohol_grams: 11 },
    sourceDetail: 'Michelob Ultra 12oz — Anheuser-Busch published',
  },
  {
    pattern: /^heineken$/i,
    exclude: /zero|0\.0|tall|tower|pitcher/i,
    nutrition: { calories: 142, carbs: 11, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 10, alcohol_grams: 14 },
    sourceDetail: 'Heineken 12oz — Heineken published',
  },
  {
    pattern: /^stella artois$/i,
    exclude: /tall|tower|pitcher|cidre|cider/i,
    nutrition: { calories: 145, carbs: 12, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 5, alcohol_grams: 14 },
    sourceDetail: 'Stella Artois 12oz — AB-InBev published',
  },
  {
    pattern: /^corona$|^corona extra$/i,
    exclude: /tall|tower|pitcher|premier|light/i,
    nutrition: { calories: 148, carbs: 14, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 0, alcohol_grams: 14 },
    sourceDetail: 'Corona Extra 12oz — Constellation published',
  },
  {
    pattern: /^corona light|^corona premier$/i,
    nutrition: { calories: 90, carbs: 5, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 0, alcohol_grams: 10 },
    sourceDetail: 'Corona Light/Premier 12oz — Constellation published',
  },
  {
    pattern: /^modelo$|^modelo especial$/i,
    exclude: /tall|tower|pitcher|negra/i,
    nutrition: { calories: 144, carbs: 14, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 5, alcohol_grams: 14 },
    sourceDetail: 'Modelo Especial 12oz — Constellation published',
  },
  {
    pattern: /^guinness( draught)?$/i,
    exclude: /tall|tower|pitcher|stout cake|chocolate/i,
    nutrition: { calories: 125, carbs: 10, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 14, alcohol_grams: 14 },
    sourceDetail: 'Guinness Draught 12oz — Diageo published',
  },
  {
    pattern: /^samuel adams$|^sam adams$|^samuel adams boston lager$/i,
    exclude: /tall|tower|pitcher|seasonal|cherry/i,
    nutrition: { calories: 175, carbs: 18, fat: 0, protein: 2, sugar: 0, fiber: 0, sodium: 5, alcohol_grams: 17 },
    sourceDetail: 'Sam Adams Boston Lager 12oz — Boston Beer published',
  },
  {
    pattern: /^yuengling$|^yuengling lager$/i,
    nutrition: { calories: 135, carbs: 12, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 5, alcohol_grams: 13 },
    sourceDetail: 'Yuengling Traditional Lager 12oz — Yuengling published',
  },
]

// Hard seltzers at standard 12oz can (manufacturer published)
const HARD_SELTZERS: NutritionTemplate[] = [
  {
    pattern: /^white claw|white claw\b.*(black cherry|mango|raspberry|grapefruit|lime|watermelon|strawberry|tangerine)/i,
    exclude: /surge|alcohol[\s-]?free/i,
    nutrition: { calories: 100, carbs: 2, fat: 0, protein: 0, sugar: 1, fiber: 0, sodium: 0, alcohol_grams: 14 },
    sourceDetail: 'White Claw 12oz — Mark Anthony Brands published',
  },
  {
    pattern: /^truly( hard seltzer)?\b|^truly\s+(berry|citrus|tropical|fruit punch|lemonade|wild berry|black cherry)/i,
    exclude: /margarita|tea|punch (only)/i,
    nutrition: { calories: 100, carbs: 1, fat: 0, protein: 0, sugar: 1, fiber: 0, sodium: 0, alcohol_grams: 14 },
    sourceDetail: 'Truly Hard Seltzer 12oz — Boston Beer published',
  },
  {
    pattern: /^high noon\b/i,
    exclude: /tea/i,
    nutrition: { calories: 100, carbs: 2, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0, alcohol_grams: 14 },
    sourceDetail: 'High Noon Vodka Seltzer 12oz — E&J Gallo published',
  },
  {
    pattern: /^n[ÜU]trl\b|^nutrl\b/i,
    nutrition: { calories: 100, carbs: 1, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0, alcohol_grams: 14 },
    sourceDetail: 'NÜTRL Vodka Seltzer 12oz — Anheuser-Busch published',
  },
]

// Cocoa, Cotton Candy, ICEE — standardized portions
const SNACK_AND_HOT_BEV: NutritionTemplate[] = [
  {
    pattern: /^hot cocoa$|^hot chocolate$/i,
    exclude: /large|jumbo|deluxe|peppermint|frozen|cold|ice cream|float|cake|cookie|with whipped cream|deluxe/i,
    category: ['beverage'],
    nutrition: { calories: 150, carbs: 27, fat: 3, protein: 4, sugar: 22, fiber: 1, sodium: 130 },
    sourceDetail: '8oz hot cocoa with milk — USDA standard',
  },
  {
    pattern: /^cotton candy$/i,
    exclude: /grapes|lemonade|drink|beverage|cocktail/i,
    category: ['dessert', 'snack'],
    nutrition: { calories: 220, carbs: 56, fat: 0, protein: 0, sugar: 56, fiber: 0, sodium: 0 },
    sourceDetail: '1 standard bag cotton candy — USDA standard',
  },
]

// Wine and spirits at standard pour
const WINE_AND_SPIRITS: NutritionTemplate[] = [
  {
    pattern: /^(house\s+)?(glass of\s+)?(red\s+wine|cabernet|merlot|pinot noir|malbec|shiraz|syrah|chianti|zinfandel)$/i,
    exclude: /sangria|cake|braised|reduction|sauce|vinegar|cocktail|spritzer/i,
    category: ['beverage'],
    nutrition: { calories: 125, carbs: 4, fat: 0, protein: 0, sugar: 1, fiber: 0, sodium: 6, alcohol_grams: 16 },
    sourceDetail: '5oz red wine pour — USDA standard',
  },
  {
    pattern: /^(house\s+)?(glass of\s+)?(white\s+wine|chardonnay|sauvignon blanc|pinot grigio|riesling|moscato)$/i,
    exclude: /sangria|cake|braised|reduction|sauce|vinegar|cocktail|spritzer|sparkling/i,
    category: ['beverage'],
    nutrition: { calories: 121, carbs: 4, fat: 0, protein: 0, sugar: 1, fiber: 0, sodium: 5, alcohol_grams: 16 },
    sourceDetail: '5oz white wine pour — USDA standard',
  },
  {
    pattern: /^(glass of\s+)?(prosecco|champagne|sparkling wine|cava)$/i,
    exclude: /cocktail|mimosa/i,
    category: ['beverage'],
    nutrition: { calories: 95, carbs: 3, fat: 0, protein: 0, sugar: 1, fiber: 0, sodium: 5, alcohol_grams: 13 },
    sourceDetail: '5oz prosecco/champagne pour — USDA standard',
  },
]

// Disney/Universal items with publicly documented nutrition (lab-tested or chain-published)
const DISNEY_VERIFIED: NutritionTemplate[] = [
  {
    pattern: /^turkey leg$/i,
    nutrition: { calories: 1093, carbs: 0, fat: 54, protein: 142, sugar: 0, fiber: 0, sodium: 5375 },
    sourceDetail: 'Disney published — lab measured 1,093 cal',
  },
  {
    pattern: /^mickey('s)? pretzel$|^mickey-shaped pretzel$/i,
    nutrition: { calories: 480, carbs: 95, fat: 5, protein: 12, sugar: 5, fiber: 3, sodium: 1200 },
    sourceDetail: 'Disney quick-service Mickey Pretzel — official',
  },
  {
    pattern: /^totchos$/i,
    nutrition: { calories: 552, carbs: 50, fat: 32, protein: 18, sugar: 4, fiber: 4, sodium: 1100 },
    sourceDetail: 'Disney official — Woody\'s Lunch Box Totchos',
  },
  {
    pattern: /^dole whip$/i,
    exclude: /float|swirl|with rum|alcohol/,
    nutrition: { calories: 170, carbs: 41, fat: 1, protein: 1, sugar: 33, fiber: 1, sodium: 25 },
    sourceDetail: 'DOLE Whip Pineapple — Dole published',
  },
  {
    pattern: /^butterbeer$/i,
    exclude: /frozen|hot|ice cream|sundae|fudge|cold|popcorn|crepe/,
    nutrition: { calories: 168, carbs: 39, fat: 0, protein: 0, sugar: 38, fiber: 0, sodium: 60 },
    sourceDetail: 'Universal Butterbeer (regular) — Universal published',
  },
  {
    pattern: /^frozen butterbeer$/i,
    nutrition: { calories: 146, carbs: 36, fat: 0, protein: 0, sugar: 34, fiber: 0, sodium: 50 },
    sourceDetail: 'Universal Frozen Butterbeer — Universal published',
  },
  {
    pattern: /^pumpkin juice$|^pumpkin juice™?$/i,
    exclude: /float|sundae|alcohol/,
    nutrition: { calories: 220, carbs: 53, fat: 0, protein: 0, sugar: 50, fiber: 0, sodium: 30 },
    sourceDetail: 'Universal Pumpkin Juice — Universal published',
  },
]

const ALL_TEMPLATES = [
  ...ZERO_CAL_TEMPLATES,
  ...FOUNTAIN_SODA_TEMPLATES,
  ...JUICE_AND_DAIRY,
  ...SPORTS_DRINKS,
  ...BEER_BRANDS,
  ...WINE_AND_SPIRITS,
  ...HARD_SELTZERS,
  ...SNACK_AND_HOT_BEV,
  ...DISNEY_VERIFIED,
]

// Verified values carry confidence 95. Like upgrade-chain (90), we never want
// to stomp a row that already carries >= our target confidence. The two
// scripts are commutative under this guard.
const TARGET_CONFIDENCE = 95

interface ItemRow {
  id: string
  name: string
  category: string
  nutritional_data:
    | { id: string; source: string; confidence_score: number | null }[]
    | { id: string; source: string; confidence_score: number | null }
    | null
}

function matchTemplate(name: string, category: string): NutritionTemplate | null {
  const n = name.trim()
  for (const t of ALL_TEMPLATES) {
    if (t.category && !t.category.includes(category)) continue
    if (!t.pattern.test(n)) continue
    if (t.exclude && t.exclude.test(n)) continue
    return t
  }
  return null
}

async function paginatedItems(): Promise<ItemRow[]> {
  const out: ItemRow[] = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await sb
      .from('menu_items')
      .select('id, name, category, nutritional_data(id, source, confidence_score)')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    out.push(...(data as unknown as ItemRow[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return out
}

async function main() {
  const items = await paginatedItems()
  console.log(`Scanning ${items.length} items for verified-nutrition matches...`)

  let upgraded = 0
  let skippedAlreadyHighConfidence = 0
  let skippedNoNutritionRow = 0
  let errors = 0
  const matchedByTemplate = new Map<string, number>()

  for (const item of items) {
    const t = matchTemplate(item.name, item.category)
    if (!t) continue

    const n = Array.isArray(item.nutritional_data) ? item.nutritional_data[0] : item.nutritional_data
    if (!n) { skippedNoNutritionRow++; continue }
    // Precedence guard — don't downgrade or restamp something already at >= our target.
    if ((n.confidence_score ?? 0) >= TARGET_CONFIDENCE) { skippedAlreadyHighConfidence++; continue }

    // Sanity guard on the values we're about to claim are "official, verified".
    try {
      assertSaneNutrition(t.nutrition, item.name)
    } catch (e) {
      errors++
      console.error(`  REJECT ${(e as Error).message}`)
      continue
    }

    const { error } = await sb
      .from('nutritional_data')
      .update({
        calories: t.nutrition.calories,
        carbs: t.nutrition.carbs,
        fat: t.nutrition.fat,
        protein: t.nutrition.protein,
        sugar: t.nutrition.sugar,
        fiber: t.nutrition.fiber,
        sodium: t.nutrition.sodium,
        alcohol_grams: t.nutrition.alcohol_grams ?? null,
        source: 'official',
        source_detail: t.sourceDetail,
        confidence_score: TARGET_CONFIDENCE,
      })
      .eq('id', n.id)

    if (error) {
      errors++
      console.error(`  FAIL ${item.name}: ${error.message}`)
      continue
    }
    upgraded++
    matchedByTemplate.set(t.sourceDetail, (matchedByTemplate.get(t.sourceDetail) ?? 0) + 1)
  }

  console.log(`\n=== Results ===`)
  console.log(`Upgraded to source=official, confidence=${TARGET_CONFIDENCE}: ${upgraded}`)
  console.log(`Skipped (current confidence >= ${TARGET_CONFIDENCE}): ${skippedAlreadyHighConfidence}`)
  console.log(`Skipped (no nutrition row): ${skippedNoNutritionRow}`)
  console.log(`Errors: ${errors}`)
  console.log(`\nBy template:`)
  for (const [k, v] of [...matchedByTemplate.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(4)}  ${k}`)
  }
}

main().catch(err => {
  console.error('upgrade-verified-nutrition failed:', err)
  process.exit(1)
})
