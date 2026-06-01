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
  namePattern: RegExp
  restaurantPattern?: RegExp
  parkPattern?: RegExp
  currentCal?: (cal: number) => boolean
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
  // === CALORIC MATH ERRORS ===
  {
    namePattern: /^High Noon$/i,
    restaurantPattern: /Watering Hole/i,
    values: { calories: 100, carbs: 3, fat: 0, protein: 0, sugar: 2, sodium: 0 },
    reason: 'High Noon hard seltzer: fix bad USDA match (P=10, F=18 → 0)',
  },
  {
    namePattern: /Honey Pilsner/i,
    restaurantPattern: /Ice Cream.*Cart/i,
    values: { calories: 165, carbs: 13, fat: 0, protein: 2, sugar: 0, sodium: 15 },
    reason: 'Honey pilsner: fix impossible 44g fat → 0g (beer has no fat)',
  },

  // === KIDS MEALS TOO HIGH ===
  {
    namePattern: /Kids Bowl.*Chicken.*Rice/i,
    restaurantPattern: /Satu.li/i,
    currentCal: (cal) => cal > 800,
    values: { calories: 400, carbs: 48, fat: 10, protein: 30, sugar: 4, fiber: 3, sodium: 650 },
    reason: 'Disney kids bowl: 946→400 cal (Disney kids meals cap at ~600)',
  },
  {
    namePattern: /Kids Chicken Tenders$/i,
    restaurantPattern: /Black Tap/i,
    currentCal: (cal) => cal > 700,
    values: { calories: 420, carbs: 30, fat: 22, protein: 22, sugar: 2, fiber: 1, sodium: 700 },
    reason: 'Kids tenders: 765→420 cal (comparable chains: 340-475)',
  },
  {
    namePattern: /Kids Grilled Cheese$/i,
    restaurantPattern: /Black Tap/i,
    currentCal: (cal) => cal > 1000,
    values: { calories: 480, carbs: 42, fat: 24, protein: 18, sugar: 4, fiber: 2, sodium: 850 },
    reason: 'Kids grilled cheese: 1131→480 cal (157g carbs was absurd)',
  },
  {
    namePattern: /Kids Hot Dog$/i,
    restaurantPattern: /Black Tap/i,
    currentCal: (cal) => cal > 600,
    values: { calories: 400, carbs: 35, fat: 22, protein: 14, sugar: 5, fiber: 2, sodium: 900 },
    reason: 'Kids hot dog: 680→400 cal (comparable: Freddy\'s 410)',
  },
  {
    namePattern: /Kids Cheeseburger$/i,
    restaurantPattern: /Yak.*Yeti/i,
    currentCal: (cal) => cal > 800,
    values: { calories: 480, carbs: 38, fat: 24, protein: 24, sugar: 6, fiber: 2, sodium: 750 },
    reason: 'Kids cheeseburger: 900→480 cal (Disney kids meals cap at ~600)',
  },
  {
    namePattern: /Kids Cheese Pizza$/i,
    restaurantPattern: /Dockside Pizza/i,
    currentCal: (cal) => cal > 700,
    values: { calories: 380, carbs: 42, fat: 14, protein: 16, sugar: 4, fiber: 2, sodium: 650 },
    reason: 'Kids pizza: 850→380 cal (1-2 small slices at SeaWorld)',
  },

  // === PLATTERS/COMBOS TOO LOW (nutrition was for main item only, not full combo) ===
  {
    namePattern: /Traditional Gyro Platter/i,
    restaurantPattern: /Fire Eater/i,
    currentCal: (cal) => cal < 300,
    values: { calories: 750, carbs: 65, fat: 32, protein: 30, sugar: 5, fiber: 4, sodium: 1200 },
    reason: 'Gyro platter: 184→750 cal (was just the meat, not full platter with pita+sides)',
  },
  {
    namePattern: /Antipasto Platter/i,
    restaurantPattern: /Trattoria del Porto/i,
    currentCal: (cal) => cal < 400,
    values: { calories: 650, carbs: 25, fat: 45, protein: 30, sugar: 3, fiber: 3, sodium: 1800 },
    reason: 'Antipasto platter: 291→650 cal (meats+cheeses+olives+bread)',
  },
  {
    namePattern: /Wilson.*Reuben Platter/i,
    restaurantPattern: /Blondie/i,
    currentCal: (cal) => cal < 400,
    values: { calories: 950, carbs: 75, fat: 50, protein: 40, sugar: 8, fiber: 5, sodium: 2200 },
    reason: 'Reuben platter: 282→950 cal (sandwich+fries; comparable: Beef O\'Brady\'s 1240)',
  },
  {
    namePattern: /Chicken Parmesan Combo/i,
    restaurantPattern: /Cafe 4/i,
    currentCal: (cal) => cal < 400,
    values: { calories: 1000, carbs: 100, fat: 40, protein: 45, sugar: 12, fiber: 6, sodium: 1800 },
    reason: 'Chicken parm combo: 204→1000 cal (includes pasta+breadstick+salad)',
  },
  {
    namePattern: /Chili Cheese Dog Combo/i,
    restaurantPattern: /Fire Eater/i,
    currentCal: (cal) => cal < 400,
    values: { calories: 800, carbs: 65, fat: 42, protein: 25, sugar: 8, fiber: 3, sodium: 1600 },
    reason: 'Chili dog combo: 202→800 cal (dog+fries+treat)',
  },
  {
    namePattern: /Chili Cheese Dog Platter/i,
    restaurantPattern: /Fire Eater/i,
    currentCal: (cal) => cal < 400,
    values: { calories: 700, carbs: 55, fat: 38, protein: 22, sugar: 6, fiber: 3, sodium: 1500 },
    reason: 'Chili dog platter: 202→700 cal (dog+fries, no treat)',
  },
  {
    namePattern: /Jumbo Veggie Slice Combo/i,
    restaurantPattern: /Cafe 4/i,
    currentCal: (cal) => cal < 400,
    values: { calories: 650, carbs: 78, fat: 24, protein: 20, sugar: 8, fiber: 5, sodium: 1200 },
    reason: 'Veggie slice combo: 224→650 cal (slice+breadstick+salad)',
  },
  {
    namePattern: /Jumbo Veggie Slice Platter/i,
    restaurantPattern: /Cafe 4/i,
    currentCal: (cal) => cal < 200,
    values: { calories: 500, carbs: 60, fat: 20, protein: 16, sugar: 6, fiber: 4, sodium: 1000 },
    reason: 'Veggie slice platter: 116→500 cal (slice+side)',
  },

  // === SAMPLERS ===
  {
    namePattern: /Supersaurus Sampler/i,
    restaurantPattern: /T-REX/i,
    currentCal: (cal) => cal < 400,
    values: { calories: 1800, carbs: 120, fat: 100, protein: 80, sugar: 15, fiber: 6, sodium: 3500 },
    reason: 'Supersaurus Sampler: 250→1800 cal (shareable: meatballs+wings+queso+flatbread+mozz sticks)',
  },
  {
    namePattern: /Imperial Sampler/i,
    restaurantPattern: /Rose.*Crown/i,
    currentCal: (cal) => cal < 300,
    values: { calories: 320, carbs: 30, fat: 0, protein: 3, sugar: 0, sodium: 20 },
    reason: 'Imperial Sampler: 240→320 cal (4 beer samples ≈ 20oz total)',
  },

  // === FISH ENTREES ===
  {
    namePattern: /Pan-seared Sustainable Fish/i,
    restaurantPattern: /Sebastian.*Bistro/i,
    currentCal: (cal) => cal < 250,
    values: { calories: 450, carbs: 25, fat: 18, protein: 35, sugar: 4, fiber: 3, sodium: 650 },
    reason: 'Fish entree: 187→450 cal (full entree with sauce+sides)',
  },
  {
    namePattern: /Blackened Catfish/i,
    restaurantPattern: /Tiana/i,
    currentCal: (cal) => cal < 250,
    values: { calories: 500, carbs: 30, fat: 22, protein: 35, sugar: 3, fiber: 3, sodium: 800 },
    reason: 'Catfish entree: 152→500 cal (cruise dinner entree with sides)',
  },
  {
    namePattern: /Fish & Chips.*1140/i,
    restaurantPattern: /Lone Palm/i,
    currentCal: (cal) => cal > 1300,
    values: { calories: 1140, carbs: 110, fat: 55, protein: 40, sugar: 3, fiber: 4, sodium: 1500 },
    reason: 'Fish & Chips: 1388→1140 cal (item name contains official calorie count)',
  },

  // === CHURROS ===
  {
    namePattern: /Bouncin.*Mini Churros/i,
    restaurantPattern: /Ice Cold Hydraulics/i,
    currentCal: (cal) => cal > 800,
    values: { calories: 500, carbs: 60, fat: 24, protein: 5, sugar: 25, fiber: 1, sodium: 350 },
    reason: 'Bouncin\' mini churros: 1000→500 cal (6-8 specialty mini churros with toppings)',
  },
  {
    namePattern: /^Mini Churros$/i,
    restaurantPattern: /Ice Cold Hydraulics/i,
    currentCal: (cal) => cal > 700,
    values: { calories: 420, carbs: 52, fat: 20, protein: 4, sugar: 20, fiber: 1, sodium: 300 },
    reason: 'Mini churros (plain): 800→420 cal (6-8 plain mini churros)',
  },

  // === FROZEN TREATS TOO LOW ===
  {
    namePattern: /Pomegranate Dole Whip/i,
    restaurantPattern: /Thunder Falls/i,
    currentCal: (cal) => cal < 150,
    values: { calories: 220, carbs: 50, fat: 0, protein: 0, sugar: 40, fiber: 1, sodium: 30 },
    reason: 'DOLE Whip: 102→220 cal (theme park 8-10oz serving, not USDA 5oz)',
  },
  {
    namePattern: /Dole Whip Pineapple Sorbet/i,
    restaurantPattern: /Wimpy/i,
    currentCal: (cal) => cal < 150,
    values: { calories: 220, carbs: 50, fat: 0, protein: 0, sugar: 40, fiber: 1, sodium: 30 },
    reason: 'DOLE Whip: 102→220 cal (theme park 8-10oz serving)',
  },
  {
    namePattern: /Chocolate Ice Cream Crepe/i,
    restaurantPattern: /Crepes/i,
    currentCal: (cal) => cal < 250,
    values: { calories: 520, carbs: 62, fat: 26, protein: 8, sugar: 38, fiber: 2, sodium: 200 },
    reason: 'Ice cream crepe: 170→520 cal (crepe+ice cream+chocolate sauce+whipped cream)',
  },

  // === ICE CREAM TOO LOW ===
  {
    namePattern: /Soft Churned Ice Cream/i,
    restaurantPattern: /Blue Ribbon/i,
    currentCal: (cal) => cal < 220,
    values: { calories: 300, carbs: 38, fat: 14, protein: 5, sugar: 30, fiber: 0, sodium: 100 },
    reason: 'Soft serve: 180→300 cal (generous theme park portion in waffle cone)',
  },

  // === ADDITIONAL KIDS MEALS (different restaurants, same over-estimation issue) ===
  {
    namePattern: /Kids Cheeseburger$/i,
    restaurantPattern: /Altitude Burgers/i,
    currentCal: (cal) => cal > 800,
    values: { calories: 480, carbs: 38, fat: 24, protein: 24, sugar: 6, fiber: 2, sodium: 750 },
    reason: 'Kids cheeseburger: 900→480 cal (SeaWorld kids meals)',
  },
  {
    namePattern: /Kids Cheeseburger$/i,
    restaurantPattern: /Zagora/i,
    currentCal: (cal) => cal > 800,
    values: { calories: 480, carbs: 38, fat: 24, protein: 24, sugar: 6, fiber: 2, sodium: 750 },
    reason: 'Kids cheeseburger: 900→480 cal (Busch Gardens kids meals)',
  },
  {
    namePattern: /Kids Cheese Pizza$/i,
    restaurantPattern: /Oasis Pizza/i,
    currentCal: (cal) => cal > 700,
    values: { calories: 380, carbs: 42, fat: 14, protein: 16, sugar: 4, fiber: 2, sodium: 650 },
    reason: 'Kids pizza: 850→380 cal (Busch Gardens kids meals)',
  },

  // === FISH & CHIPS TOO LOW ===
  {
    namePattern: /Irish Fish.*Chips/i,
    restaurantPattern: /Finnegan/i,
    currentCal: (cal) => cal < 400,
    values: { calories: 950, carbs: 85, fat: 48, protein: 35, sugar: 3, fiber: 4, sodium: 1200 },
    reason: 'Fish & chips: 301→950 cal (was just the fish portion, not full F&C plate)',
  },

  // === OVER-ESTIMATED ENTREES ===
  {
    namePattern: /Baked Macaroni.*Cheese.*Pulled Pork/i,
    restaurantPattern: /Flame Tree/i,
    currentCal: (cal) => cal > 1300,
    values: { calories: 1050, carbs: 80, fat: 55, protein: 50, sugar: 8, fiber: 3, sodium: 1600 },
    reason: 'Mac & cheese w/ pulled pork: 1400→1050 cal (over-multiplied)',
  },
  {
    namePattern: /Southern.*Chicken Tenders Platter/i,
    restaurantPattern: /AMC/i,
    currentCal: (cal) => cal > 1300,
    values: { calories: 1100, carbs: 85, fat: 55, protein: 50, sugar: 5, fiber: 4, sodium: 2000 },
    reason: 'AMC tenders platter: 1400→1100 cal (tenders+fries+biscuits+slaw)',
  },
]

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Audit Round 10: Fix 28 HIGH findings ===`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (use --apply to write)' : 'APPLYING CHANGES'}\n`)

  const items = await fetchAll()
  console.log(`Fetched ${items.length} items\n`)

  let fixed = 0
  let skipped = 0

  for (const fix of fixes) {
    let matched = false
    for (const item of items) {
      if (!fix.namePattern.test(item.name)) continue
      const r = item.restaurant as any
      const rName = r?.name ?? ''
      const pName = r?.park?.name ?? ''
      if (fix.restaurantPattern && !fix.restaurantPattern.test(rName)) continue
      if (fix.parkPattern && !fix.parkPattern.test(pName)) continue

      const nut = item.nutritional_data?.[0]
      if (!nut) { skipped++; continue }

      if (fix.currentCal && !fix.currentCal(nut.calories ?? 0)) continue

      const updateFields: Record<string, number | null> = {
        calories: fix.values.calories,
        carbs: fix.values.carbs,
        fat: fix.values.fat,
        protein: fix.values.protein,
        confidence_score: 45,
      }
      if (fix.values.sugar !== undefined) updateFields.sugar = fix.values.sugar
      if (fix.values.fiber !== undefined) updateFields.fiber = fix.values.fiber
      if (fix.values.sodium !== undefined) updateFields.sodium = fix.values.sodium
      if (fix.values.cholesterol !== undefined) updateFields.cholesterol = fix.values.cholesterol

      console.log(`FIX: ${item.name} @ ${rName}`)
      console.log(`  was: cal=${nut.calories}, C=${nut.carbs}g, F=${nut.fat}g, P=${nut.protein}g`)
      console.log(`  now: cal=${fix.values.calories}, C=${fix.values.carbs}g, F=${fix.values.fat}g, P=${fix.values.protein}g`)
      console.log(`  reason: ${fix.reason}`)

      await updateNut(nut.id, updateFields)
      fixed++
      matched = true
    }
    if (!matched) {
      console.log(`WARNING: No match for pattern "${fix.namePattern.source}" at "${fix.restaurantPattern?.source ?? '*'}"`)
    }
  }

  console.log(`\n=== Summary ===`)
  console.log(`Fixed: ${fixed}`)
  console.log(`Skipped (no nutrition): ${skipped}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLIED'}`)
}

main().catch(console.error)
