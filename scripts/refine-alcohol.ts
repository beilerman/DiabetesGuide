/**
 * Refine alcohol estimates using:
 *   1. Known beer brand ABV lookup (50+ brands)
 *   2. Known cocktail recipe shot counts (40+ recipes)
 *   3. Wine varietal ABV lookup
 *   4. Description parsing to count spirits mentioned
 *   5. Serving size detection from item names (16oz, pint, etc.)
 *
 * Formula: alcohol_grams = volume_ml × (ABV/100) × 0.789
 *   - 0.789 g/ml = density of ethanol
 *   - 1 standard US drink = 14g ethanol
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/refine-alcohol.ts [--dry-run]
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.argv.includes('--dry-run')

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

const ML_PER_OZ = 29.5735
const ETHANOL_DENSITY = 0.789 // g/ml

function alcoholGramsFromABV(volumeOz: number, abv: number): number {
  return Math.round(volumeOz * ML_PER_OZ * (abv / 100) * ETHANOL_DENSITY)
}

function alcoholGramsFromShots(shots: number): number {
  // 1 shot = 1.5oz of 40% ABV spirit = 14g
  return Math.round(shots * 14)
}

// ============================================================================
// BEER ABV LOOKUP — sorted longest-first for matching priority
// ============================================================================

const BEER_ABV: [RegExp, number, number?][] = [
  // [pattern, ABV, optional serving oz override]
  // --- Light beers (4.0-4.3%) ---
  [/bud light/i, 4.2],
  [/coors light/i, 4.2],
  [/miller lite/i, 4.17],
  [/mich(elob)? ultra/i, 4.2],
  [/natural light|natty light/i, 4.2],
  [/keystone light/i, 4.1],
  [/busch light/i, 4.1],
  [/amstel light/i, 3.5],
  [/corona premier/i, 4.0],

  // --- Standard domestics (4.4-5.5%) ---
  [/budweiser/i, 5.0],
  [/corona extra/i, 4.6],
  [/corona(?! premier)/i, 4.6],
  [/modelo negra/i, 5.4],
  [/modelo especial/i, 4.4],
  [/modelo/i, 4.4],
  [/heineken 0\.0|heineken zero/i, 0],
  [/heineken/i, 5.0],
  [/stella artois/i, 5.2],
  [/yuengling/i, 5.3],
  [/dos equis/i, 4.7],
  [/pacifico/i, 4.4],
  [/tecate/i, 4.5],
  [/pabst|pbr/i, 4.8],
  [/foster'?s/i, 5.0],
  [/guinness/i, 4.2],
  [/bass ale/i, 5.1],
  [/newcastle/i, 4.7],
  [/sapporo/i, 4.9],
  [/kirin/i, 4.9],
  [/asahi/i, 5.0],
  [/tsing ?tao/i, 4.7],
  [/peroni/i, 5.1],
  [/leffe blonde/i, 6.6],
  [/leffe/i, 6.6],
  [/hoegaarden/i, 4.9],

  // --- Craft / specialty (5.0-7.5%) ---
  [/kona longboard/i, 4.6],
  [/kona big wave/i, 4.4],
  [/kona/i, 4.6],
  [/blue moon/i, 5.4],
  [/sam adams boston/i, 4.9],
  [/samuel adams|sam adams/i, 4.9],
  [/sierra nevada pale/i, 5.6],
  [/sierra nevada torpedo/i, 7.2],
  [/sierra nevada celebration/i, 6.8],
  [/sierra nevada/i, 5.6],
  [/lagunitas daytime/i, 4.6],
  [/lagunitas ipa/i, 6.2],
  [/lagunitas/i, 6.2],
  [/goose island ipa/i, 5.9],
  [/goose island 312/i, 4.2],
  [/goose island/i, 5.9],
  [/dogfish head 90/i, 9.0],
  [/dogfish head 60/i, 6.0],
  [/dogfish head/i, 6.0],
  [/cigar city jai alai/i, 7.5],
  [/cigar city/i, 5.5],
  [/angry orchard/i, 5.0],
  [/ace cider/i, 5.0],
  [/bold rock/i, 4.7],
  [/magners/i, 4.5],
  [/woodchuck/i, 5.0],
  [/stone ipa/i, 6.9],
  [/stone/i, 5.5],
  [/fat tire/i, 5.2],
  [/new belgium/i, 5.2],
  [/bells two hearted/i, 7.0],
  [/founders all day/i, 4.7],
  [/ballast point sculpin/i, 7.0],
  [/sweetwater/i, 5.3],
  [/terrapin/i, 5.3],
  [/funky buddha/i, 5.7],
  [/elysian space dust/i, 8.2],
  [/firestone walker/i, 5.5],
  [/oskar blues dale'?s/i, 6.5],
  [/voodoo ranger/i, 7.0],
  [/hazy ipa/i, 6.5],
  [/allagash white/i, 5.2],
  [/wicked weed/i, 5.5],
  [/pseudo sue/i, 5.8],
  [/big wave/i, 4.4],
  [/landshark/i, 4.6],

  // --- Disney/Universal-specific ---
  [/safari amber/i, 5.0],
  [/kungaloosh/i, 5.0],
  [/volcano blossom/i, 5.0],
  [/duff beer/i, 4.8],
  [/simpsons/i, 4.8],

  // --- Belgian / strong (7-12%) ---
  [/victory golden monkey/i, 9.5],
  [/chimay/i, 7.0],
  [/duvel/i, 8.5],
  [/delirium tremens/i, 8.5],
  [/la fin du monde/i, 9.0],
  [/unibroue/i, 5.0],
  [/tripel/i, 8.0],
  [/dubbel/i, 7.0],
  [/barleywine/i, 10.0],
  [/imperial stout/i, 9.0],
  [/imperial ipa/i, 8.5],
  [/double ipa|dipa/i, 8.0],

  // --- Hard seltzer / cider ---
  [/white claw/i, 5.0],
  [/truly/i, 5.0],
  [/high noon/i, 4.5],
  [/vizzy/i, 5.0],
  [/hard seltzer/i, 5.0],
  [/hard cider/i, 5.0],

  // --- Category fallbacks ---
  [/\bipa\b|india pale ale/i, 6.5],
  [/pale ale/i, 5.5],
  [/\bstout\b/i, 5.5],
  [/\bporter\b/i, 5.5],
  [/\blager\b/i, 5.0],
  [/\bpilsner\b/i, 5.0],
  [/hefeweizen|wheat beer/i, 5.0],
  [/amber ale/i, 5.3],
  [/\bale\b/i, 5.0],
  [/\bbeer\b/i, 5.0],
  [/oktoberfest|marzen|märzen/i, 5.5],
]

// ============================================================================
// COCKTAIL SHOT EQUIVALENTS — how many 1.5oz/40% shots worth of alcohol
// ============================================================================

const COCKTAIL_SHOTS: [RegExp, number][] = [
  // --- Spirit-forward (2+ shots) ---
  [/long island/i, 3.5],
  [/texas tea/i, 3.5],        // Long Island variant
  [/dockside iced tea/i, 3.0], // Long Island variant
  [/zombie/i, 3.0],
  [/jungle juice/i, 2.5],
  [/fish bowl/i, 3.0],
  [/scorpion bowl/i, 3.0],
  [/martini/i, 2.0],
  [/manhattan/i, 2.0],
  [/old fashioned/i, 2.0],
  [/negroni/i, 2.0],
  [/sazerac/i, 2.0],
  [/mai tai/i, 2.0],
  [/hurricane/i, 2.0],
  [/painkiller/i, 2.0],

  // --- Standard cocktails (1.5 shots) ---
  [/margarita/i, 1.5],
  [/mojito/i, 1.5],
  [/moscow mule|mule/i, 1.5],
  [/paloma/i, 1.5],
  [/cosmopolitan|cosmo\b/i, 1.5],
  [/daiquiri/i, 1.5],
  [/caipirinha/i, 1.5],
  [/pi[nñ]a colada|colada/i, 1.5],
  [/rum punch|punch.*rum/i, 1.5],
  [/whiskey sour|bourbon sour/i, 1.5],
  [/gin and tonic|gin & tonic|g&t\b/i, 1.5],
  [/vodka tonic|vodka soda/i, 1.5],
  [/rum and coke|cuba libre/i, 1.5],
  [/tom collins/i, 1.5],
  [/gimlet/i, 1.5],
  [/sidecar/i, 1.5],
  [/dark 'n' stormy|dark and stormy/i, 1.5],
  [/julep/i, 1.5],
  [/highball/i, 1.5],
  [/tequila sunrise/i, 1.5],

  // --- Disney-specific ---
  [/fuzzy tauntaun/i, 1.5],  // Cîroc Peach + Bols Schnapps
  [/jedi mind trick/i, 1.5], // Ketel One + Falernum + Blue Curaçao
  [/t-?16 skyhopper/i, 1.5],
  [/dagobah slug/i, 1.5],    // Rum-based
  [/bespin fizz/i, 1.5],     // Rum + yuzu
  [/jet juice/i, 1.5],       // Melon liqueur
  [/outer rim/i, 1.5],       // Tequila + açaí liqueur
  [/tipsy ducks in love/i, 1.5], // Coffee liqueur + espresso
  [/grog/i, 1.5],
  [/skipper sipper/i, 1.5],

  // --- Lighter drinks (0.5-1.0 shots) ---
  [/aperol spritz|spritz/i, 0.8], // Aperol 11% + prosecco
  [/hugo spritz/i, 0.5],
  [/bellini/i, 0.8],   // Prosecco + peach puree
  [/mimosa/i, 0.6],    // Half champagne, half OJ
  [/kir royale/i, 0.9],
  [/shandy/i, 0.5],    // Beer + lemonade

  // --- Shots / neat ---
  [/\bshot\b|neat|on the rocks|straight/i, 1.0],
]

// ============================================================================
// WINE / SAKE / LIQUEUR ABV
// ============================================================================

const WINE_ABV: [RegExp, number][] = [
  // Reds (13-15%)
  [/cabernet sauvignon|cabernet/i, 14.0],
  [/merlot/i, 14.5],
  [/pinot noir/i, 13.5],
  [/shiraz|syrah/i, 14.0],
  [/malbec/i, 13.5],
  [/zinfandel/i, 14.5],
  [/tempranillo|rioja/i, 13.5],
  [/chianti|sangiovese/i, 13.0],
  [/red blend/i, 13.5],

  // Whites (10.5-14%)
  [/chardonnay/i, 13.5],
  [/sauvignon blanc/i, 12.5],
  [/pinot grigio|pinot gris/i, 12.0],
  [/riesling/i, 11.0],
  [/moscato/i, 5.5],
  [/gewurztraminer|gewürztraminer/i, 13.0],
  [/viognier/i, 14.0],
  [/white blend/i, 12.5],

  // Sparkling (11-12.5%)
  [/champagne/i, 12.5],
  [/prosecco/i, 11.0],
  [/cava/i, 11.5],
  [/sparkling wine|sparkling/i, 12.0],

  // Rosé
  [/rosé|rose wine/i, 12.0],

  // Sake (15-20%)
  [/daiginjo/i, 16.0],
  [/junmai/i, 15.5],
  [/nigori/i, 15.0],
  [/\bsake\b/i, 15.5],

  // Other
  [/mead/i, 12.5],
  [/sangria/i, 9.0],
  [/port\b/i, 20.0],
  [/sherry/i, 17.0],
  [/vermouth/i, 16.0],

  // Fallbacks
  [/red wine/i, 13.5],
  [/white wine/i, 12.5],
  [/\bwine\b/i, 13.0],
]

// Liqueur ABV for coffee-based drinks
const LIQUEUR_ABV: [RegExp, number][] = [
  [/baileys|bailey'?s/i, 17.0],
  [/irish cream/i, 17.0],
  [/kahlua|kahlúa/i, 20.0],
  [/amarula/i, 17.0],
  [/frangelico/i, 20.0],
  [/cointreau/i, 40.0],
  [/grand marnier/i, 40.0],
  [/chambord/i, 16.5],
  [/midori/i, 20.0],
  [/disaronno|amaretto/i, 28.0],
  [/campari/i, 25.0],
  [/aperol/i, 11.0],
  [/blue cura[cç]ao/i, 25.0],
  [/triple sec/i, 23.0],
  [/schnapps/i, 20.0],
  [/falernum/i, 11.0],
  [/st[.-]? ?germain|elderflower liqueur/i, 20.0],
]

// ============================================================================
// SPIRIT DETECTION in descriptions
// ============================================================================

const SPIRIT_PATTERNS: [RegExp, number][] = [
  // Full-strength spirits (40% ABV = 1 shot per mention)
  [/\bvodka\b/gi, 1.0],
  [/\btequila\b/gi, 1.0],
  [/\bmezcal\b/gi, 1.0],
  [/\b(?:dark |light |white |spiced |aged |coconut )?rum\b/gi, 1.0],
  [/\bgin\b/gi, 1.0],
  [/\bbourbon\b/gi, 1.0],
  [/\bwhiskey\b|\bwhisky\b|\brye\b/gi, 1.0],
  [/\bscotch\b/gi, 1.0],
  [/\bcognac\b|\bbrandy\b/gi, 1.0],
  [/\babsinthe\b/gi, 1.0],
  [/\bcachaça\b/gi, 1.0],
]

const LIQUEUR_SPIRIT_PATTERNS: [RegExp, number][] = [
  // Lower-ABV liqueurs (15-30% ABV = ~0.5 shot equivalent per mention)
  [/liqueur/gi, 0.5],
  [/schnapps/gi, 0.5],
  [/curaçao|curacao/gi, 0.5],
  [/triple sec/gi, 0.5],
  [/amaretto/gi, 0.5],
  [/falernum/gi, 0.3],
  [/campari/gi, 0.5],
  [/aperol/gi, 0.3],
]

/**
 * Parse a cocktail description to count spirit mentions.
 * Returns estimated shot equivalents.
 */
