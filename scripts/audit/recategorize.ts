/**
 * Recategorize mis-tagged menu_items (executes the deferred 2026-05-24 §4
 * category audit). Many gelato / cocktail / milkshake items were bulk-imported
 * as `entree` because the original inferCategory() lacked their keywords.
 *
 * Dry-run by default. `--apply` writes, but ONLY after writing an undo manifest
 * to disk and confirming the Vitest fixtures pass.
 *
 *   npx tsx scripts/audit/recategorize.ts            # dry run + per-rule diff
 *   npx tsx scripts/audit/recategorize.ts --apply    # write (fail-stops on error)
 *
 * The classifier `correctCategory` is pure and exported so the fixtures in
 * __tests__/recategorize.test.ts can assert true/false positives before apply.
 */
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Category = 'entree' | 'snack' | 'beverage' | 'dessert' | 'side'

export interface Recat {
  to: Category
  rule: string
}

// Words that disqualify a beverage/dessert reclassification — they signal the
// item is actually a savory dish that merely *mentions* a drink/sweet word
// (e.g. "wine-braised", "beer-batter", "Coffee Cake"). Charcuterie terms are
// included so cured "Coppa" (pork) is never mistaken for "Coppa" gelato.
const FOOD_CONTEXT =
  /\b(pork|tenderloin|chicken|steak|beef|burger|fries|pasta|tortellini|penne|ravioli|gnocchi|fettuccine|rigatoni|fondue|cauliflower|cr[eê]pe|popcorn|potato|bisque|soup|chowder|pie|brownie|churro|cookie|cake|donut|bread|sandwich|wrap|salad|brine|braised|glazed|rubbed|crusted|marinated|infused|sauce|reduction|compote|vinaigrette|salumi|salami|prosciutto|capicola|capocollo|mortadella|soppressata|charcuterie|antipasto|antipasti|provolone|board|shrimp|ceviche|scallop|lobster|crab|oyster|mussel|calamari|seafood|salmon|tuna|sushi|taco|burrito|quesadilla|nacho|wings|slider|meatball|sausage|bacon|gyro|kebab|falafel|hummus|ramen|noodle|curry|macaron|soft.serve|croissant|parfait|panino|panini|pickle|egg|cream\b(?!\s*soda))/i

/**
 * Returns the corrected category + the rule that fired, or null to leave as-is.
 * Pure: depends only on the item name, its current category, and (optionally)
 * its restaurant name — no DB access — so it is unit-testable.
 */
