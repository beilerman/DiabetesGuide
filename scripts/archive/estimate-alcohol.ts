/**
 * Estimate alcohol content (grams of ethanol) for alcoholic beverages.
 *
 * Uses a hybrid approach:
 *   1. Classify each beverage by drink type (beer, wine, cocktail, etc.)
 *   2. Assign standard alcohol grams based on typical theme-park serving sizes
 *   3. Cross-check against the "caloric gap" (stated cal – macro cal) / 7
 *   4. Use the more plausible value
 *
 * Reference: 1 US standard drink = 14g pure ethanol = ~100 cal from alcohol
 * Alcohol provides 7 calories per gram.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/estimate-alcohol.ts [--dry-run]
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

// ---------------------------------------------------------------------------
// Drink type classification
// ---------------------------------------------------------------------------

type DrinkType =
  | 'light_beer'
  | 'beer'
  | 'craft_beer'
  | 'strong_beer'
  | 'beer_flight'
  | 'wine'
  | 'champagne'
  | 'sangria'
  | 'mimosa'
  | 'cocktail'
  | 'strong_cocktail'
  | 'frozen_cocktail'
  | 'margarita'
  | 'frozen_margarita'
  | 'spritz'
  | 'spirit_neat'
  | 'liqueur_coffee'
  | 'sake'
  | 'mead'
  | 'hard_cider'
  | 'hard_seltzer'
  | 'non_alcoholic'

// Standard alcohol grams by drink type (theme park serving sizes)
const ALCOHOL_GRAMS: Record<DrinkType, number> = {
  light_beer: 11,       // 12oz, 4.2% ABV
  beer: 14,             // 12oz, 5% ABV
  craft_beer: 18,       // 12-16oz, 6-7% ABV (theme parks often serve pints)
  strong_beer: 24,      // 12oz, 8.5% ABV (Belgian, imperial stout)
  beer_flight: 14,      // 4×4oz samples ≈ one full beer
  wine: 14,             // 5oz, 12.5% ABV
  champagne: 14,        // 5oz, 12% ABV
  sangria: 13,          // 8oz, 7% ABV (diluted with fruit juice)
  mimosa: 8,            // ~3oz champagne + OJ
  cocktail: 14,         // 1.5oz spirit (40% ABV) = 1 standard drink
  strong_cocktail: 28,  // Long Island, zombies, etc. (2+ shots)
  frozen_cocktail: 18,  // Larger pour at parks, blended
  margarita: 16,        // Slightly more than standard (parks pour generously)
  frozen_margarita: 20, // Larger frozen pour
  spritz: 11,           // Aperol + prosecco, lighter
  spirit_neat: 14,      // 1.5oz, 40% ABV
  liqueur_coffee: 8,    // 1oz liqueur (~20% ABV)
  sake: 18,             // 5oz, 15-16% ABV
  mead: 15,             // 5oz, 13% ABV
  hard_cider: 14,       // 12oz, 5% ABV
  hard_seltzer: 12,     // 12oz, 4.5% ABV
  non_alcoholic: 0,
}

/**
 * Classify a beverage by its drink type using name + description.
 * Returns null if the item is not identifiable as alcoholic.
 */
