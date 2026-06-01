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

async function updateNut(id: string, fields: Record<string, number | string | null>) {
  if (DRY_RUN) return
  const { error } = await sb.from('nutritional_data').update(fields).eq('id', id)
  if (error) console.error(`  UPDATE FAILED ${id}:`, error.message)
}

async function updateItem(id: string, fields: Record<string, string>) {
  if (DRY_RUN) return
  const { error } = await sb.from('menu_items').update(fields).eq('id', id)
  if (error) console.error(`  ITEM UPDATE FAILED ${id}:`, error.message)
}

// ─── Phase 1: Sugar > Carbs ──────────────────────────────────────────
function fixSugarCarbs(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number> }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number> }[] = []
  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd || nd.sugar === null || nd.carbs === null) continue
    if (nd.sugar <= nd.carbs) continue

    // Total carbs must be >= sugar + fiber
    const fiber = nd.fiber ?? 0
    const newCarbs = nd.sugar + fiber
    fixes.push({ item, nd, changes: { carbs: newCarbs } })
  }
  return fixes
}

// ─── Phase 2: Low Protein on Meat Items ──────────────────────────────
function fixLowProteinMeat(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number> }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number> }[] = []
  const meatPattern = /filet mignon|ribeye|rib.?eye|tenderloin|sirloin|steak|chicken|pork|beef|lamb|veal|turkey|duck|bison|wagyu/i
  // Exclude plant-based "steaks" and other false positives
  const plantExclude = /cauliflower|mushroom|portobello|tofu|seitan|jackfruit|beyond|impossible|vegan|vegetable/i

  for (const item of items) {
    if (item.category !== 'entree') continue
    const nd = item.nutritional_data?.[0]
    if (!nd || !nd.calories || nd.calories <= 0) continue
    if (!meatPattern.test(item.name)) continue
    if (plantExclude.test(item.name)) continue

    const proteinPct = ((nd.protein ?? 0) * 4) / nd.calories
    if (proteinPct >= 0.15) continue // at least 15% is acceptable

    // Meat entrees should have ~25% cal from protein
    const targetProtein = Math.round((nd.calories * 0.25) / 4)
    if (targetProtein <= (nd.protein ?? 0)) continue

    // Recalculate: increase protein, keep fat, adjust carbs to maintain calorie balance
    const currentCal = nd.calories
    const newProtein = targetProtein
    const fat = nd.fat ?? Math.round((currentCal * 0.38) / 9)
    // Remaining cal to carbs
    const remainingCal = currentCal - (newProtein * 4) - (fat * 9)
    const newCarbs = Math.max(0, Math.round(remainingCal / 4))

    const changes: Record<string, number> = { protein: newProtein }
    if (nd.carbs !== null && Math.abs(newCarbs - nd.carbs) > 5) {
      changes.carbs = newCarbs
      // Ensure sugar <= carbs
      if (nd.sugar !== null && nd.sugar > newCarbs) {
        changes.sugar = Math.round(newCarbs * 0.08)
      }
    }

    fixes.push({ item, nd, changes })
  }
  return fixes
}

// ─── Phase 3: Low Fat on Fried Items ─────────────────────────────────
function fixLowFatFried(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number> }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number> }[] = []
  const friedPattern = /fried|fritter|arancini|empanada|crispy|battered|tempura|croquette|karaage|tonkatsu/i

  for (const item of items) {
    if (item.category === 'beverage') continue
    const nd = item.nutritional_data?.[0]
    if (!nd || !nd.calories || nd.calories <= 0) continue

    const isFried = item.is_fried || friedPattern.test(item.name)
    if (!isFried) continue

    const fatPct = ((nd.fat ?? 0) * 9) / nd.calories
    if (fatPct >= 0.22) continue // at least 22% is ok for fried

    // Fried items should have ~40% cal from fat
    const targetFat = Math.round((nd.calories * 0.40) / 9)
    if (targetFat <= (nd.fat ?? 0)) continue

    // Recalculate: increase fat, adjust carbs to maintain calorie balance
    const currentCal = nd.calories
    const newFat = targetFat
    const protein = nd.protein ?? Math.round((currentCal * 0.20) / 4)
    const remainingCal = currentCal - (protein * 4) - (newFat * 9)
    const newCarbs = Math.max(0, Math.round(remainingCal / 4))

    const changes: Record<string, number> = { fat: newFat }
    if (nd.carbs !== null && Math.abs(newCarbs - nd.carbs) > 5) {
      changes.carbs = newCarbs
      if (nd.sugar !== null && nd.sugar > newCarbs) {
        changes.sugar = Math.round(newCarbs * 0.08)
      }
    }

    fixes.push({ item, nd, changes })
  }
  return fixes
}

