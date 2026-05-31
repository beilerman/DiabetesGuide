import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const DRY_RUN = !process.argv.includes('--apply')

interface NutRow {
  id: string
  menu_item_id: string
  calories: number | null
  carbs: number | null
  fat: number | null
  sugar: number | null
  protein: number | null
  fiber: number | null
  sodium: number | null
  cholesterol: number | null
  source: string
  confidence_score: number | null
}

interface Item {
  id: string
  name: string
  category: string
  description: string | null
  is_fried: boolean
  restaurant: { name: string; park: { name: string } }
  nutritional_data: NutRow[]
}

async function fetchAll(): Promise<Item[]> {
  const all: Item[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from('menu_items')
      .select('id, name, category, description, is_fried, restaurant:restaurants(name, park:parks(name)), nutritional_data(id, menu_item_id, calories, carbs, fat, sugar, protein, fiber, sodium, cholesterol, source, confidence_score)')
      .range(from, from + 499)
    if (error) { console.error(error); break }
    if (!data || data.length === 0) break
    all.push(...(data as unknown as Item[]))
    if (data.length < 500) break
    from += 500
  }
  return all
}

async function updateNut(id: string, fields: Record<string, number | null>) {
  if (DRY_RUN) return
  const { error } = await sb.from('nutritional_data').update(fields).eq('id', id)
  if (error) console.error(`  UPDATE FAILED ${id}:`, error.message)
}

// Detect if item is likely an alcoholic/non-food beverage (even if miscategorized)
function isLikelyBeverage(name: string): boolean {
  const n = name.toLowerCase()
  // Specific beer brands
  if (/\b(modelo|corona|heineken|budweiser|stella artois|yuengling|samuel adams|peroni|chimay|coors|blue moon|strongbow|schöfferhofer|warsteiner|kronenbourg|amstel|beck|dos equis|pacifico|negra modelo|lagunitas|goose island|cigar city|funky buddha|terrapin|sweetwater|dogfish|sierra nevada|new belgium|fat tire|blue point)\b/i.test(n)) return true
  // Beer styles
  if (/\b(ipa|pilsner|lager|stout|porter|hefeweizen|shandy|gose|amber|pale ale|wheat beer|draft beer|craft beer|on tap)\b/i.test(n) && !/batter|bread|sauce|braise|glaze|crust|rub|marinate/i.test(n)) return true
  // Spirits/cocktails
  if (/\b(martini|margarita|mojito|daiquiri|paloma|negroni|spritz|mule|bellini|mimosa|sangria|old fashioned|mai tai|piña colada|cosmopolitan|manhattan|sidecar|highball|toddy|fizz|sour|boulevardier|sazerac)\b/i.test(n) && !/burger|chicken|pork|steak|fries|sandwich/i.test(n)) return true
  // Spirit names
  if (/\b(tequila|mezcal|vodka|bourbon|whisky|whiskey|scotch|rum|gin|brandy|cognac|sake|soju)\b/i.test(n) && !/batter|sauce|braise|glaze|crust|rub|marinate|infuse|vodka sauce|alla vodka|penne vodka|bourbon glaze|rum cake|bourbon sauce|whiskey sauce/i.test(n)) return true
  // Wine
  if (/\b(pinot|cabernet|chardonnay|merlot|riesling|sauvignon blanc|prosecco|champagne|rosé|shiraz|malbec|tempranillo|grenache|zinfandel|chianti|barolo|rioja|chablis)\b/i.test(n) && !/sauce|braise|reduction|glaze|braised|rubbed|marinate|infuse/i.test(n)) return true
  // Non-alcoholic drinks
  if (/\b(cold brew|espresso|latte|cappuccino|americano|macchiato|frappuccino|smoothie|milkshake|juice|soda|lemonade|tea\b|chai\b|matcha|refresher|punch|agua fresca|boba)\b/i.test(n) && !/cake|cookie|brownie|ice cream|crust|sauce/i.test(n)) return true
  // Theme park specific drinks
  if (/\b(butterbeer|wizard'?s brew|daisyroot draught|fishy green ale|gillywater|otter'?s fizzy|fire whiskey|grog|mead|potion|elixir|libation|freeze|slush)\b/i.test(n) && !/fudge|potted cream|ice cream|cake|crêpe/i.test(n)) return true
  // Generic alcoholic patterns
  if (/\b(flight|on the rocks|neat|up|double|single malt|reserve|aged|barrel|cask)\b/i.test(n) && /\b(tequila|whiskey|bourbon|sake|wine|beer|scotch|rum|vodka|gin)\b/i.test(n)) return true
  // High Noon (hard seltzer brand)
  if (/\bhigh noon\b/i.test(n)) return true
  return false
}

