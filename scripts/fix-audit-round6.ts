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

function loc(item: Item): string {
  const r = item.restaurant as any
  return `${r?.name ?? '?'} (${r?.park?.name ?? '?'})`
}

function isOfficial(nd: NutRow): boolean {
  return (nd.confidence_score ?? 0) >= 80 && nd.source === 'official'
}

// ─── Phase 1: Fix 0g fat on items that clearly contain fat ───────
// Items where fat=0 but the food type obviously has fat
// (fried foods, cheese, eggs, ice cream, dressings, butter, cream sauces)

function estimateFatForItem(item: Item, nd: NutRow): number | null {
  const name = item.name.toLowerCase()
  const cal = nd.calories ?? 0
  if (cal <= 0) return null

  // Fried foods: ~40-50% of cal from fat
  if (item.is_fried || /\b(fried|deep.fried|crispy|battered|tempura|breaded)\b/i.test(name)) {
    return Math.round((cal * 0.42) / 9)
  }

  // Ice cream, gelato, sundae: ~35-45% of cal from fat
  if (/\b(ice cream|gelato|sundae|à la mode|a la mode)\b/i.test(name)) {
    return Math.round((cal * 0.38) / 9)
  }

  // Milkshake/shake: ~30-40% of cal from fat
  if (/\b(milkshake|shake|malt|frappe|frappuccino)\b/i.test(name)) {
    return Math.round((cal * 0.33) / 9)
  }

  // Omelet, eggs, quiche, benedict: ~55-65% of cal from fat
  if (/\b(omelet|omelette|eggs?|quiche|benedict|frittata)\b/i.test(name) && !/egg roll|eggplant/i.test(name)) {
    return Math.round((cal * 0.55) / 9)
  }

  // Cheese-heavy items (grilled cheese, cheese plate, mac & cheese): ~45% from fat
  if (/\b(grilled cheese|cheese plate|cheese board|baked brie|cheese dip|queso)\b/i.test(name)) {
    return Math.round((cal * 0.45) / 9)
  }

  // Salads (as entree): ~40% from fat (dressing + cheese + nuts)
  if (/\bsalad\b/i.test(name) && item.category === 'entree') {
    return Math.round((cal * 0.40) / 9)
  }

  // Brownies, cookies, cake: ~35% from fat
  if (/\b(brownie|cookie|cake|pastry|scone|muffin|croissant|danish|cinnamon roll)\b/i.test(name)) {
    return Math.round((cal * 0.35) / 9)
  }

  // Dole Whip float (dairy-free but has some fat): ~10% from fat
  if (/\b(dole whip|dole.whip)\b/i.test(name)) {
    return Math.round((cal * 0.10) / 9)
  }

  // Only fix items we can specifically identify — don't guess for generic categories
  // (Many items with 0g fat and creative names are actually cocktails)
  return null
}