function countSpiritsInDescription(description: string): number | null {
  if (!description) return null

  let spiritCount = 0
  let liqueurCount = 0
  let foundAny = false

  // Count full-strength spirit mentions
  for (const [pattern] of SPIRIT_PATTERNS) {
    const matches = description.match(pattern)
    if (matches) {
      spiritCount += matches.length
      foundAny = true
    }
  }

  // Count liqueur mentions
  for (const [pattern] of LIQUEUR_SPIRIT_PATTERNS) {
    const matches = description.match(pattern)
    if (matches) {
      liqueurCount += matches.length
      foundAny = true
    }
  }

  if (!foundAny) return null

  // For multi-spirit cocktails (Long Island, etc.), each spirit is typically
  // 0.5-0.75oz, not a full 1.5oz shot. Scale down per-spirit contribution.
  let totalShots: number
  if (spiritCount === 0) {
    totalShots = 0 // no full-strength spirits, only liqueurs
  } else if (spiritCount === 1) {
    totalShots = 1.0 // single spirit = 1 standard shot
  } else if (spiritCount === 2) {
    totalShots = 1.5 // two spirits (e.g., rum + brandy)
  } else if (spiritCount === 3) {
    totalShots = 2.0 // three spirits
  } else {
    totalShots = 2.5 // 4+ spirits (Long Island territory)
  }

  // Add liqueur contribution (each ~0.3 shots)
  totalShots += liqueurCount * 0.3

  return totalShots
}