// ─── Phase 1: Fix Caloric Math Mismatches ────────────────────────────
// Where macros are plausible but calories don't match P*4+C*4+F*9
function fixCaloricMath(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number> }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number> }[] = []

  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd || !nd.calories || nd.calories <= 0) continue
    if (nd.carbs === null || nd.fat === null || nd.protein === null) continue
    // Skip official data
    if ((nd.confidence_score ?? 0) >= 80 && nd.source === 'official') continue

    // Skip beverages (alcohol explains the caloric gap)
    if (item.category === 'beverage' || isLikelyBeverage(item.name)) continue

    // Skip items that look like drinks even if miscategorized:
    // - fat=0 on a non-dessert item is almost always a drink (real food has fat)
    // - very low macros overall suggest a drink, not food
    if (nd.fat === 0 && item.category !== 'dessert') continue
    if ((nd.protein + nd.fat) < 5 && nd.carbs < 50) continue

    // Skip items at bars/lounges — likely drinks with creative names
    // Cream-based cocktails can have up to 8g fat, so use higher threshold for bars
    const rName = ((item.restaurant as any)?.name ?? '').toLowerCase()
    if (/\b(bar|pub|lounge|cantina|tavern|grog|brew|wine bar|astropub)\b/i.test(rName) && nd.fat < 10) continue

    const calcCal = (nd.protein * 4) + (nd.carbs * 4) + (nd.fat * 9)
    if (calcCal <= 0) continue

    const ratio = nd.calories / calcCal

    // Only fix significant mismatches (>40% off)
    if (ratio >= 0.6 && ratio <= 1.4) continue

    // Strategy: trust macros, fix calories
    const newCal = calcCal

    // Sanity checks based on category
    if (item.category === 'entree' && newCal < 100) continue // macros are probably wrong too
    if (item.category === 'snack' && newCal > 2000) continue
    if (item.category === 'side' && newCal > 1500) continue

    // Also update sodium proportionally if it exists
    const changes: Record<string, number> = { calories: newCal }
    if (nd.sodium !== null && nd.sodium > 0) {
      changes.sodium = Math.round(nd.sodium * (newCal / nd.calories))
    }

    fixes.push({ item, nd, changes })
  }
  return fixes
}

// ─── Phase 2: Fix Plausibility — Over-multiplied Items ───────────────
// Items where calories are way above expected range for food type
interface FoodProfile {
  pattern: RegExp
  exclude?: RegExp
  maxCal: number
  minCal: number
  name: string
}

const FOOD_PROFILES: FoodProfile[] = [
  // These must be ordered specific → general
  { pattern: /caesar salad/i, maxCal: 800, minCal: 200, name: 'caesar_salad' },
  { pattern: /pretzel dog|pretzel.*hot dog/i, maxCal: 800, minCal: 300, name: 'pretzel_dog' },
  { pattern: /burger|cheeseburger/i, exclude: /slider|mini|kid|impossible bite/i, maxCal: 1400, minCal: 400, name: 'burger' },
  { pattern: /nachos|totchos/i, maxCal: 1200, minCal: 300, name: 'nachos' },
  { pattern: /pizza|flatbread/i, exclude: /bagel|mini|personal/i, maxCal: 1400, minCal: 300, name: 'pizza' },
  { pattern: /platter|combo|feast|sampler/i, maxCal: 1800, minCal: 400, name: 'platter' },
  { pattern: /hot dog|corn dog/i, exclude: /platter|combo/i, maxCal: 800, minCal: 200, name: 'hot_dog' },
  { pattern: /scrambled eggs/i, maxCal: 600, minCal: 100, name: 'eggs' },
]