function phase1_fixZeroFat(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number | null>; reason: string }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number | null>; reason: string }[] = []

  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd || !nd.calories || nd.calories <= 0) continue
    if (isOfficial(nd)) continue
    if (nd.fat !== 0) continue // only fix items with exactly 0g fat

    // Skip beverages — many legitimately have 0g fat (juice, soda, coffee, tea, beer, wine)
    if (item.category === 'beverage') continue
    // Skip items that are clearly drinks even if miscategorized
    if (/\b(beers?|ales?|wines?|cocktails?|margaritas?|mojitos?|sangrias?|lemonade|soda|juice|tea|water|coffees?|espresso|americano|cold brew|drafts?|draughts?|mules?|spritz|bellini|mimosa|punch|flights?|daiquiris?|palomas?|negroni|liqueur|whisk[ey]+|bourbon|tequila|vodka|rum|gin|sake|mead|ciders?|seltzers?|shandy|pilsners?|lagers?|stouts?|porters?|mocktails?|moonshine|froscato|friezling|top shelf)\b/i.test(item.name) &&
        !/cake|cookie|brownie|sauce|batter|braised|ice cream/i.test(item.name)) continue
    // Skip items at bars/lounges/cantinas — they're almost always drinks with creative names
    const rName = ((item.restaurant as any)?.name ?? '').toLowerCase()
    if (/\b(bar|pub|lounge|cantina|tavern|grog|brew|wine bar|astropub|margarita)\b/i.test(rName) && (nd.protein ?? 0) < 10) continue
    // Skip items where the calorie gap could be explained by alcohol (not missing fat)
    // A standard drink = ~100 cal from alcohol. If gap is 50-350 and protein low, likely a drink.
    const macroCalc = ((nd.protein ?? 0) * 4) + ((nd.carbs ?? 0) * 4)
    const gap = nd.calories - macroCalc
    if (gap > 50 && gap < 350 && (nd.protein ?? 0) < 10) continue

    const estimatedFat = estimateFatForItem(item, nd)
    if (estimatedFat === null || estimatedFat <= 0) continue

    // Verify: with fat added, calories should make more sense
    const currentCalc = ((nd.protein ?? 0) * 4) + ((nd.carbs ?? 0) * 4)
    const newCalc = currentCalc + (estimatedFat * 9)
    // New calculated should be closer to stated calories
    if (Math.abs(newCalc - nd.calories) > Math.abs(currentCalc - nd.calories)) continue

    const changes: Record<string, number | null> = { fat: estimatedFat, confidence_score: 40 }

    // If sugar is missing but item is a dessert, estimate sugar too
    if ((nd.sugar === null || nd.sugar === 0) && item.category === 'dessert' && (nd.carbs ?? 0) > 0) {
      changes.sugar = Math.round((nd.carbs ?? 0) * 0.6)
    }

    fixes.push({ item, nd, changes, reason: `fat 0→${estimatedFat}g (~${Math.round(estimatedFat * 9 / nd.calories * 100)}% of cal)` })
  }

  return fixes
}

// ─── Phase 2: Fix undersized beers (43cal pattern) ─────────────
function phase2_fixUndersizedBeers(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number | null>; reason: string }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number | null>; reason: string }[] = []

  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd || !nd.calories) continue
    if (isOfficial(nd)) continue
    if (nd.calories > 70) continue // only fix very low cal beers

    const name = item.name.toLowerCase()
    // Match items that are clearly beers
    if (!/\bbeer\b|\bale\b|\blager\b|\bipa\b|\bpilsner\b|\bstout\b|\bporter\b|\bdraft\b/i.test(name)) continue
    // Exclude food items with beer-related words
    if (/batter|bread|sauce|braise|glaze|crust|rub|marinate|cheese|float|root/i.test(name)) continue
    // Exclude "cold brew" — that's coffee, not beer
    if (/cold brew/i.test(name)) continue

    // Determine beer type and set appropriate values
    let cal = 150, carbs = 13, fat = 0, protein = 2, sugar = 0
    if (/craft|ipa|pale ale|double|imperial/i.test(name)) {
      cal = 200; carbs = 15; sugar = 1
    } else if (/light|lite|ultra/i.test(name)) {
      cal = 105; carbs = 5; sugar = 0
    } else if (/stout|porter|dark/i.test(name)) {
      cal = 210; carbs = 18; sugar = 2
    }

    const changes: Record<string, number | null> = {
      calories: cal, carbs, fat, protein, sugar,
      fiber: 0, sodium: 14, cholesterol: 0,
      confidence_score: 40
    }

    fixes.push({ item, nd, changes, reason: `beer ${nd.calories}→${cal}cal` })
  }

  return fixes
}