// ─── Phase 4: Miscategorized Items ───────────────────────────────────
function fixMiscategorized(items: Item[]): { item: Item; from: string; to: string }[] {
  const fixes: { item: Item; from: string; to: string }[] = []
  for (const item of items) {
    const n = item.name.toLowerCase()

    // Items wrongly in dessert that are savory
    if (item.category === 'dessert') {
      if (/potsticker|dumpling|gyoza/i.test(n)) {
        fixes.push({ item, from: 'dessert', to: 'snack' })
      } else if (/shepherd.*pie|pasty pie|cottage pie/i.test(n)) {
        fixes.push({ item, from: 'dessert', to: 'entree' })
      } else if (/karaage|gee pie|chicken/i.test(n) && !/cake|cookie|cream|chocolate/i.test(n)) {
        fixes.push({ item, from: 'dessert', to: 'entree' })
      } else if (/macadamia nut pancake/i.test(n)) {
        // Pancakes are breakfast, not dessert — but entree is our closest category
        fixes.push({ item, from: 'dessert', to: 'entree' })
      }
    }
  }
  return fixes
}

// ─── Phase 5: Sodium Anomalies ───────────────────────────────────────
function fixSodiumAnomalies(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number> }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number> }[] = []

  for (const item of items) {
    if (item.category === 'beverage') continue
    const nd = item.nutritional_data?.[0]
    if (!nd || !nd.calories || nd.calories <= 0 || nd.sodium === null) continue

    const n = item.name.toLowerCase()
    const ratio = nd.sodium / nd.calories

    // Max acceptable sodium:calorie ratio by food type
    let maxRatio = 4.0
    if (/soup|chowder|chili|gumbo|bisque|broth/i.test(n)) maxRatio = 5.0
    if (/wings|buffalo/i.test(n)) maxRatio = 4.5
    if (/pretzel/i.test(n)) maxRatio = 5.0
    if (/ramen|pho|noodle soup/i.test(n)) maxRatio = 5.5

    // Fix extremely high sodium (ratio > max AND absolute > 3000mg)
    if (ratio > maxRatio && nd.sodium > 3000) {
      // Typical ratio for this food type
      let typicalRatio = 1.5
      if (/soup|chowder|chili|gumbo|bisque|broth/i.test(n)) typicalRatio = 3.0
      if (/wings|buffalo/i.test(n)) typicalRatio = 2.5
      if (/pizza|flatbread/i.test(n)) typicalRatio = 2.0
      if (/pretzel/i.test(n)) typicalRatio = 2.5
      if (/burger/i.test(n)) typicalRatio = 1.5
      if (/ramen|pho/i.test(n)) typicalRatio = 3.5

      const newSodium = Math.round(nd.calories * typicalRatio)
      fixes.push({ item, nd, changes: { sodium: newSodium } })
      continue
    }

    // Fix suspiciously low sodium for savory entrees (< 50mg for items > 300 cal)
    if (item.category === 'entree' && nd.calories > 300 && nd.sodium < 50) {
      // Skip items that are actually beverages/desserts miscategorized as entrees
      if (/beer|ale|lager|stout|wine|pinot|cabernet|chardonnay|merlot|sake|whisky|whiskey|bourbon|rum|vodka|tequila|gin|cocktail|martini|margarita|mojito|negroni|spritz|mule|daiquiri|paloma|bellini|mimosa|sangria|prosecco|champagne/i.test(n)) continue
      if (/cold brew|espresso|latte|cappuccino|coffee|tea|chai|matcha|smoothie|milkshake|shake|juice|soda|lemonade|refresher|freeze|frozen.*drink|butterbeer/i.test(n)) continue
      if (/crème brûlée|creme brulee|mousse|semifreddo|semi freddo|panna cotta|tiramisu|gelato|sorbet|ice cream|sundae|brownie|cookie|cake|pie|churro|doughnut|donut|cannoli|ganache|fudge|truffle|macaron|profiterole|croquembouche|crepe|mochi/i.test(n)) continue
      if (/peanuts|nuts|popcorn|chips|pretzel/i.test(n)) continue // snacks, not entrees
      if (/milkshake|bowl.*acai|bowl.*pitaya|yogurt/i.test(n)) continue // bowls/shakes
      if (/salad|fruit|plain|steamed/i.test(n)) continue

      // Must look like an actual savory entree
      const savoryPattern = /burger|sandwich|steak|filet|chicken|pork|beef|fish|salmon|shrimp|lobster|pasta|pizza|taco|burrito|wrap|rice|noodle|curry|soup|chili|wings/i
      if (!savoryPattern.test(n)) continue

      let typicalSodium = Math.round(nd.calories * 1.2)
      if (/steak|filet|ribeye/i.test(n)) typicalSodium = Math.round(nd.calories * 0.8)
      if (/fried|crispy/i.test(n)) typicalSodium = Math.round(nd.calories * 1.5)

      fixes.push({ item, nd, changes: { sodium: typicalSodium } })
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

  // ─── Phase 1: Sugar > Carbs ─────────────────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log('  PHASE 1: Sugar > Carbs')
  console.log(`${'═'.repeat(70)}`)
  const sugarFixes = fixSugarCarbs(items)
  for (const f of sugarFixes) {
    const r = f.item.restaurant as any
    console.log(`  ✓ ${f.item.name} | ${r?.name ?? '?'}`)
    console.log(`    sugar=${f.nd.sugar}g, carbs=${f.nd.carbs}→${f.changes.carbs}g (fiber=${f.nd.fiber ?? 0}g)`)
    await updateNut(f.nd.id, f.changes)
    fixedIds.add(f.nd.id)
  }
  console.log(`  → ${sugarFixes.length} items fixed\n`)

  // ─── Phase 2: Low Protein on Meat ──────────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log('  PHASE 2: Low Protein on Meat Items')
  console.log(`${'═'.repeat(70)}`)
  const proteinFixes = fixLowProteinMeat(items).filter(f => !fixedIds.has(f.nd.id))
  for (const f of proteinFixes) {
    const r = f.item.restaurant as any
    console.log(`  ✓ ${f.item.name} | ${r?.name ?? '?'}`)
    console.log(`    protein=${f.nd.protein}→${f.changes.protein}g${f.changes.carbs !== undefined ? `, carbs=${f.nd.carbs}→${f.changes.carbs}g` : ''}`)
    await updateNut(f.nd.id, f.changes)
    fixedIds.add(f.nd.id)
  }
  console.log(`  → ${proteinFixes.length} items fixed\n`)

  // ─── Phase 3: Low Fat on Fried Items ──────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log('  PHASE 3: Low Fat on Fried Items')
  console.log(`${'═'.repeat(70)}`)
  const fatFixes = fixLowFatFried(items).filter(f => !fixedIds.has(f.nd.id))
  for (const f of fatFixes) {
    const r = f.item.restaurant as any
    console.log(`  ✓ ${f.item.name} | ${r?.name ?? '?'}`)
    console.log(`    fat=${f.nd.fat}→${f.changes.fat}g${f.changes.carbs !== undefined ? `, carbs=${f.nd.carbs}→${f.changes.carbs}g` : ''}`)
    await updateNut(f.nd.id, f.changes)
    fixedIds.add(f.nd.id)
  }
  console.log(`  → ${fatFixes.length} items fixed\n`)

  // ─── Phase 4: Category Fixes ──────────────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log('  PHASE 4: Miscategorized Items')
  console.log(`${'═'.repeat(70)}`)
  const catFixes = fixMiscategorized(items)
  for (const f of catFixes) {
    const r = f.item.restaurant as any
    console.log(`  ✓ ${f.item.name} | ${f.from} → ${f.to} | ${r?.name ?? '?'}`)
    await updateItem(f.item.id, { category: f.to })
  }
  console.log(`  → ${catFixes.length} items recategorized\n`)

  // ─── Phase 5: Sodium Anomalies ────────────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log('  PHASE 5: Sodium Anomalies')
  console.log(`${'═'.repeat(70)}`)
  const sodiumFixes = fixSodiumAnomalies(items).filter(f => !fixedIds.has(f.nd.id))
  for (const f of sodiumFixes) {
    const r = f.item.restaurant as any
    console.log(`  ✓ ${f.item.name} | ${r?.name ?? '?'}`)
    console.log(`    sodium=${f.nd.sodium}→${f.changes.sodium}mg (cal=${f.nd.calories})`)
    await updateNut(f.nd.id, f.changes)
    fixedIds.add(f.nd.id)
  }
  console.log(`  → ${sodiumFixes.length} items fixed\n`)

  // ─── Summary ──────────────────────────────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log(`  SUMMARY`)
  console.log(`${'═'.repeat(70)}`)
  console.log(`  Sugar > carbs:     ${sugarFixes.length}`)
  console.log(`  Low protein meat:  ${proteinFixes.length}`)
  console.log(`  Low fat fried:     ${fatFixes.length}`)
  console.log(`  Miscategorized:    ${catFixes.length}`)
  console.log(`  Sodium anomalies:  ${sodiumFixes.length}`)
  console.log(`  TOTAL:             ${sugarFixes.length + proteinFixes.length + fatFixes.length + catFixes.length + sodiumFixes.length}`)
  console.log(`${'═'.repeat(70)}`)
  if (DRY_RUN) console.log('\n  Run with --apply to write changes')
}

main().catch(console.error)