export function correctCategory(
  name: string,
  current: string,
  restaurantName?: string,
): Recat | null {
  // Strip diacritics so accented names (Tiramisù, Rosé, Crêpe) match plain
  // ASCII patterns and the trailing \b word-boundary behaves.
  const n = name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  const hasFood = FOOD_CONTEXT.test(n)
  const bev = (rule: string): Recat => ({ to: 'beverage', rule })
  const des = (rule: string): Recat => ({ to: 'dessert', rule })

  // ── BEVERAGES mis-tagged (only when no savory food context) ──────────────
  if (/\b(pinot noir|pinot grigio|cabernet|sauvignon blanc|chardonnay|riesling|merlot|malbec|prosecco|champagne|rosé|sangria)\b/i.test(n) && current !== 'beverage' && !hasFood) return bev('wine')
  if (/\b(chianti|barolo|bordeaux|chablis|montepulciano|garnacha)\b/i.test(n) && current !== 'beverage' && !hasFood) return bev('wine-region')
  if (/\b(modelo|corona|heineken|budweiser|stella artois|samuel adams|yuengling|ommegang|strongbow|white claw|truly|high noon|nütrl)\b/i.test(n) && current !== 'beverage' && !hasFood) return bev('beer-brand')
  if (/\b(ipa|pilsner|lager|stout\b(?!\s*cake)|ale\b(?!\s*house)|porter|hefeweizen|shandy|hard seltzer|gose)\b/i.test(n) && current !== 'beverage' && !hasFood) return bev('beer-style')
  if (/\b(tequila|mezcal|bacanora)\b/i.test(n) && current !== 'beverage' && !hasFood && !/sundae|cake|pie|brownie|ice cream/i.test(n)) return bev('spirit')
  if (/\bsake\b/i.test(n) && !/for\s+sake|sake\s+of/i.test(n) && current !== 'beverage' && !hasFood) return bev('sake')
  if (/\b(martini|margarita|mojito|daiquiri|paloma|negroni|moscow mule|mimosa|bellini|cosmopolitan)\b/i.test(n) && current !== 'beverage' && !hasFood) return bev('cocktail')
  if (/\bold fashioned\b/i.test(n) && !/burger|chicken|bbq|pork|beef|fries/i.test(n) && current !== 'beverage' && !hasFood) return bev('cocktail-oldfashioned')
  if (/\bspritz\b/i.test(n) && !/lemon|lime|oil/i.test(n) && current !== 'beverage' && !hasFood) return bev('cocktail-spritz')
  if (/\b(cold brew|espresso|cappuccino|latte|americano|macchiato|frappuccino)\b/i.test(n) && current !== 'beverage' && !hasFood) return bev('coffee')
  if (/\b(hot chocolate)\b/i.test(n) && !/churro|mini|cookie|cake|brownie/i.test(n) && current !== 'beverage') return bev('hot-chocolate')
  if (/\b(smoothie|refresher)\b/i.test(n) && current !== 'beverage' && !hasFood) return bev('smoothie')
  if (/\b(coca.cola|pepsi|sprite|fanta|dr.pepper|mountain dew|powerade|gatorade|dasani|smartwater|mineral water|sparkling water|tonic water|club soda|italian soda)\b/i.test(n) && current !== 'beverage' && !hasFood) return bev('soda')
  if (/\b(tea|iced tea|sweet tea|chai|matcha)\b/i.test(n) && current !== 'beverage' && !hasFood && !/cake|cookie|tea sandwich|tea-smoked|tea smoked/i.test(n)) return bev('tea')
  if (/\b(lemonade|limeade|agua fresca|lassi|horchata)\b/i.test(n) && current !== 'beverage' && !hasFood) return bev('non-alcoholic')
  if (/\b(icee|slush|slushie|boba)\b/i.test(n) && current !== 'beverage' && !hasFood) return bev('frozen-drink')
  if (/\bfrozen\b/i.test(n) && /\b(lemonade|cocktail|margarita|daiquiri|colada|sangria)\b/i.test(n) && current !== 'beverage') return bev('frozen-cocktail')
  if (/\bjuice\b/i.test(n) && !/reduction|glaze|braised|sauce|brined/i.test(n) && current !== 'beverage' && !hasFood) return bev('juice')

  // ── DESSERTS mis-tagged ──────────────────────────────────────────────────
  // Ice-cream family + the gelato terms the old script omitted. Floats / shakes
  // / milkshakes are NO LONGER excluded — they are frozen treats, not entrees.
  if (/\b(scoop|sundae|gelato|gelati|sorbet|sorbetto|ice cream|frozen custard|popsicle|dole whip|affogato|tiramis[uù]|zeppole|cannoli|profiterole|semifreddo|panna cotta|cassata)\b/i.test(n) && current !== 'dessert' && current !== 'beverage' && !hasFood) return des('frozen-or-italian-dessert')
  if (/\b(milkshake|milk shake|float)\b/i.test(n) && current === 'entree' && !hasFood) return des('shake-or-float')
  if (/\bshake\b/i.test(n) && current === 'entree' && !/protein|hand shake|handshake/i.test(n) && !hasFood) return des('shake')
  // "Coppa del Nonno" / "Coppa gelato" are gelato desserts; bare/charcuterie
  // "Coppa" is caught by FOOD_CONTEXT above and intentionally left as entree.
  if (/\bcoppa\s+(del nonno|gelato)\b/i.test(n) && current === 'entree') return des('coppa-gelato')
  if (/\b(caramel apple|candy apple|chocolate bar|cookie pie)\b/i.test(n) && current === 'entree') return des('candy')
  if (/\bfudge\b/i.test(n) && !/cold brew|coffee|latte|shake|drink|topping/i.test(n) && current === 'entree') return des('fudge')
  if (/\b(doughnut|donut)\b/i.test(n) && current === 'entree' && !/burger|sandwich|sushi|chicken|grilled cheese|savory/i.test(n)) return des('doughnut')
  if (current === 'snack' && /\b(dole whip|gelato|sorbet|caramel apple|ganache|fudge|sundae)\b/i.test(n)) return des('snack-to-dessert')

  // NOTE: a restaurant-context rule (gelateria → dessert) was prototyped but
  // removed — it mislabeled vegetables, fruit cups, and section headers sold at
  // creameries as desserts. Park-specific gelato names with no generic keyword
  // (Bronte, Amalfi, …) are a known residual best handled by a curated list.
  void restaurantName

  // ── SIDES / SNACKS mis-tagged as entree ──────────────────────────────────
  if (/^(side|extra)\s/i.test(n) && current === 'entree' && !/refill|freestyle|\bcup\b/i.test(n)) return { to: 'side', rule: 'side-prefix' }
  if (/\b(pretzel bites|donut holes|churro bites)\b/i.test(n) && current === 'entree') return { to: 'snack', rule: 'bites-to-snack' }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI runner (skipped when imported by tests)
// ─────────────────────────────────────────────────────────────────────────────

interface DbItem {
  id: string
  name: string
  category: string
  restaurant: { name: string } | null
}

function makeClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key)
}

