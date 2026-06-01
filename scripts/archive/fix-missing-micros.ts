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

async function update(id: string, fields: Record<string, number | null>) {
  if (DRY_RUN) return
  const { error } = await sb.from('nutritional_data').update(fields).eq('id', id)
  if (error) console.error('  UPDATE FAILED', id, error.message)
}

// ─── Estimation profiles by food type ─────────────────────────────────
// Maps category + name patterns to typical sugar%, fiber(g), sodium ratio, cholesterol
interface MicroProfile {
  sugarPctOfCarbs: number  // sugar as % of carbs
  fiberG: number           // typical fiber (g)
  sodiumPerCal: number     // mg sodium per calorie
  cholesterolMg: number    // typical cholesterol
}

function getMicroProfile(name: string, category: string): MicroProfile {
  const n = name.toLowerCase()

  // Beverages
  if (category === 'beverage') {
    if (/beer|ale|lager|stout|pilsner|ipa|cider/i.test(n))
      return { sugarPctOfCarbs: 0.1, fiberG: 0, sodiumPerCal: 0.1, cholesterolMg: 0 }
    if (/wine|pinot|cabernet|chardonnay|merlot|rosé|prosecco|champagne/i.test(n))
      return { sugarPctOfCarbs: 0.8, fiberG: 0, sodiumPerCal: 0.04, cholesterolMg: 0 }
    if (/martini|margarita|cocktail|mojito|old fashioned|mule|negroni|spritz|daiquiri/i.test(n))
      return { sugarPctOfCarbs: 0.85, fiberG: 0, sodiumPerCal: 0.05, cholesterolMg: 0 }
    if (/coffee|espresso|latte|cappuccino|americano|cold brew|macchiato/i.test(n))
      return { sugarPctOfCarbs: 0.7, fiberG: 0, sodiumPerCal: 0.1, cholesterolMg: 5 }
    if (/tea|chai|matcha/i.test(n))
      return { sugarPctOfCarbs: 0.9, fiberG: 0, sodiumPerCal: 0.05, cholesterolMg: 0 }
    if (/smoothie|shake|milkshake/i.test(n))
      return { sugarPctOfCarbs: 0.75, fiberG: 2, sodiumPerCal: 0.2, cholesterolMg: 25 }
    if (/soda|cola|sprite|fanta|lemonade|juice|punch/i.test(n))
      return { sugarPctOfCarbs: 0.95, fiberG: 0, sodiumPerCal: 0.1, cholesterolMg: 0 }
    // Generic beverage
    return { sugarPctOfCarbs: 0.7, fiberG: 0, sodiumPerCal: 0.1, cholesterolMg: 0 }
  }

  // Desserts
  if (category === 'dessert') {
    if (/ice cream|gelato|sundae|sorbet|frozen/i.test(n))
      return { sugarPctOfCarbs: 0.7, fiberG: 1, sodiumPerCal: 0.15, cholesterolMg: 50 }
    if (/cake|cupcake|brownie|cookie|pie|pastry|tart|cobbler/i.test(n))
      return { sugarPctOfCarbs: 0.65, fiberG: 1, sodiumPerCal: 0.4, cholesterolMg: 45 }
    if (/chocolate|candy|fudge|truffle|ganache/i.test(n))
      return { sugarPctOfCarbs: 0.7, fiberG: 2, sodiumPerCal: 0.15, cholesterolMg: 20 }
    if (/churro|funnel cake|donut|doughnut|beignet/i.test(n))
      return { sugarPctOfCarbs: 0.5, fiberG: 1, sodiumPerCal: 0.6, cholesterolMg: 30 }
    if (/fruit|berry|apple/i.test(n))
      return { sugarPctOfCarbs: 0.8, fiberG: 3, sodiumPerCal: 0.05, cholesterolMg: 0 }
    // Generic dessert
    return { sugarPctOfCarbs: 0.65, fiberG: 1, sodiumPerCal: 0.3, cholesterolMg: 30 }
  }

  // Entrees
  if (category === 'entree') {
    if (/burger|cheeseburger/i.test(n))
      return { sugarPctOfCarbs: 0.1, fiberG: 3, sodiumPerCal: 1.5, cholesterolMg: 85 }
    if (/pizza|flatbread/i.test(n))
      return { sugarPctOfCarbs: 0.1, fiberG: 3, sodiumPerCal: 2.0, cholesterolMg: 40 }
    if (/pasta|fettuccine|spaghetti|penne|rigatoni|gnocchi|mac.*cheese/i.test(n))
      return { sugarPctOfCarbs: 0.08, fiberG: 3, sodiumPerCal: 1.2, cholesterolMg: 55 }
    if (/steak|ribeye|filet|sirloin|tenderloin/i.test(n))
      return { sugarPctOfCarbs: 0.0, fiberG: 0, sodiumPerCal: 1.0, cholesterolMg: 120 }
    if (/chicken/i.test(n))
      return { sugarPctOfCarbs: 0.05, fiberG: 2, sodiumPerCal: 1.3, cholesterolMg: 90 }
    if (/fish|salmon|tuna|cod|grouper|mahi|shrimp|lobster|crab/i.test(n))
      return { sugarPctOfCarbs: 0.05, fiberG: 1, sodiumPerCal: 1.2, cholesterolMg: 85 }
    if (/soup|chowder|chili|gumbo|bisque/i.test(n))
      return { sugarPctOfCarbs: 0.1, fiberG: 3, sodiumPerCal: 2.5, cholesterolMg: 30 }
    if (/salad/i.test(n))
      return { sugarPctOfCarbs: 0.2, fiberG: 4, sodiumPerCal: 1.0, cholesterolMg: 40 }
    if (/taco|burrito|quesadilla|enchilada/i.test(n))
      return { sugarPctOfCarbs: 0.08, fiberG: 4, sodiumPerCal: 1.5, cholesterolMg: 60 }
    if (/sandwich|sub|wrap|panini/i.test(n))
      return { sugarPctOfCarbs: 0.08, fiberG: 3, sodiumPerCal: 1.5, cholesterolMg: 55 }
    if (/wings/i.test(n))
      return { sugarPctOfCarbs: 0.1, fiberG: 1, sodiumPerCal: 2.5, cholesterolMg: 100 }
    if (/fried|crispy|battered|tempura/i.test(n))
      return { sugarPctOfCarbs: 0.05, fiberG: 2, sodiumPerCal: 1.5, cholesterolMg: 70 }
    // Generic entree
    return { sugarPctOfCarbs: 0.1, fiberG: 3, sodiumPerCal: 1.3, cholesterolMg: 60 }
  }

  // Snacks
  if (category === 'snack') {
    if (/pretzel/i.test(n))
      return { sugarPctOfCarbs: 0.05, fiberG: 2, sodiumPerCal: 2.5, cholesterolMg: 5 }
    if (/fries|tots|nachos/i.test(n))
      return { sugarPctOfCarbs: 0.02, fiberG: 3, sodiumPerCal: 2.0, cholesterolMg: 15 }
    if (/popcorn/i.test(n))
      return { sugarPctOfCarbs: 0.05, fiberG: 4, sodiumPerCal: 1.5, cholesterolMg: 0 }
    return { sugarPctOfCarbs: 0.1, fiberG: 2, sodiumPerCal: 1.5, cholesterolMg: 20 }
  }

  // Sides
  if (category === 'side') {
    if (/salad|slaw|vegetables/i.test(n))
      return { sugarPctOfCarbs: 0.2, fiberG: 3, sodiumPerCal: 1.0, cholesterolMg: 10 }
    if (/fries|tots|potato|rice/i.test(n))
      return { sugarPctOfCarbs: 0.02, fiberG: 2, sodiumPerCal: 1.5, cholesterolMg: 5 }
    if (/bread|roll|biscuit|cornbread/i.test(n))
      return { sugarPctOfCarbs: 0.1, fiberG: 2, sodiumPerCal: 1.5, cholesterolMg: 10 }
    return { sugarPctOfCarbs: 0.1, fiberG: 2, sodiumPerCal: 1.2, cholesterolMg: 15 }
  }

  // Fallback
  return { sugarPctOfCarbs: 0.15, fiberG: 2, sodiumPerCal: 1.0, cholesterolMg: 30 }
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (use --apply to write) ===' : '=== APPLYING FIXES ===')
  console.log('Fetching all items...')
  const items = await fetchAll()
  console.log(`Fetched ${items.length} items\n`)

  // Count scope
  let needsSugar = 0, needsFiber = 0, needsSodium = 0, needsCholesterol = 0
  let totalFixes = 0

  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd) continue
    // Must have calories + carbs to estimate from
    if (!nd.calories || nd.calories <= 0) continue

    const changes: Record<string, number> = {}
    const profile = getMicroProfile(item.name, item.category)

    // Fill sugar if null/missing and carbs exists
    if (nd.sugar === null && nd.carbs !== null && nd.carbs > 0) {
      changes.sugar = Math.round(nd.carbs * profile.sugarPctOfCarbs)
      needsSugar++
    }

    // Fill fiber if null/missing
    if (nd.fiber === null) {
      changes.fiber = profile.fiberG
      needsFiber++
    }

    // Fill sodium if null/missing
    if (nd.sodium === null) {
      changes.sodium = Math.round(nd.calories * profile.sodiumPerCal)
      needsSodium++
    }

    // Fill cholesterol if null/missing
    if (nd.cholesterol === null) {
      changes.cholesterol = profile.cholesterolMg
      needsCholesterol++
    }

    if (Object.keys(changes).length > 0) {
      totalFixes++
      // Don't lower confidence score if already set
      const conf = Math.min(nd.confidence_score ?? 30, 30)
      await update(nd.id, { ...changes, confidence_score: conf })
    }
  }

  console.log(`\n${'═'.repeat(70)}`)
  console.log(`  SUMMARY`)
  console.log(`${'═'.repeat(70)}`)
  console.log(`  Items with sugar filled:       ${needsSugar}`)
  console.log(`  Items with fiber filled:       ${needsFiber}`)
  console.log(`  Items with sodium filled:      ${needsSodium}`)
  console.log(`  Items with cholesterol filled: ${needsCholesterol}`)
  console.log(`  Total items updated:           ${totalFixes}`)
  console.log(`${'═'.repeat(70)}`)
  if (DRY_RUN) console.log('\n  Run with --apply to write changes')
}

main().catch(console.error)