function classifyDrink(name: string, description: string | null): DrinkType | null {
  const n = (name || '').toLowerCase()
  const d = (description || '').toLowerCase()
  const both = `${n} | ${d}`

  // ---- Explicit non-alcoholic ----
  if (/non[- ]?alcoholic|zero alcohol|alcohol[- ]?free|virgin |mocktail|n\/a beer/i.test(both)) {
    return 'non_alcoholic'
  }

  // ---- False positives: food items with alcohol words in name ----
  // Check if this is categorized as a non-beverage (handled by caller),
  // but also catch things like "Root Beer Float" (non-alcoholic)
  if (/root beer|ginger beer(?! \w*(cocktail|punch|mule))|birch beer|butterbeer/i.test(n)) {
    // Ginger beer is non-alcoholic UNLESS it's part of a cocktail (Moscow Mule)
    if (!/mule|cocktail|punch|vodka|rum|gin |whiskey|bourbon|tequila/i.test(both)) {
      return 'non_alcoholic'
    }
  }

  // ---- Beer ----
  // Strip non-alcoholic terms before beer matching to avoid false positives
  // ("Ginger Ale" → ale, "Root Beer" in fountain soda descriptions, etc.)
  const beerSafe = both
    .replace(/ginger ale/gi, '')
    .replace(/root beer/gi, '')
    .replace(/birch beer/gi, '')
    .replace(/cream ale/gi, '') // cream ale soda

  if (/beer flight/i.test(n)) return 'beer_flight'
  if (/\bipa\b|india pale ale|double ipa|hazy ipa|pale ale|craft beer/i.test(beerSafe)) return 'craft_beer'
  if (/\bstout\b|porter|imperial|belgian|tripel|dubbel|barleywine|quad/i.test(beerSafe)) return 'strong_beer'
  if (/\blight\b.*\bbeer\b|\bbeer\b.*\blight\b|lite beer|ultra|skinny brew|michelob|bud light|coors light|miller lite/i.test(beerSafe)) return 'light_beer'
  if (/\blager\b|\bbeer\b|\bale\b|\bpilsner\b|\bhefeweizen\b|\bamber\b.*\bale\b|\bwheat\b.*\bbeer\b/i.test(beerSafe)) return 'beer'
  // Note: removed bare "draft" pattern — too many false positives (draft soda, draft root beer)

  // ---- Wine types ----
  if (/mimosa/i.test(n)) return 'mimosa'
  if (/sangria/i.test(n)) return 'sangria'
  if (/champagne|prosecco|sparkling wine|cava|bellini/i.test(both)) return 'champagne'
  if (/\bwine\b|cabernet|merlot|chardonnay|pinot|riesling|sauvignon|moscato|rosé|zinfandel|shiraz|malbec/i.test(both)) return 'wine'

  // ---- Frozen / blended ----
  if (/frozen.*margarita/i.test(n)) return 'frozen_margarita'
  if (/frozen|blended|slushy|slushie|icee.*rum|icee.*vodka/i.test(both) &&
      /vodka|rum|tequila|gin |whiskey|bourbon|liqueur|cocktail/i.test(both)) return 'frozen_cocktail'

  // ---- Margarita ----
  if (/margarita/i.test(n)) return 'margarita'

  // ---- Strong cocktails ----
  if (/long island|zombie|jungle juice|fish bowl|scorpion bowl|hurricane|mai tai|painkiller/i.test(both)) return 'strong_cocktail'

  // ---- Spritz ----
  if (/spritz|aperol/i.test(both)) return 'spritz'

  // ---- Liqueur coffee ----
  if (/irish coffee|coffee.*liqueur|liqueur.*coffee|bailey.*coffee|kahlua.*coffee|amarula.*coffee|african coffee/i.test(both)) return 'liqueur_coffee'

  // ---- Cocktails (general) ----
  if (/cocktail|mojito|daiquiri|mule|cosmopolitan|old fashioned|manhattan|negroni|paloma|sour\b|martini|colada|punch.*rum|punch.*vodka|smash|fizz\b|highball|julep|caipirinha|tiki/i.test(both)) return 'cocktail'

  // ---- Spirits in description (mixed drinks without "cocktail" in name) ----
  if (/vodka|tequila|\brum\b|\bgin\b|bourbon|whiskey|brandy|mezcal|scotch|cognac/i.test(both)) {
    // If the drink name doesn't suggest mixing, it's neat
    if (/neat|on the rocks|straight|shot|tasting/i.test(both)) return 'spirit_neat'
    // If description mentions mixers, it's a cocktail
    if (/juice|soda|tonic|syrup|puree|lemonade|cola|ginger|lime|pineapple|orange|cranberry|coconut/i.test(d)) return 'cocktail'
    // Default to cocktail for spirit-containing beverages
    return 'cocktail'
  }

  // ---- Sake / Mead / Cider ----
  if (/\bsake\b|nigori|junmai|daiginjo/i.test(both)) return 'sake'
  if (/\bmead\b/i.test(both)) return 'mead'
  if (/hard cider|\bcider\b.*\balcohol/i.test(both)) return 'hard_cider'
  if (/hard seltzer|white claw|truly|high noon/i.test(both)) return 'hard_seltzer'

  // ---- Catch-all: liqueur or abv mentioned ----
  if (/liqueur|abv|proof|alcohol/i.test(both)) return 'cocktail'

  return null
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

interface BeverageRow {
  nd_id: string
  mi_id: string
  name: string
  description: string | null
  calories: number | null
  carbs: number | null
  fat: number | null
  protein: number | null
  sugar: number | null
  category: string
  alcohol_grams: number | null
}

async function fetchAllBeverages(): Promise<BeverageRow[]> {
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
          sugar,
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
      if (!nd) continue

      all.push({
        nd_id: nd.id,
        mi_id: row.id,
        name: row.name,
        description: row.description,
        calories: nd.calories,
        carbs: nd.carbs,
        fat: nd.fat,
        protein: nd.protein,
        sugar: nd.sugar,
        category: row.category,
        alcohol_grams: nd.alcohol_grams,
      })
    }

    if (data.length < PAGE) break
    offset += PAGE
  }

  return all
}

// ---------------------------------------------------------------------------
// Estimation logic
// ---------------------------------------------------------------------------