async function fetchAll(sb: ReturnType<typeof makeClient>): Promise<DbItem[]> {
  const all: DbItem[] = []
  let from = 0
  const PAGE = 500
  while (true) {
    const { data, error } = await sb
      .from('menu_items')
      .select('id, name, category, restaurant:restaurants(name)')
      .order('id') // stable order — range pagination skips/dupes rows without it
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as unknown as DbItem[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

async function main() {
  const apply = process.argv.includes('--apply')
  const sb = makeClient()

  console.log(apply ? '=== APPLYING category fixes ===' : '=== DRY RUN (pass --apply to write) ===')
  const items = await fetchAll(sb)
  console.log(`Fetched ${items.length} items\n`)

  const fixes = items
    .map(item => {
      const result = correctCategory(item.name, item.category, item.restaurant?.name)
      return result && result.to !== item.category
        ? { id: item.id, name: item.name, from: item.category, to: result.to, rule: result.rule }
        : null
    })
    .filter((f): f is NonNullable<typeof f> => f != null)

  // Per-rule diff so an over-matching rule (one rule moving a huge count) is obvious.
  const byRule = new Map<string, typeof fixes>()
  for (const f of fixes) {
    const key = `${f.rule} (${f.from}→${f.to})`
    if (!byRule.has(key)) byRule.set(key, [])
    byRule.get(key)!.push(f)
  }
  for (const [key, group] of [...byRule.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n  ${key} — ${group.length} items`)
    for (const f of group.slice(0, 12)) console.log(`    • ${f.name}`)
    if (group.length > 12) console.log(`    … and ${group.length - 12} more`)
  }
  console.log(`\n${'═'.repeat(70)}\n  TOTAL: ${fixes.length} corrections across ${byRule.size} rules\n${'═'.repeat(70)}`)

  if (!apply) {
    console.log('\nDry run only. Review the per-rule diff above, then re-run with --apply.')
    return
  }

  // Write the undo manifest BEFORE any write, so a partial/failed apply is reversible.
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const outDir = join(__dirname, '..', '..', 'audit')
  mkdirSync(outDir, { recursive: true })
  const manifestPath = join(outDir, `recategorize-undo-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(manifestPath, JSON.stringify(fixes, null, 2))
  console.log(`\nUndo manifest written: ${manifestPath}`)

  let applied = 0
  for (const f of fixes) {
    const { error } = await sb.from('menu_items').update({ category: f.to }).eq('id', f.id)
    if (error) {
      // Fail-stop: never log-and-continue — leaving an unrecorded partial state.
      console.error(`\nFAILED at ${applied}/${fixes.length} on "${f.name}" (${f.id}): ${error.message}`)
      console.error(`Applied rows are recorded in ${manifestPath} (first ${applied} entries).`)
      process.exit(1)
    }
    applied++
  }
  console.log(`\nApplied ${applied}/${fixes.length} category corrections.`)
}

// Only run the CLI when invoked directly, not when imported by the test file.
const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1]
if (isDirectRun) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