// ============================================================================
// SERVING SIZE DETECTION
// ============================================================================

function detectBeerServingOz(name: string, description: string | null): number {
  const both = `${name} ${description || ''}`

  // Explicit size in name: "Beer (16 oz)", "Craft Beer (16 oz)"
  const ozMatch = both.match(/\(?\b(\d{1,2})\s*(?:oz|ounce)s?\b\)?/i)
  if (ozMatch) {
    const oz = parseInt(ozMatch[1])
    if (oz >= 4 && oz <= 32) return oz
  }

  if (/\bpint\b/i.test(both)) return 16
  if (/half yard/i.test(both)) return 18
  if (/\byard\b/i.test(both)) return 36
  if (/growler/i.test(both)) return 64
  if (/flight/i.test(both)) return 16 // 4×4oz samples ≈ one pint

  return 12 // default draft/bottle
}

function detectWineServingOz(name: string, description: string | null): number {
  const both = `${name} ${description || ''}`

  const ozMatch = both.match(/\(?\b(\d{1,2})\s*(?:oz|ounce)s?\b\)?/i)
  if (ozMatch) {
    const oz = parseInt(ozMatch[1])
    if (oz >= 2 && oz <= 12) return oz
  }

  // Wine flights: typically 3-4 pours × 2oz = 6-8oz total
  if (/flight/i.test(both)) return 8

  return 5 // standard wine pour
}