// ─── Phase 3: Fix undersized wines (49cal pattern) ──────────────
function phase3_fixUndersizedWines(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number | null>; reason: string }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number | null>; reason: string }[] = []

  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd || !nd.calories) continue
    if (isOfficial(nd)) continue
    if (nd.calories > 70) continue

    const name = item.name.toLowerCase()
    // Match wine items
    if (!/\bwine\b|\bcabernet\b|\bchardonnay\b|\bmerlot\b|\bpinot\b|\briesling\b|\bsauvignon\b|\bprosecco\b|\bchampagne\b|\brosé\b|\bshiraz\b|\bmalbec\b|\btempranillo\b/i.test(name)) continue
    if (/sauce|braise|reduction|glaze|vinaigrette|marinate/i.test(name)) continue

    // Wine by the glass vs bottle
    let cal = 125, carbs = 4, sugar = 1
    if (/bottle/i.test(name)) {
      cal = 625; carbs = 20; sugar = 5
    } else if (/sparkling|prosecco|champagne/i.test(name)) {
      cal = 120; carbs = 4; sugar = 1
    } else if (/dessert wine|port|sherry|moscato/i.test(name)) {
      cal = 165; carbs = 14; sugar = 8
    }

    const changes: Record<string, number | null> = {
      calories: cal, carbs, fat: 0, protein: 0, sugar,
      fiber: 0, sodium: 7, cholesterol: 0,
      confidence_score: 40
    }

    fixes.push({ item, nd, changes, reason: `wine ${nd.calories}→${cal}cal` })
  }

  return fixes
}

// ─── Phase 4: Fix undersized milkshakes ─────────────────────────
function phase4_fixUndersizedShakes(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number | null>; reason: string }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number | null>; reason: string }[] = []

  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd || !nd.calories) continue
    if (isOfficial(nd)) continue
    if (nd.calories > 350) continue // only fix very undersized shakes

    const name = item.name.toLowerCase()
    if (!/\b(milkshake|shake)\b/i.test(name)) continue
    // Exclude things that aren't milkshakes
    if (/shack|protein shake|hand shake/i.test(name)) continue

    // Theme park milkshakes are 400-800+ cal
    let cal = 550, carbs = 72, fat = 22, protein = 12, sugar = 58
    if (/oreo|cookie|chocolate|brownie|candy/i.test(name)) {
      cal = 700; carbs = 92; fat = 28; protein = 14; sugar = 78
    } else if (/vanilla|classic/i.test(name)) {
      cal = 500; carbs = 65; fat = 20; protein = 12; sugar = 55
    } else if (/peanut butter|pb|reese/i.test(name)) {
      cal = 750; carbs = 88; fat = 35; protein = 18; sugar = 72
    }

    const changes: Record<string, number | null> = {
      calories: cal, carbs, fat, protein, sugar,
      fiber: 1, sodium: 350, cholesterol: 75,
      confidence_score: 40
    }

    fixes.push({ item, nd, changes, reason: `shake ${nd.calories}→${cal}cal` })
  }

  return fixes
}

// ─── Phase 5: Fix inflated macros ────────────────────────────────
// Items where P*4+C*4+F*9 is significantly MORE than stated calories
// This means one or more macros are overestimated (usually carbs from bad USDA match)
function phase5_fixInflatedMacros(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number | null>; reason: string }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number | null>; reason: string }[] = []

  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd || !nd.calories || nd.calories <= 100) continue
    if (isOfficial(nd)) continue
    if (nd.carbs === null || nd.fat === null || nd.protein === null) continue

    // Skip beverages — alcohol explains the gap in reverse
    if (item.category === 'beverage') continue

    const calcCal = (nd.protein * 4) + (nd.carbs * 4) + (nd.fat * 9)
    if (calcCal <= 0) continue

    const ratio = calcCal / nd.calories
    // Only fix when macros sum to 30%+ more than stated calories
    if (ratio < 1.3) continue

    // Scale all macros down proportionally to match stated calories
    const scale = nd.calories / calcCal
    const newCarbs = Math.round(nd.carbs * scale)
    const newFat = Math.round(nd.fat * scale)
    const newProtein = Math.round(nd.protein * scale)

    // Sanity check: don't create weird values
    if (newCarbs < 0 || newFat < 0 || newProtein < 0) continue

    const changes: Record<string, number | null> = {
      carbs: newCarbs,
      fat: newFat,
      protein: newProtein,
      confidence_score: 40
    }

    // Also fix sugar if it exceeds new carbs
    if (nd.sugar !== null && nd.sugar > newCarbs) {
      changes.sugar = Math.round(newCarbs * 0.3)
    }

    fixes.push({
      item, nd, changes,
      reason: `macros inflated ${ratio.toFixed(2)}x: C ${nd.carbs}→${newCarbs}g, F ${nd.fat}→${newFat}g, P ${nd.protein}→${newProtein}g`
    })
  }

  return fixes
}

