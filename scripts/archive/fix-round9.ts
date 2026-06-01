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
  restaurant: { name: string; park: { name: string } }
  nutritional_data: NutRow[]
}

async function fetchAll(): Promise<Item[]> {
  const all: Item[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from('menu_items')
      .select('id, name, category, description, restaurant:restaurants(name, park:parks(name)), nutritional_data(id, menu_item_id, calories, carbs, fat, sugar, protein, fiber, sodium, cholesterol, source, confidence_score)')
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
  return `${r?.name ?? '?'} @ ${r?.park?.name ?? '?'}`
}

// ─── Fix Definitions ─────────────────────────────────────────────

interface Fix {
  // Match criteria
  namePattern: RegExp
  restaurantPattern?: RegExp
  // Additional match criteria on current nutrition
  currentCal?: (cal: number) => boolean
  // New nutrition values
  values: {
    calories: number
    carbs: number
    fat: number
    protein: number
    sugar?: number
    fiber?: number
    sodium?: number
    cholesterol?: number
  }
  reason: string
}

const fixes: Fix[] = [
  // --- Fruit plates with grossly inflated values ---
  // Fresh Fruit Cups at 550/569 cal — should be ~100 cal for a small cup of fruit
  {
    namePattern: /^Fresh Fruit Cup$/i,
    currentCal: (c) => c > 400,
    values: { calories: 100, carbs: 25, fat: 0, protein: 1, sugar: 20, fiber: 3, sodium: 5 },
    reason: 'Fresh fruit cup over-estimated (550-569 cal → 100 cal)'
  },
  // Fresh Fruit Salad at 872 cal — should be ~120 for a fruit salad
  {
    namePattern: /^Fresh Fruit Salad$/i,
    currentCal: (c) => c > 400,
    values: { calories: 120, carbs: 30, fat: 0, protein: 1, sugar: 24, fiber: 4, sodium: 5 },
    reason: 'Fresh fruit salad over-estimated (872 cal → 120 cal)'
  },
  // Fruit Cup with 31g fat — bad USDA match (fruit doesn't have fat)
  {
    namePattern: /^(Seasonal )?Fruit Cup$/i,
    currentCal: (c) => c > 400,
    values: { calories: 80, carbs: 20, fat: 0, protein: 1, sugar: 16, fiber: 2, sodium: 5 },
    reason: 'Fruit cup bad USDA match (515 cal, 31g fat → 80 cal, 0g fat)'
  },
  // Tropical Fruit Salad at 29 cal — too low
  {
    namePattern: /^Tropical Fruit Salad/i,
    currentCal: (c) => c < 50,
    values: { calories: 90, carbs: 22, fat: 0, protein: 1, sugar: 18, fiber: 3, sodium: 5 },
    reason: 'Tropical fruit salad under-estimated (29 cal → 90 cal)'
  },

  // --- Cocktails with bad USDA protein match ---
  // Fire & Strongbow Cocktail at 99 cal with 13g protein — cocktails don't have protein
  {
    namePattern: /Fire.*Strongbow Cocktail|Strongbow.*Cocktail/i,
    values: { calories: 150, carbs: 12, fat: 0, protein: 0, sugar: 10, sodium: 5 },
    reason: 'Cocktail bad USDA match (13g protein → 0g, adjust cal for alcohol)'
  },
  // Generic "Cocktail" with same bad data
  {
    namePattern: /^Cocktail$/i,
    currentCal: (c) => c >= 90 && c <= 110,
    values: { calories: 150, carbs: 12, fat: 0, protein: 0, sugar: 10, sodium: 5 },
    reason: 'Generic cocktail bad USDA match (13g protein → 0g)'
  },
  // Orangello Cocktail same issue
  {
    namePattern: /^Orangello Cocktail$/i,
    values: { calories: 160, carbs: 14, fat: 0, protein: 0, sugar: 12, sodium: 5 },
    reason: 'Cocktail bad USDA match (13g protein → 0g)'
  },
  // Cocktail Flight — same issue
  {
    namePattern: /^Cocktail Flight$/i,
    values: { calories: 300, carbs: 24, fat: 0, protein: 0, sugar: 20, sodium: 10 },
    reason: 'Cocktail flight bad USDA match (13g protein → 0g, 3-4 cocktails)'
  },

  // --- Clearly wrong individual items ---
  // Side Caesar Salad at 20 cal — way too low
  {
    namePattern: /^Side Caesar Salad/i,
    currentCal: (c) => c < 50,
    values: { calories: 180, carbs: 8, fat: 14, protein: 6, sugar: 2, fiber: 2, sodium: 350 },
    reason: 'Side caesar salad under-estimated (20 cal → 180 cal)'
  },
  // Pizza Margarita at 122 cal with 0g fat — impossible for pizza
  {
    namePattern: /^Pizza Margar/i,
    currentCal: (c) => c < 200,
    values: { calories: 550, carbs: 60, fat: 20, protein: 22, sugar: 5, fiber: 3, sodium: 1000 },
    reason: 'Pizza Margarita bad USDA match (122 cal, 0g fat → 550 cal)'
  },
  // Lychee Ice Cream at 66 cal with 0g fat — too low for ice cream
  {
    namePattern: /^Lychee Ice Cream$/i,
    currentCal: (c) => c < 100,
    values: { calories: 250, carbs: 35, fat: 10, protein: 3, sugar: 28, fiber: 0, sodium: 50 },
    reason: 'Lychee ice cream under-estimated (66 cal → 250 cal)'
  },
  // Cookie Bite Bag at 140 cal with 0g fat — cookies always have fat
  {
    namePattern: /^Cookie Bite Bag$/i,
    values: { calories: 350, carbs: 45, fat: 18, protein: 4, sugar: 28, fiber: 1, sodium: 200 },
    reason: 'Cookie bite bag bad data (0g fat → 18g fat, 140→350 cal)'
  },
  // Filet 6 oz at 282 cal with 26g carbs — a filet steak has ~0 carbs and high protein
  {
    namePattern: /^Filet 6 oz$/i,
    values: { calories: 420, carbs: 0, fat: 22, protein: 52, sugar: 0, fiber: 0, sodium: 600, cholesterol: 150 },
    reason: 'Filet 6oz bad USDA match (26g carbs, 11g protein → 0g carbs, 52g protein)'
  },
  // Burrito at 212 cal with 4g fat — too low for a burrito
  {
    namePattern: /^Burrito$/i,
    restaurantPattern: /Moe's/i,
    currentCal: (c) => c < 300,
    values: { calories: 550, carbs: 65, fat: 20, protein: 22, sugar: 5, fiber: 8, sodium: 1200 },
    reason: 'Burrito under-estimated (212 cal, 4g fat → 550 cal)'
  },
  // Iron Horse Garlic Pretzel Bread Sticks — 0g carbs, 21g protein (impossible for bread)
  {
    namePattern: /Iron Horse Garlic Pretzel/i,
    values: { calories: 350, carbs: 55, fat: 10, protein: 8, sugar: 3, fiber: 2, sodium: 800 },
    reason: 'Pretzel bread sticks bad data (0g carbs → 55g carbs)'
  },
  // Mother's Little Helper — this is a cocktail, not a kids meal (1350 cal, 91g protein)
  {
    namePattern: /Mother[\u2018\u2019'']?s Little Helper/i,
    currentCal: (c) => c > 1000,
    values: { calories: 180, carbs: 15, fat: 0, protein: 0, sugar: 12, sodium: 5 },
    reason: 'Cocktail miscategorized — reduce from 1350 cal food values to cocktail'
  },
  // Soft Serve with 14g protein — soft serve typically has 3-5g
  // Also 550 cal is high for a cup
  {
    namePattern: /^Soft Serve Ice Cream Cup/i,
    currentCal: (c) => c > 400,
    values: { calories: 300, carbs: 45, fat: 12, protein: 5, sugar: 35, fiber: 0, sodium: 120 },
    reason: 'Soft serve cup over-estimated (550 cal, 14g protein → 300 cal, 5g protein)'
  },
  {
    namePattern: /^Soft Serve Sundae/i,
    currentCal: (c) => c > 400,
    values: { calories: 400, carbs: 55, fat: 16, protein: 6, sugar: 42, fiber: 1, sodium: 150 },
    reason: 'Soft serve sundae over-estimated (550 cal → 400 cal with toppings)'
  },
  {
    namePattern: /^Soft Serve Waffle Cone$/i,
    currentCal: (c) => c > 400,
    values: { calories: 380, carbs: 50, fat: 16, protein: 6, sugar: 35, fiber: 1, sodium: 130 },
    reason: 'Soft serve waffle cone over-estimated (550 cal → 380 cal)'
  },
  // Orange Bird Float and Hand-spun Soft Serve with 35g protein — bad data
  {
    namePattern: /Orange Bird Float/i,
    currentCal: (c) => c > 400,
    values: { calories: 350, carbs: 55, fat: 12, protein: 4, sugar: 45, fiber: 1, sodium: 80 },
    reason: 'Dole Whip float bad data (35g protein → 4g, 600→350 cal)'
  },
  {
    namePattern: /^Hand-spun Soft Serve$/i,
    currentCal: (c) => c > 400,
    values: { calories: 350, carbs: 48, fat: 14, protein: 5, sugar: 38, fiber: 0, sodium: 120 },
    reason: 'Hand-spun soft serve bad data (35g protein → 5g, 600→350 cal)'
  },
  // Kids burgers at 1020-1040 — way too high for kids portions
  {
    namePattern: /Kids.*Diz Kid Burger/i,
    values: { calories: 480, carbs: 30, fat: 26, protein: 24, sugar: 5, fiber: 2, sodium: 700 },
    reason: 'Kids burger over-estimated (1020 cal → 480 cal)'
  },
  {
    namePattern: /^Mini Burger$/i,
    restaurantPattern: /Toothsome/i,
    currentCal: (c) => c > 800,
    values: { calories: 450, carbs: 28, fat: 24, protein: 22, sugar: 4, fiber: 2, sodium: 650 },
    reason: 'Mini burger over-estimated (1040 cal → 450 cal)'
  },
]

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (use --apply to write) ===' : '=== APPLYING ROUND 9 FIXES ===')
  console.log('Fetching all items...')
  const items = await fetchAll()
  console.log(`Fetched ${items.length} items\n`)

  let applied = 0
  let skipped = 0

  for (const fix of fixes) {
    // Find matching items
    const matches = items.filter(item => {
      if (!fix.namePattern.test(item.name)) return false
      if (fix.restaurantPattern) {
        const rName = (item.restaurant as any)?.name ?? ''
        if (!fix.restaurantPattern.test(rName)) return false
      }
      const nd = item.nutritional_data?.[0]
      if (!nd) return false
      if (fix.currentCal && !fix.currentCal(nd.calories ?? 0)) return false
      // Skip official data
      if ((nd.confidence_score ?? 0) >= 85 && nd.source === 'official') return false
      return true
    })

    if (matches.length === 0) {
      console.log(`  ○ No match: ${fix.namePattern.source} — ${fix.reason}`)
      skipped++
      continue
    }

    for (const item of matches) {
      const nd = item.nutritional_data[0]
      console.log(`  ✓ ${item.name} | ${loc(item)}`)
      console.log(`    ${fix.reason}`)
      console.log(`    Before: cal=${nd.calories}, C=${nd.carbs}g, F=${nd.fat}g, P=${nd.protein}g`)
      console.log(`    After:  cal=${fix.values.calories}, C=${fix.values.carbs}g, F=${fix.values.fat}g, P=${fix.values.protein}g`)

      const fields: Record<string, number | null> = {
        calories: fix.values.calories,
        carbs: fix.values.carbs,
        fat: fix.values.fat,
        protein: fix.values.protein,
        confidence_score: 40,
      }
      if (fix.values.sugar !== undefined) fields.sugar = fix.values.sugar
      if (fix.values.fiber !== undefined) fields.fiber = fix.values.fiber
      if (fix.values.sodium !== undefined) fields.sodium = fix.values.sodium
      if (fix.values.cholesterol !== undefined) fields.cholesterol = fix.values.cholesterol

      await updateNut(nd.id, fields)
      applied++
    }
  }

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  SUMMARY: ${applied} items fixed, ${skipped} patterns with no match`)
  console.log(`${'═'.repeat(60)}`)
  if (DRY_RUN) console.log('\n  Run with --apply to write changes')
}

main().catch(console.error)