function detectSakeServingOz(name: string, description: string | null): number {
  const both = `${name} ${description || ''}`

  const ozMatch = both.match(/\(?\b(\d{1,2})\s*(?:oz|ounce)s?\b\)?/i)
  if (ozMatch) {
    const oz = parseInt(ozMatch[1])
    if (oz >= 2 && oz <= 12) return oz
  }

  if (/flight/i.test(both)) return 8
  if (/carafe|bottle/i.test(both)) return 12

  return 5 // standard sake pour
}

// ============================================================================
// MAIN CLASSIFICATION
// ============================================================================

type MatchMethod =
  | 'beer_brand_abv'
  | 'cocktail_recipe'
  | 'cocktail_description_parse'
  | 'wine_varietal_abv'
  | 'liqueur_coffee'
  | 'no_change'

interface RefinedEstimate {
  nd_id: string
  name: string
  oldGrams: number
  newGrams: number
  method: MatchMethod
  detail: string
}

function refineAlcoholEstimate(
  name: string,
  description: string | null,
  currentGrams: number,
): { grams: number; method: MatchMethod; detail: string } {
  const n = name.toLowerCase()
  const d = (description || '').toLowerCase()
  const both = `${n} ${d}`

  // ---- Skip false positives: food items with beer/wine keywords ----
  if (/soup|dip|fondue|sauce|glaze|batter|braised|braise|brined|rubbed|crusted/i.test(n)) {
    return { grams: 0, method: 'no_change', detail: 'Food item, not a drink' }
  }

  // ==== PRIORITY 1: COCKTAIL RECIPE LOOKUP ====
  // Must come BEFORE wine/beer to catch Manhattan, Negroni, Spritz, Old Fashioned, etc.
  for (const [pattern, shots] of COCKTAIL_SHOTS) {
    if (pattern.test(n)) {
      // Description parse can refine slightly but never exceed 1.5× the recipe
      const descShots = countSpiritsInDescription(description || '')
      const maxFromDesc = shots * 1.5
      const finalShots = descShots != null && descShots > shots && descShots <= maxFromDesc
        ? descShots
        : shots
      const grams = alcoholGramsFromShots(finalShots)
      return {
        grams,
        method: 'cocktail_recipe',
        detail: `Recipe: ${pattern.source} → ${finalShots} shots${descShots != null ? ` (desc: ${descShots.toFixed(1)})` : ''}`,
      }
    }
  }

  // ==== PRIORITY 2: LIQUEUR COFFEE ====
  // Irish Coffee = 1 shot whiskey + Baileys cream
  // African Coffee = 1oz Amarula
  // Other coffee drinks = 1oz liqueur
  if (/irish coffee/i.test(both)) {
    // Irish Coffee: 1.5oz Irish whiskey (40%) + optional cream
    const grams = alcoholGramsFromShots(1.0)
    return { grams, method: 'liqueur_coffee', detail: 'Irish Coffee: 1 shot whiskey (40% ABV)' }
  }
  if (/coffee.*liqueur|liqueur.*coffee|bailey.*coffee|kahlua.*coffee|amarula.*coffee|african coffee|cream liqueur.*coffee|coffee.*cream liqueur/i.test(both)) {
    // 1.5oz pour of liqueur
    let liqueurAbv = 17.0
    for (const [pattern, abv] of LIQUEUR_ABV) {
      if (pattern.test(both)) {
        liqueurAbv = abv
        break
      }
    }
    const grams = alcoholGramsFromABV(1.5, liqueurAbv)
    return {
      grams,
      method: 'liqueur_coffee',
      detail: `Liqueur coffee: 1.5oz × ${liqueurAbv}% ABV`,
    }
  }

  // ==== PRIORITY 3: BEER BRAND ABV ====
  // Strip non-beer terms to avoid false positives
  const beerSafe = both
    .replace(/ginger ale/gi, '')
    .replace(/root beer/gi, '')
    .replace(/birch beer/gi, '')

  for (const [pattern, abv] of BEER_ABV) {
    if (pattern.test(beerSafe)) {
      const servingOz = detectBeerServingOz(name, description)
      const grams = alcoholGramsFromABV(servingOz, abv)
      if (abv === 0) return { grams: 0, method: 'beer_brand_abv', detail: `Non-alcoholic: ${pattern.source}` }
      return {
        grams,
        method: 'beer_brand_abv',
        detail: `${pattern.source} → ${abv}% ABV × ${servingOz}oz`,
      }
    }
  }

  // ==== PRIORITY 4: DESCRIPTION PARSE (cocktails not in recipe list) ====
  // This catches unnamed cocktails where descriptions list specific spirits
  const descShots = countSpiritsInDescription(description || '')
  if (descShots != null && descShots > 0) {
    const grams = alcoholGramsFromShots(descShots)
    return {
      grams,
      method: 'cocktail_description_parse',
      detail: `Description spirits: ${descShots.toFixed(1)} shots from "${(description || '').slice(0, 60)}..."`,
    }
  }

  // ==== PRIORITY 5: WINE/SAKE VARIETAL ABV ====
  // Last because many cocktails mention wine/vermouth in description
  // Only match on NAME primarily, or description if name suggests wine
  const isLikelyWine = /\bwine\b|cabernet|merlot|chardonnay|pinot|riesling|moscato|rosé|zinfandel|shiraz|malbec|prosecco|champagne|cava|sangria|\bsake\b|nigori|junmai|mead|port\b|sherry/i.test(n)
  const nameMatchesWine = isLikelyWine || /\bwine\b/i.test(n)

  if (nameMatchesWine || /\bwine\b|sangria|\bsake\b|mead/i.test(n)) {
    for (const [pattern, abv] of WINE_ABV) {
      // For wine, match primarily against name, or against description
      // only if the name already suggests wine/sake
      if (pattern.test(n) || (nameMatchesWine && pattern.test(d))) {
        const isSake = /sake|nigori|junmai|daiginjo/i.test(both)
        const servingOz = isSake
          ? detectSakeServingOz(name, description)
          : detectWineServingOz(name, description)
        const grams = alcoholGramsFromABV(servingOz, abv)
        return {
          grams,
          method: 'wine_varietal_abv',
          detail: `${pattern.source} → ${abv}% ABV × ${servingOz}oz`,
        }
      }
    }
  }

  // Also check for standalone wine/sake/champagne in name even without specific varietal
  for (const [pattern, abv] of WINE_ABV) {
    if (pattern.test(n)) {
      const isSake = /sake|nigori|junmai|daiginjo/i.test(both)
      const servingOz = isSake
        ? detectSakeServingOz(name, description)
        : detectWineServingOz(name, description)
      const grams = alcoholGramsFromABV(servingOz, abv)
      return {
        grams,
        method: 'wine_varietal_abv',
        detail: `${pattern.source} → ${abv}% ABV × ${servingOz}oz`,
      }
    }
  }

  // ==== FALLBACK: No better data available ====
  return { grams: currentGrams, method: 'no_change', detail: 'No specific match found' }
}