function fixOverMultiplied(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number>; profile: string }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number>; profile: string }[] = []

  for (const item of items) {
    if (item.category === 'beverage' || isLikelyBeverage(item.name)) continue
    const nd = item.nutritional_data?.[0]
    if (!nd || !nd.calories || nd.calories <= 0) continue
    if ((nd.confidence_score ?? 0) >= 80 && nd.source === 'official') continue

    for (const prof of FOOD_PROFILES) {
      if (!prof.pattern.test(item.name)) continue
      if (prof.exclude && prof.exclude.test(item.name)) continue

      if (nd.calories > prof.maxCal) {
        const targetCal = prof.maxCal
        const scale = targetCal / nd.calories
        const changes: Record<string, number> = {
          calories: targetCal,
        }
        if (nd.carbs !== null) changes.carbs = Math.round(nd.carbs * scale)
        if (nd.fat !== null) changes.fat = Math.round(nd.fat * scale)
        if (nd.protein !== null) changes.protein = Math.round(nd.protein * scale)
        if (nd.sugar !== null) changes.sugar = Math.round(nd.sugar * scale)
        if (nd.sodium !== null) changes.sodium = Math.round(nd.sodium * scale)
        if (nd.cholesterol !== null) changes.cholesterol = Math.round(nd.cholesterol * scale)

        // Validate: ensure sugar <= carbs after scaling
        if (changes.sugar !== undefined && changes.carbs !== undefined && changes.sugar > changes.carbs) {
          changes.sugar = changes.carbs
        }

        fixes.push({ item, nd, changes, profile: prof.name })
      }
      break // first matching profile wins
    }
  }
  return fixes
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (use --apply to write) ===' : '=== APPLYING FIXES ===')
  console.log('Fetching all items...')
  const items = await fetchAll()
  console.log(`Fetched ${items.length} items\n`)

  const fixedIds = new Set<string>()

  // ─── Phase 1: Caloric Math ────────────────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log('  PHASE 1: Caloric Math Fixes (trust macros, fix calories)')
  console.log(`${'═'.repeat(70)}`)
  const cmFixes = fixCaloricMath(items)
  let cmApplied = 0
  for (const f of cmFixes) {
    const r = f.item.restaurant as any
    const calcCal = ((f.nd.protein ?? 0) * 4) + ((f.nd.carbs ?? 0) * 4) + ((f.nd.fat ?? 0) * 9)
    const ratio = (f.nd.calories! / calcCal).toFixed(2)
    console.log(`  ✓ ${f.item.name} | ${r?.name ?? '?'}`)
    console.log(`    cal=${f.nd.calories}→${f.changes.calories} (P*4+C*4+F*9=${calcCal}, ratio=${ratio})`)
    await updateNut(f.nd.id, f.changes)
    fixedIds.add(f.nd.id)
    cmApplied++
  }
  console.log(`  → ${cmApplied} items fixed\n`)

  // ─── Phase 2: Over-multiplied Items ───────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log('  PHASE 2: Over-multiplied Items (scale to max range)')
  console.log(`${'═'.repeat(70)}`)
  const omFixes = fixOverMultiplied(items).filter(f => !fixedIds.has(f.nd.id))
  for (const f of omFixes) {
    const r = f.item.restaurant as any
    console.log(`  ✓ ${f.item.name} [${f.profile}] | ${r?.name ?? '?'}`)
    console.log(`    cal=${f.nd.calories}→${f.changes.calories}`)
    await updateNut(f.nd.id, f.changes)
    fixedIds.add(f.nd.id)
  }
  console.log(`  → ${omFixes.length} items fixed\n`)

  // ─── Summary ──────────────────────────────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log(`  SUMMARY`)
  console.log(`${'═'.repeat(70)}`)
  console.log(`  Caloric math fixes:     ${cmApplied}`)
  console.log(`  Over-multiplied fixes:  ${omFixes.length}`)
  console.log(`  TOTAL:                  ${cmApplied + omFixes.length}`)
  console.log(`${'═'.repeat(70)}`)
  if (DRY_RUN) console.log('\n  Run with --apply to write changes')
}

main().catch(console.error)