// ─── Phase 6: Fix under-estimated fish entrees ───────────────────
function phase6_fixUndersizedFish(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number | null>; reason: string }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number | null>; reason: string }[] = []

  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd || !nd.calories) continue
    if (isOfficial(nd)) continue
    if (nd.calories > 280) continue // only fix clearly under-estimated items
    if (item.category !== 'entree') continue

    const name = item.name.toLowerCase()
    if (!/\b(fish|salmon|tuna|mahi|cod|grouper|tilapia|catfish|trout|snapper|halibut|swordfish|sea bass|shrimp|prawns?)\b/i.test(name)) continue
    // Exclude non-entree items
    if (/sauce|stock|broth|topping|add-on|side of|garnish/i.test(name)) continue

    // Determine fish entree type
    let cal = 500, carbs = 25, fat = 20, protein = 35, sugar = 3, fiber = 3, sodium = 900

    if (/fish.?(?:and|&|n).?chips|fried fish/i.test(name)) {
      cal = 750; carbs = 55; fat = 38; protein = 30; sugar = 3; fiber = 3; sodium = 1200
    } else if (/fish taco/i.test(name)) {
      cal = 550; carbs = 38; fat = 25; protein = 28; sugar = 4; fiber = 4; sodium = 900
    } else if (/grilled|pan.seared|blackened|roasted/i.test(name)) {
      cal = 500; carbs = 20; fat = 18; protein = 40; sugar = 2; fiber = 3; sodium = 800
    } else if (/shrimp|prawn/i.test(name)) {
      cal = 450; carbs = 22; fat = 18; protein = 35; sugar = 2; fiber = 2; sodium = 1100
    }

    const changes: Record<string, number | null> = {
      calories: cal, carbs, fat, protein, sugar, fiber, sodium,
      cholesterol: 85,
      confidence_score: 40
    }

    fixes.push({ item, nd, changes, reason: `fish entree ${nd.calories}→${cal}cal` })
  }

  return fixes
}