// ============================================================================
// FETCH & UPDATE
// ============================================================================

interface BeverageRow {
  nd_id: string
  mi_id: string
  name: string
  description: string | null
  calories: number | null
  carbs: number | null
  fat: number | null
  protein: number | null
  alcohol_grams: number
}

async function fetchAlcoholicBeverages(): Promise<BeverageRow[]> {
  const all: BeverageRow[] = []
  const PAGE = 500
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('menu_items')
      .select(`
        id,
        name,
        description,
        category,
        nutritional_data (
          id,
          calories,
          carbs,
          fat,
          protein,
          alcohol_grams
        )
      `)
      .eq('category', 'beverage')
      .range(offset, offset + PAGE - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    for (const row of data) {
      const nd = Array.isArray(row.nutritional_data)
        ? row.nutritional_data[0]
        : row.nutritional_data
      if (!nd || nd.alcohol_grams == null || nd.alcohol_grams <= 0) continue

      all.push({
        nd_id: nd.id,
        mi_id: row.id,
        name: row.name,
        description: row.description,
        calories: nd.calories,
        carbs: nd.carbs,
        fat: nd.fat,
        protein: nd.protein,
        alcohol_grams: nd.alcohol_grams,
      })
    }

    if (data.length < PAGE) break
    offset += PAGE
  }

  return all
}