function estimateAlcoholGrams(
  drinkType: DrinkType,
  calories: number | null,
  carbs: number | null,
  fat: number | null,
  protein: number | null,
): number {
  const standard = ALCOHOL_GRAMS[drinkType]
  if (standard === 0) return 0

  // Caloric gap method: gap = stated_cal - (carbs*4 + fat*9 + protein*4)
  // alcohol_grams = gap / 7
  if (calories != null && calories > 0) {
    const c = carbs ?? 0
    const f = fat ?? 0
    const p = protein ?? 0
    const macroCals = c * 4 + f * 9 + p * 4
    const gap = calories - macroCals

    if (gap > 0) {
      const gapGrams = Math.round(gap / 7)

      // Use caloric gap estimate only if it's within a tight range of the
      // standard. Many items have inflated calories from the over-multiplication
      // issue, which creates artificially large gaps.
      // Accept gap estimates between 60% and 150% of standard.
      if (gapGrams >= standard * 0.6 && gapGrams <= standard * 1.5) {
        return gapGrams
      }
    }
  }

  // Fallback to standard estimate
  return standard
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n🍺 Alcohol Content Estimation Script`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  console.log('─'.repeat(60))

  const beverages = await fetchAllBeverages()
  console.log(`\nFetched ${beverages.length} beverages total`)

  // Classify and estimate
  const updates: { nd_id: string; name: string; drinkType: DrinkType; grams: number }[] = []
  const skipped: { name: string; reason: string }[] = []
  const typeCounts: Record<string, number> = {}

  for (const bev of beverages) {
    // Skip if already has alcohol data
    if (bev.alcohol_grams != null && bev.alcohol_grams > 0) {
      skipped.push({ name: bev.name, reason: 'already has alcohol_grams' })
      continue
    }

    const drinkType = classifyDrink(bev.name, bev.description)

    if (drinkType === null) {
      skipped.push({ name: bev.name, reason: 'not identified as alcoholic' })
      continue
    }

    if (drinkType === 'non_alcoholic') {
      // Set to 0 explicitly
      updates.push({ nd_id: bev.nd_id, name: bev.name, drinkType, grams: 0 })
      typeCounts['non_alcoholic'] = (typeCounts['non_alcoholic'] || 0) + 1
      continue
    }

    const grams = estimateAlcoholGrams(
      drinkType,
      bev.calories,
      bev.carbs,
      bev.fat,
      bev.protein,
    )

    updates.push({ nd_id: bev.nd_id, name: bev.name, drinkType, grams })
    typeCounts[drinkType] = (typeCounts[drinkType] || 0) + 1
  }

  // Print classification summary
  console.log(`\n📊 Classification Summary:`)
  const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])
  for (const [type, count] of sortedTypes) {
    const stdGrams = ALCOHOL_GRAMS[type as DrinkType]
    console.log(`  ${type.padEnd(20)} ${String(count).padStart(4)} items  (std: ${stdGrams}g)`)
  }
  console.log(`  ${'TOTAL'.padEnd(20)} ${String(updates.length).padStart(4)} items`)
  console.log(`  ${'Skipped'.padEnd(20)} ${String(skipped.length).padStart(4)} items`)

  // Print sample updates
  console.log(`\n📝 Sample updates (first 30):`)
  for (const u of updates.slice(0, 30)) {
    const drinks = u.grams > 0 ? (u.grams / 14).toFixed(1) : '0'
    console.log(`  ${u.grams.toString().padStart(3)}g (${drinks} drinks)  [${u.drinkType.padEnd(18)}]  ${u.name}`)
  }
  if (updates.length > 30) console.log(`  ... and ${updates.length - 30} more`)

  // Print skipped non-alcoholic beverages (first 20)
  const notAlcoholic = skipped.filter(s => s.reason === 'not identified as alcoholic')
  if (notAlcoholic.length > 0) {
    console.log(`\n⏭️  Not identified as alcoholic (first 20 of ${notAlcoholic.length}):`)
    for (const s of notAlcoholic.slice(0, 20)) {
      console.log(`  - ${s.name}`)
    }
  }

  // Histogram of alcohol grams
  console.log(`\n📈 Distribution of estimated alcohol (grams):`)
  const bins = [0, 1, 8, 12, 15, 20, 25, 30, 50]
  for (let i = 0; i < bins.length - 1; i++) {
    const lo = bins[i]
    const hi = bins[i + 1]
    const count = updates.filter(u => u.grams >= lo && u.grams < hi).length
    const bar = '█'.repeat(Math.ceil(count / 2))
    console.log(`  ${String(lo).padStart(3)}-${String(hi).padStart(3)}g: ${String(count).padStart(4)}  ${bar}`)
  }
  const over = updates.filter(u => u.grams >= 50).length
  if (over > 0) console.log(`   50g+: ${String(over).padStart(4)}`)

  // Apply updates
  if (!DRY_RUN) {
    console.log(`\n⬆️  Applying ${updates.length} updates...`)
    let success = 0
    let failed = 0

    for (const u of updates) {
      const { error } = await supabase
        .from('nutritional_data')
        .update({ alcohol_grams: u.grams })
        .eq('id', u.nd_id)

      if (error) {
        console.error(`  ✗ Failed: ${u.name} — ${error.message}`)
        failed++
      } else {
        success++
      }
    }

    console.log(`\n✅ Done: ${success} updated, ${failed} failed`)
  } else {
    console.log(`\n🔍 DRY RUN — no changes applied. Remove --dry-run to apply.`)
  }
}

main().catch(console.error)