// ─── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (use --apply to write) ===' : '=== APPLYING FIXES ===')
  console.log('Fetching all items...')
  const items = await fetchAll()
  console.log(`Fetched ${items.length} items\n`)

  const fixedIds = new Set<string>()
  let totalFixed = 0

  // ─── Phase 1: Zero Fat ─────────────────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log('  PHASE 1: Fix 0g fat on items that clearly contain fat')
  console.log(`${'═'.repeat(70)}`)
  const fatFixes = phase1_fixZeroFat(items)
  for (const f of fatFixes) {
    console.log(`  ✓ ${f.item.name} | ${loc(f.item)}`)
    console.log(`    ${f.reason}`)
    await updateNut(f.nd.id, f.changes)
    fixedIds.add(f.nd.id)
  }
  console.log(`  → ${fatFixes.length} items fixed\n`)
  totalFixed += fatFixes.length

  // ─── Phase 2: Undersized Beers ─────────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log('  PHASE 2: Fix undersized beers (43cal → standard)')
  console.log(`${'═'.repeat(70)}`)
  const beerFixes = phase2_fixUndersizedBeers(items).filter(f => !fixedIds.has(f.nd.id))
  for (const f of beerFixes) {
    console.log(`  ✓ ${f.item.name} | ${loc(f.item)}`)
    console.log(`    ${f.reason}`)
    await updateNut(f.nd.id, f.changes)
    fixedIds.add(f.nd.id)
  }
  console.log(`  → ${beerFixes.length} items fixed\n`)
  totalFixed += beerFixes.length

  // ─── Phase 3: Undersized Wines ─────────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log('  PHASE 3: Fix undersized wines (49cal → standard)')
  console.log(`${'═'.repeat(70)}`)
  const wineFixes = phase3_fixUndersizedWines(items).filter(f => !fixedIds.has(f.nd.id))
  for (const f of wineFixes) {
    console.log(`  ✓ ${f.item.name} | ${loc(f.item)}`)
    console.log(`    ${f.reason}`)
    await updateNut(f.nd.id, f.changes)
    fixedIds.add(f.nd.id)
  }
  console.log(`  → ${wineFixes.length} items fixed\n`)
  totalFixed += wineFixes.length

  // ─── Phase 4: Undersized Milkshakes ────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log('  PHASE 4: Fix undersized milkshakes')
  console.log(`${'═'.repeat(70)}`)
  const shakeFixes = phase4_fixUndersizedShakes(items).filter(f => !fixedIds.has(f.nd.id))
  for (const f of shakeFixes) {
    console.log(`  ✓ ${f.item.name} | ${loc(f.item)}`)
    console.log(`    ${f.reason}`)
    await updateNut(f.nd.id, f.changes)
    fixedIds.add(f.nd.id)
  }
  console.log(`  → ${shakeFixes.length} items fixed\n`)
  totalFixed += shakeFixes.length

  // ─── Phase 5: Inflated Macros ──────────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log('  PHASE 5: Fix inflated macros (P*4+C*4+F*9 >> stated cal)')
  console.log(`${'═'.repeat(70)}`)
  const macroFixes = phase5_fixInflatedMacros(items).filter(f => !fixedIds.has(f.nd.id))
  for (const f of macroFixes) {
    console.log(`  ✓ ${f.item.name} | ${loc(f.item)}`)
    console.log(`    ${f.reason}`)
    await updateNut(f.nd.id, f.changes)
    fixedIds.add(f.nd.id)
  }
  console.log(`  → ${macroFixes.length} items fixed\n`)
  totalFixed += macroFixes.length

  // ─── Phase 6: Undersized Fish ──────────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log('  PHASE 6: Fix under-estimated fish entrees')
  console.log(`${'═'.repeat(70)}`)
  const fishFixes = phase6_fixUndersizedFish(items).filter(f => !fixedIds.has(f.nd.id))
  for (const f of fishFixes) {
    console.log(`  ✓ ${f.item.name} | ${loc(f.item)}`)
    console.log(`    ${f.reason}`)
    await updateNut(f.nd.id, f.changes)
    fixedIds.add(f.nd.id)
  }
  console.log(`  → ${fishFixes.length} items fixed\n`)
  totalFixed += fishFixes.length

  // ─── Summary ───────────────────────────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log(`  SUMMARY`)
  console.log(`${'═'.repeat(70)}`)
  console.log(`  Phase 1 (zero fat):         ${fatFixes.length}`)
  console.log(`  Phase 2 (undersized beers):  ${beerFixes.length}`)
  console.log(`  Phase 3 (undersized wines):  ${wineFixes.length}`)
  console.log(`  Phase 4 (undersized shakes): ${shakeFixes.length}`)
  console.log(`  Phase 5 (inflated macros):   ${macroFixes.length}`)
  console.log(`  Phase 6 (undersized fish):   ${fishFixes.length}`)
  console.log(`  TOTAL:                       ${totalFixed}`)
  console.log(`${'═'.repeat(70)}`)
  if (DRY_RUN) console.log('\n  Run with --apply to write changes')
}

main().catch(console.error)