async function main() {
  console.log(`\n🔬 Alcohol Refinement Script`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  console.log('─'.repeat(70))

  const beverages = await fetchAlcoholicBeverages()
  console.log(`\nFetched ${beverages.length} alcoholic beverages to refine`)

  const refined: RefinedEstimate[] = []
  const unchanged: string[] = []
  const methodCounts: Record<string, number> = {}

  for (const bev of beverages) {
    const result = refineAlcoholEstimate(bev.name, bev.description, bev.alcohol_grams)

    methodCounts[result.method] = (methodCounts[result.method] || 0) + 1

    if (result.method === 'no_change') {
      unchanged.push(bev.name)
      continue
    }

    // Only record if there's an actual change
    if (result.grams !== bev.alcohol_grams) {
      refined.push({
        nd_id: bev.nd_id,
        name: bev.name,
        oldGrams: bev.alcohol_grams,
        newGrams: result.grams,
        method: result.method,
        detail: result.detail,
      })
    } else {
      unchanged.push(bev.name)
    }
  }

  // Summary
  console.log(`\n📊 Method breakdown:`)
  for (const [method, count] of Object.entries(methodCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${method.padEnd(30)} ${String(count).padStart(4)}`)
  }

  console.log(`\n📝 Changes (${refined.length} items):`)
  // Group by method
  const byMethod = new Map<string, RefinedEstimate[]>()
  for (const r of refined) {
    const list = byMethod.get(r.method) || []
    list.push(r)
    byMethod.set(r.method, list)
  }

  for (const [method, items] of byMethod) {
    console.log(`\n  ── ${method} (${items.length}) ──`)
    for (const r of items.slice(0, 25)) {
      const delta = r.newGrams - r.oldGrams
      const sign = delta > 0 ? '+' : ''
      const drinks = (r.newGrams / 14).toFixed(1)
      console.log(
        `    ${r.oldGrams.toString().padStart(3)}g → ${r.newGrams.toString().padStart(3)}g (${sign}${delta}g, ${drinks} drinks)  ${r.name}`,
      )
      console.log(`      ${r.detail}`)
    }
    if (items.length > 25) console.log(`    ... and ${items.length - 25} more`)
  }

  console.log(`\n⏭️  Unchanged: ${unchanged.length} items`)

  // Show some of the unchanged for verification
  const sampledUnchanged = unchanged.slice(0, 10)
  if (sampledUnchanged.length > 0) {
    console.log(`  Sample: ${sampledUnchanged.join(', ')}`)
  }

  // Distribution comparison
  console.log(`\n📈 Before/After distribution:`)
  const allOld = refined.map(r => r.oldGrams)
  const allNew = refined.map(r => r.newGrams)
  const bins = [0, 8, 12, 15, 20, 25, 30, 50]
  console.log('  Range      Before  After')
  for (let i = 0; i < bins.length - 1; i++) {
    const lo = bins[i]
    const hi = bins[i + 1]
    const oldCount = allOld.filter(g => g >= lo && g < hi).length
    const newCount = allNew.filter(g => g >= lo && g < hi).length
    console.log(
      `  ${String(lo).padStart(3)}-${String(hi).padStart(3)}g: ${String(oldCount).padStart(5)}  ${String(newCount).padStart(5)}`,
    )
  }

  // Apply
  if (!DRY_RUN && refined.length > 0) {
    console.log(`\n⬆️  Applying ${refined.length} updates...`)
    let success = 0
    let failed = 0

    for (const r of refined) {
      const { error } = await supabase
        .from('nutritional_data')
        .update({ alcohol_grams: r.newGrams })
        .eq('id', r.nd_id)

      if (error) {
        console.error(`  ✗ ${r.name}: ${error.message}`)
        failed++
      } else {
        success++
      }
    }

    console.log(`\n✅ Done: ${success} refined, ${failed} failed`)
  } else if (DRY_RUN) {
    console.log(`\n🔍 DRY RUN — no changes applied. Remove --dry-run to apply.`)
  } else {
    console.log(`\n✅ No changes needed — all estimates already accurate.`)
  }
}

main().catch(console.error)
