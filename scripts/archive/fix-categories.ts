import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const DRY_RUN = !process.argv.includes('--apply')

interface Item {
  id: string
  name: string
  category: string
  description: string | null
  restaurant: { name: string; park: { name: string } }
}

async function fetchAll(): Promise<Item[]> {
  const all: Item[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from('menu_items')
      .select('id, name, category, description, restaurant:restaurants(name, park:parks(name))')
      .range(from, from + 499)
    if (error) { console.error(error); break }
    if (!data || data.length === 0) break
    all.push(...(data as unknown as Item[]))
    if (data.length < 500) break
    from += 500
  }
  return all
}

// ─── Food words that disqualify beverage reclassification ─────────────
const FOOD_CONTEXT = /\b(pork|tenderloin|chicken|steak|beef|burger|fries|pasta|tortellini|penne|ravioli|gnocchi|fettuccine|rigatoni|fondue|cauliflower|cr[eê]pe|popcorn|potato|bisque|soup|chowder|pie|brownie|churro|cookie|cake|donut|bread|sandwich|wrap|salad|brine|braised|glazed|rubbed|crusted|marinated|infused|sauce|reduction|compote|vinaigrette|cream\b(?!\s*soda))/i

// ─── Category detection rules ─────────────────────────────────────────
function correctCategory(item: Item): string | null {
  const n = item.name.toLowerCase()
  const current = item.category
  const hasFood = FOOD_CONTEXT.test(n)

  // ─── BEVERAGES miscategorized as other types ───────────────────
  // Only reclassify to beverage if NO food context words present

  // Wine - specific grape/style names (very reliable)
  if (/\b(pinot noir|pinot grigio|cabernet|sauvignon blanc|chardonnay|riesling|merlot|malbec|prosecco|champagne|rosé|sangria)\b/i.test(n) && current !== 'beverage' && !hasFood) {
    return 'beverage'
  }
  // Wine from regions
  if (/\b(chianti|barolo|bordeaux|chablis|montepulciano d'abruzzo|garnacha)\b/i.test(n) && current !== 'beverage' && !hasFood) {
    return 'beverage'
  }

  // Specific beer/seltzer brands (high confidence — brand names are unambiguous)
  if (/\b(modelo|corona|heineken|budweiser|stella artois|samuel adams|yuengling|ommegang|strongbow|brooklyn brewery|schöfferhofer|high noon|nütrl|white claw|truly|3 daughters|crooked can)\b/i.test(n) && current !== 'beverage' && !hasFood) {
    return 'beverage'
  }

  // Beer styles (only when no food context)
  if (/\b(ipa|pilsner|lager|stout\b(?!\s*cake)|ale\b(?!\s*house)|porter|hefeweizen|shandy|hard seltzer|gose)\b/i.test(n) && current !== 'beverage' && !hasFood) {
    return 'beverage'
  }

  // Spirits — only standalone spirit names, NOT "alla vodka" or "bourbon glaze"
  if (/\b(tequila|mezcal|bacanora)\b/i.test(n) && current !== 'beverage' && !hasFood) {
    if (!/sundae|cake|pie|brownie|ice cream/i.test(n)) return 'beverage'
  }
  // Sake - specifically Japanese restaurant context
  if (/\bsake\b/i.test(n) && !/for\s+sake|sake\s+of/i.test(n) && current !== 'beverage' && !hasFood) {
    return 'beverage'
  }

  // Cocktails — only unambiguous cocktail names
  if (/\b(martini|margarita|mojito|daiquiri|paloma|negroni|moscow mule|mimosa|bellini)\b/i.test(n) && current !== 'beverage' && !hasFood) {
    return 'beverage'
  }
  // "Old Fashioned" — only if no food words (excludes "Old Fashioned Burger")
  if (/\bold fashioned\b/i.test(n) && !/burger|chicken|bbq|pork|beef|fries/i.test(n) && current !== 'beverage' && !hasFood) {
    return 'beverage'
  }
  // "Spritz" — only as standalone drink, not "spritz of lemon"
  if (/\bspritz\b/i.test(n) && !/lemon|lime|oil/i.test(n) && current !== 'beverage' && !hasFood) {
    return 'beverage'
  }
  // "Mule" — cocktail, not food
  if (/\bmule\b/i.test(n) && !/sauce|team/i.test(n) && current !== 'beverage' && !hasFood) {
    return 'beverage'
  }

  // Non-alcoholic beverages (very reliable)
  if (/\b(cold brew|espresso|cappuccino|latte|americano|macchiato|frappuccino)\b/i.test(n) && current !== 'beverage' && !hasFood) {
    return 'beverage'
  }
  if (/\b(hot chocolate)\b/i.test(n) && !/churro|mini|cookie|cake|brownie/i.test(n) && current !== 'beverage') {
    return 'beverage'
  }
  if (/\b(smoothie|refresher)\b/i.test(n) && current !== 'beverage' && !hasFood) {
    return 'beverage'
  }

  // Sodas/waters (unambiguous)
  if (/\b(coca.cola|pepsi|sprite|fanta|dr.pepper|mountain dew|powerade|gatorade|dasani|smartwater|mineral water|sparkling water|tonic water|club soda|buzz cola)\b/i.test(n) && current !== 'beverage') {
    return 'beverage'
  }

  // Monster/Red Bull energy drinks
  if (/\b(monster|red bull)\b/i.test(n) && /\b(energy|ultra|zero)\b/i.test(n) && current !== 'beverage') {
    return 'beverage'
  }

  // Frozen drinks, slushies, agua fresca, lassi, boba
  if (/\b(icee|slush|agua fresca|lassi|boba)\b/i.test(n) && current !== 'beverage' && !hasFood) {
    return 'beverage'
  }
  // "Frozen" + drink context (not "frozen custard" or "frozen yogurt")
  if (/\bfrozen\b/i.test(n) && /\b(drink|lemonade|cocktail|margarita|daiquiri|colada)\b/i.test(n) && current !== 'beverage') {
    return 'beverage'
  }

  // Juice items (not "juice reduction" or ingredient)
  if (/\bjuice\b/i.test(n) && !/reduction|glaze|braised|sauce|brined/i.test(n) && current !== 'beverage' && !hasFood) {
    return 'beverage'
  }

  // Pimm's Cup (cocktail)
  if (/\bpimm'?s\b/i.test(n) && current !== 'beverage') {
    return 'beverage'
  }

  // Fountain beverages, draft beer general
  if (/\b(fountain beverage|draft beer|on tap|bottle[ds]?\s*\d+\s*oz)\b/i.test(n) && current !== 'beverage') {
    return 'beverage'
  }

  // PET bottles
  if (/\b\d+\s*oz\s+pet\b/i.test(n) && current !== 'beverage') {
    return 'beverage'
  }

  // "Glass" when clearly a drink (e.g., "8 oz Glass")
  if (/\b\d+\s*oz\s+glass\b/i.test(n) && current !== 'beverage') {
    return 'beverage'
  }

  // Tequila/liquor flights (at bars)
  if (/\bflight\b/i.test(n) && /tequila|whiskey|bourbon|sake|wine|beer|scotch/i.test(n) && current !== 'beverage') {
    return 'beverage'
  }

  // Cider — only as alcoholic cider (not "cider-brined")
  if (/\bcider\b/i.test(n) && !/brine|braised|glaze|vinegar|bisque|onion|pork|chicken/i.test(n) && current !== 'beverage' && !hasFood) {
    return 'beverage'
  }

  // Butterbeer — only liquid forms
  if (/butterbeer/i.test(n) && current !== 'beverage') {
    if (!/fudge|ice cream|cake|cr[eê]pe|potted cream|cookie|brownie/i.test(n)) return 'beverage'
  }

  // ─── DESSERTS miscategorized ───────────────────────────────────
  // Ice cream scoops, sundaes, gelato — but NOT floats/shakes (keep those as-is)
  if (/\b(scoop|sundae|gelato|sorbet|ice cream|frozen custard|popsicle|dole whip)\b/i.test(n) && current !== 'dessert' && current !== 'beverage') {
    if (!/float|shake|smoothie|cold brew/i.test(n)) return 'dessert'
  }

  // Candy, caramel apples, fudge (but not "fudge brownie cold brew")
  if (/\b(caramel apple|candy apple|marshmallow wand|chocolate bar|cookie pie)\b/i.test(n) && current !== 'dessert') {
    return 'dessert'
  }
  // Fudge - only standalone, not as ingredient descriptor
  if (/\bfudge\b/i.test(n) && !/cold brew|coffee|latte|shake|drink|topping/i.test(n) && current === 'entree') {
    return 'dessert'
  }

  // Cannoli (not a main course)
  if (/\bcannoli\b/i.test(n) && current === 'entree') {
    return 'dessert'
  }
  // Doughnuts (not savory combinations)
  if (/\b(doughnut|donut)\b/i.test(n) && current === 'entree') {
    if (!/burger|sandwich|sushi|chicken|grilled cheese|cheese donut|savory/i.test(n)) return 'dessert'
  }

  // Ganache squares/bars (standalone chocolate, not wine pairings)
  if (/\bganache\s*(square|bar)\b/i.test(n) && current !== 'dessert' && !/pairing|wine|rosa|regale/i.test(n)) {
    return 'dessert'
  }

  // Items in snack that are clearly desserts
  if (current === 'snack' && /\b(dole whip|gelato|sorbet|caramel apple|ganache|fudge)\b/i.test(n)) {
    return 'dessert'
  }

  // ─── SIDES miscategorized as entrees ───────────────────────────
  if (/^(side|extra)\s/i.test(n) && current === 'entree') {
    return 'side'
  }

  // ─── SNACKS miscategorized ─────────────────────────────────────
  if (/\b(pretzel bites|donut holes|churro bites)\b/i.test(n) && current === 'entree') {
    return 'snack'
  }

  return null
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (use --apply to write) ===' : '=== APPLYING FIXES ===')
  console.log('Fetching all items...')
  const items = await fetchAll()
  console.log(`Fetched ${items.length} items\n`)

  const fixes: { item: Item; from: string; to: string }[] = []

  for (const item of items) {
    const newCat = correctCategory(item)
    if (newCat && newCat !== item.category) {
      fixes.push({ item, from: item.category, to: newCat })
    }
  }

  // Group by correction type
  const byCat = new Map<string, typeof fixes>()
  for (const f of fixes) {
    const key = `${f.from} → ${f.to}`
    if (!byCat.has(key)) byCat.set(key, [])
    byCat.get(key)!.push(f)
  }

  for (const [key, group] of [...byCat.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n  ${key} (${group.length} items)`)
    console.log(`  ${'─'.repeat(60)}`)
    for (const f of group.slice(0, 15)) {
      const r = f.item.restaurant as any
      console.log(`    ${f.item.name}  |  ${r?.name ?? '?'} @ ${r?.park?.name ?? '?'}`)
    }
    if (group.length > 15) console.log(`    ... and ${group.length - 15} more`)
  }

  // Apply
  if (!DRY_RUN) {
    let success = 0
    for (const f of fixes) {
      const { error } = await sb.from('menu_items').update({ category: f.to }).eq('id', f.item.id)
      if (error) {
        console.error(`  FAILED: ${f.item.name}: ${error.message}`)
      } else {
        success++
      }
    }
    console.log(`\nApplied ${success}/${fixes.length} category fixes`)
  }

  console.log(`\n${'═'.repeat(70)}`)
  console.log(`  SUMMARY: ${fixes.length} category corrections`)
  for (const [key, group] of [...byCat.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`    ${key}: ${group.length}`)
  }
  console.log(`${'═'.repeat(70)}`)
  if (DRY_RUN) console.log('\n  Run with --apply to write changes')
}

main().catch(console.error)
