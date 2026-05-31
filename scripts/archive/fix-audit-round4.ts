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

const fixedIds = new Set<string>()

function loc(item: Item): string {
  const r = item.restaurant as any
  return `${r?.name ?? '?'} @ ${r?.park?.name ?? '?'}`
}

function banner(title: string) {
  console.log(`\n${'═'.repeat(70)}`)
  console.log(`  ${title}`)
  console.log(`${'═'.repeat(70)}`)
}

// ─── Phase 1: Earl of Sandwich Null Macros ──────────────────────────
// Chain import wrote null carbs/fat because source JSON only had calories.
// Derive macros from official calories using food-type profiles.

interface EosMacroProfile {
  fatPct: number    // % of non-protein calories from fat
  carbPct: number   // % of non-protein calories from carbs
  sugarPctOfCarbs: number
  fiber: number
  sodium: number
  cholesterol: number
}

const EOS_PROFILES: Record<string, EosMacroProfile> = {
  // Sandwiches: bread contributes carbs, fillings contribute fat
  sandwich:  { fatPct: 0.45, carbPct: 0.55, sugarPctOfCarbs: 0.06, fiber: 3, sodium: 1400, cholesterol: 65 },
  wrap:      { fatPct: 0.48, carbPct: 0.52, sugarPctOfCarbs: 0.06, fiber: 3, sodium: 1300, cholesterol: 60 },
  salad:     { fatPct: 0.60, carbPct: 0.40, sugarPctOfCarbs: 0.12, fiber: 4, sodium: 800,  cholesterol: 55 },
  soup:      { fatPct: 0.45, carbPct: 0.55, sugarPctOfCarbs: 0.08, fiber: 2, sodium: 1200, cholesterol: 30 },
  // Sides: wide range, but chips/potatoes are carb-heavy, mac is fat-heavy
  side_carb: { fatPct: 0.40, carbPct: 0.60, sugarPctOfCarbs: 0.05, fiber: 2, sodium: 600,  cholesterol: 10 },
  side_fat:  { fatPct: 0.55, carbPct: 0.45, sugarPctOfCarbs: 0.05, fiber: 2, sodium: 800,  cholesterol: 40 },
  dessert:   { fatPct: 0.40, carbPct: 0.60, sugarPctOfCarbs: 0.55, fiber: 1, sodium: 300,  cholesterol: 50 },
  breakfast: { fatPct: 0.50, carbPct: 0.50, sugarPctOfCarbs: 0.08, fiber: 2, sodium: 1000, cholesterol: 200 },
  bagel:     { fatPct: 0.35, carbPct: 0.65, sugarPctOfCarbs: 0.06, fiber: 2, sodium: 500,  cholesterol: 30 },
  oatmeal:   { fatPct: 0.20, carbPct: 0.80, sugarPctOfCarbs: 0.30, fiber: 4, sodium: 150,  cholesterol: 0 },
  yogurt:    { fatPct: 0.25, carbPct: 0.75, sugarPctOfCarbs: 0.60, fiber: 1, sodium: 100,  cholesterol: 10 },
  fruit:     { fatPct: 0.05, carbPct: 0.95, sugarPctOfCarbs: 0.80, fiber: 3, sodium: 5,    cholesterol: 0 },
}

function classifyEosItem(name: string): string {
  const n = name.toLowerCase()
  if (/wrap/i.test(n)) return 'wrap'
  if (/salad/i.test(n)) return 'salad'
  if (/soup/i.test(n)) return 'soup'
  if (/cookie|brownie|cheesecake|pudding|ice cream/i.test(n)) return 'dessert'
  if (/muffin|cinnamon roll|croissant|chocolate croissant/i.test(n)) return 'dessert'
  if (/bagel/i.test(n)) return 'bagel'
  if (/oatmeal/i.test(n)) return 'oatmeal'
  if (/yogurt|parfait/i.test(n)) return 'yogurt'
  if (/fruit cup/i.test(n)) return 'fruit'
  if (/omelet|waffle|biscuits|breakfast/i.test(n)) return 'breakfast'
  if (/mac.*cheese|pizza bread|baked potato|loaded potato|hummus/i.test(n)) return 'side_fat'
  if (/chips|wedges|potato salad|coleslaw|pasta salad|homestyle/i.test(n)) return 'side_carb'
  // Default for Earl of Sandwich: it's a sandwich
  return 'sandwich'
}

function fixEarlOfSandwich(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number> }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number> }[] = []

  for (const item of items) {
    const rName = ((item.restaurant as any)?.name ?? '').toLowerCase()
    if (!rName.includes('earl of sandwich')) continue

    const nd = item.nutritional_data?.[0]
    if (!nd || !nd.calories || nd.calories <= 0) continue
    // Only fix items with null carbs AND null fat (the chain import bug)
    if (nd.carbs !== null && nd.fat !== null) continue
    // Already fixed?
    if (fixedIds.has(nd.id)) continue

    const foodType = classifyEosItem(item.name)
    const prof = EOS_PROFILES[foodType]
    if (!prof) continue

    // Protein: if we have it, use it; otherwise estimate based on food type
    const proteinPct = foodType === 'dessert' ? 0.06
      : foodType === 'fruit' ? 0.04
      : foodType === 'oatmeal' ? 0.12
      : foodType === 'yogurt' ? 0.15
      : foodType === 'bagel' ? 0.12
      : foodType === 'side_carb' ? 0.08
      : foodType === 'soup' ? 0.18
      : 0.22 // sandwiches, wraps, salads, breakfast, side_fat
    const protein = nd.protein ?? Math.round(nd.calories * proteinPct / 4)
    const proteinCal = protein * 4
    const remainingCal = Math.max(nd.calories - proteinCal, 0)

    const fatCal = remainingCal * prof.fatPct
    const carbCal = remainingCal * prof.carbPct
    const fat = Math.round(fatCal / 9)
    const carbs = Math.round(carbCal / 4)
    const sugar = Math.round(carbs * prof.sugarPctOfCarbs)

    const changes: Record<string, number> = {
      carbs, fat, sugar,
      fiber: prof.fiber,
      sodium: prof.sodium,
      cholesterol: prof.cholesterol,
    }
    // Only fill protein if it was null
    if (nd.protein === null) changes.protein = protein

    fixes.push({ item, nd, changes })
  }
  return fixes
}

// ─── Phase 2: Generic Fallback Profiles ─────────────────────────────
// Replace known bad template profiles that were applied to wildly different foods.

interface GenericProfile {
  calories: number
  carbs: number
  fat: number
  protein: number
  name: string
}

// Known bad generic profiles (from audit analysis)
const KNOWN_BAD_PROFILES: GenericProfile[] = [
  { calories: 297,  carbs: 18,  fat: 16,  protein: 20,  name: 'platter_297' },
  { calories: 1868, carbs: 107, fat: 80,  protein: 162, name: 'seafood_1868' },
  { calories: 430,  carbs: 6,   fat: 45,  protein: 1,   name: 'salad_430' },
  { calories: 1400, carbs: 122, fat: 59,  protein: 95,  name: 'entree_1400' },
]

// What to replace with, based on dish type detection from the item name
interface DishEstimate {
  calories: number
  fatPct: number
  carbPct: number
  proteinPct: number
  sugarPctOfCarbs: number
  fiber: number
  sodium: number
  cholesterol: number
}

function estimateFromName(name: string, category: string): DishEstimate | null {
  const n = name.toLowerCase()

  // Platters/combos
  if (/platter|combo/i.test(n)) {
    if (/wings|raptor/i.test(n)) return { calories: 800, fatPct: 0.50, carbPct: 0.15, proteinPct: 0.35, sugarPctOfCarbs: 0.05, fiber: 1, sodium: 1800, cholesterol: 120 }
    if (/chicken.*parmesan|chicken parm/i.test(n)) return { calories: 900, fatPct: 0.40, carbPct: 0.35, proteinPct: 0.25, sugarPctOfCarbs: 0.08, fiber: 3, sodium: 1400, cholesterol: 90 }
    if (/fettuccine|alfredo|pasta/i.test(n)) return { calories: 850, fatPct: 0.38, carbPct: 0.42, proteinPct: 0.20, sugarPctOfCarbs: 0.06, fiber: 3, sodium: 1200, cholesterol: 70 }
    if (/pizza|cheese slice|pesto.*slice/i.test(n)) return { calories: 700, fatPct: 0.40, carbPct: 0.38, proteinPct: 0.22, sugarPctOfCarbs: 0.06, fiber: 3, sodium: 1300, cholesterol: 50 }
    if (/gyro/i.test(n)) return { calories: 750, fatPct: 0.42, carbPct: 0.35, proteinPct: 0.23, sugarPctOfCarbs: 0.05, fiber: 3, sodium: 1200, cholesterol: 60 }
    if (/fish|battered/i.test(n)) return { calories: 800, fatPct: 0.45, carbPct: 0.35, proteinPct: 0.20, sugarPctOfCarbs: 0.04, fiber: 2, sodium: 1300, cholesterol: 70 }
    if (/bbq|ribwich|rib|pork|pernil|carnegie/i.test(n)) return { calories: 950, fatPct: 0.42, carbPct: 0.30, proteinPct: 0.28, sugarPctOfCarbs: 0.10, fiber: 3, sodium: 1500, cholesterol: 90 }
    if (/tender|chicken|southern/i.test(n)) return { calories: 800, fatPct: 0.45, carbPct: 0.35, proteinPct: 0.20, sugarPctOfCarbs: 0.05, fiber: 2, sodium: 1300, cholesterol: 70 }
    if (/fruit/i.test(n)) return { calories: 200, fatPct: 0.05, carbPct: 0.90, proteinPct: 0.05, sugarPctOfCarbs: 0.80, fiber: 4, sodium: 10, cholesterol: 0 }
    if (/cheese/i.test(n)) return { calories: 500, fatPct: 0.55, carbPct: 0.25, proteinPct: 0.20, sugarPctOfCarbs: 0.04, fiber: 1, sodium: 900, cholesterol: 70 }
    if (/mezze/i.test(n)) return { calories: 600, fatPct: 0.48, carbPct: 0.35, proteinPct: 0.17, sugarPctOfCarbs: 0.06, fiber: 5, sodium: 900, cholesterol: 20 }
    if (/butcher.*board/i.test(n)) return { calories: 1200, fatPct: 0.50, carbPct: 0.20, proteinPct: 0.30, sugarPctOfCarbs: 0.04, fiber: 2, sodium: 1800, cholesterol: 100 }
    if (/vegan/i.test(n)) return { calories: 600, fatPct: 0.30, carbPct: 0.50, proteinPct: 0.20, sugarPctOfCarbs: 0.06, fiber: 6, sodium: 900, cholesterol: 0 }
    // Generic platter
    return { calories: 800, fatPct: 0.40, carbPct: 0.35, proteinPct: 0.25, sugarPctOfCarbs: 0.06, fiber: 3, sodium: 1300, cholesterol: 70 }
  }

  // Specific dish types for the 1400 and 430 profiles
  if (/caesar/i.test(n)) return { calories: 550, fatPct: 0.50, carbPct: 0.25, proteinPct: 0.25, sugarPctOfCarbs: 0.08, fiber: 3, sodium: 1000, cholesterol: 70 }
  if (/cobb/i.test(n)) return { calories: 600, fatPct: 0.50, carbPct: 0.20, proteinPct: 0.30, sugarPctOfCarbs: 0.08, fiber: 4, sodium: 1100, cholesterol: 80 }
  if (/salad/i.test(n) && /soup/i.test(n)) return { calories: 500, fatPct: 0.42, carbPct: 0.35, proteinPct: 0.23, sugarPctOfCarbs: 0.08, fiber: 4, sodium: 1100, cholesterol: 40 }
  if (/salad|seasonal salad|garden salad|spring salad/i.test(n)) return { calories: 350, fatPct: 0.50, carbPct: 0.30, proteinPct: 0.20, sugarPctOfCarbs: 0.12, fiber: 4, sodium: 600, cholesterol: 30 }
  if (/chile relleno/i.test(n)) return { calories: 550, fatPct: 0.45, carbPct: 0.35, proteinPct: 0.20, sugarPctOfCarbs: 0.05, fiber: 4, sodium: 1000, cholesterol: 60 }
  if (/chicken.*finger|chicken.*tender/i.test(n)) return { calories: 600, fatPct: 0.45, carbPct: 0.30, proteinPct: 0.25, sugarPctOfCarbs: 0.04, fiber: 1, sodium: 1200, cholesterol: 80 }
  if (/bangers.*mash/i.test(n)) return { calories: 700, fatPct: 0.48, carbPct: 0.32, proteinPct: 0.20, sugarPctOfCarbs: 0.04, fiber: 3, sodium: 1400, cholesterol: 80 }
  if (/loaded.*chips|irish.*chips/i.test(n)) return { calories: 700, fatPct: 0.50, carbPct: 0.35, proteinPct: 0.15, sugarPctOfCarbs: 0.04, fiber: 3, sodium: 1100, cholesterol: 50 }
  if (/burger|cheeseburger/i.test(n)) return { calories: 850, fatPct: 0.45, carbPct: 0.30, proteinPct: 0.25, sugarPctOfCarbs: 0.06, fiber: 3, sodium: 1200, cholesterol: 90 }
  if (/bento.*box/i.test(n)) return { calories: 700, fatPct: 0.35, carbPct: 0.40, proteinPct: 0.25, sugarPctOfCarbs: 0.06, fiber: 3, sodium: 1000, cholesterol: 60 }
  if (/fish.*chips|fish.*n.*chips/i.test(n)) return { calories: 800, fatPct: 0.45, carbPct: 0.35, proteinPct: 0.20, sugarPctOfCarbs: 0.04, fiber: 2, sodium: 1200, cholesterol: 70 }
  if (/tuna/i.test(n)) return { calories: 550, fatPct: 0.35, carbPct: 0.35, proteinPct: 0.30, sugarPctOfCarbs: 0.05, fiber: 2, sodium: 900, cholesterol: 50 }
  if (/buffalo chicken/i.test(n)) return { calories: 650, fatPct: 0.42, carbPct: 0.30, proteinPct: 0.28, sugarPctOfCarbs: 0.04, fiber: 2, sodium: 1500, cholesterol: 80 }
  if (/yardbird|chicken/i.test(n)) return { calories: 700, fatPct: 0.40, carbPct: 0.30, proteinPct: 0.30, sugarPctOfCarbs: 0.05, fiber: 2, sodium: 1100, cholesterol: 85 }
  if (/croissant/i.test(n)) return { calories: 500, fatPct: 0.45, carbPct: 0.35, proteinPct: 0.20, sugarPctOfCarbs: 0.06, fiber: 2, sodium: 900, cholesterol: 60 }
  if (/tour de france/i.test(n)) return { calories: 800, fatPct: 0.45, carbPct: 0.30, proteinPct: 0.25, sugarPctOfCarbs: 0.06, fiber: 3, sodium: 1100, cholesterol: 80 }
  if (/croquette/i.test(n)) return { calories: 450, fatPct: 0.48, carbPct: 0.32, proteinPct: 0.20, sugarPctOfCarbs: 0.04, fiber: 1, sodium: 700, cholesterol: 60 }
  if (/side/i.test(n)) return { calories: 300, fatPct: 0.40, carbPct: 0.45, proteinPct: 0.15, sugarPctOfCarbs: 0.05, fiber: 2, sodium: 500, cholesterol: 15 }
  if (/two tenders/i.test(n)) return { calories: 400, fatPct: 0.45, carbPct: 0.30, proteinPct: 0.25, sugarPctOfCarbs: 0.04, fiber: 1, sodium: 800, cholesterol: 60 }

  // Seafood dishes (for the 1868 profile)
  if (/steam.*boil|bouillabaisse|seafood.*boil/i.test(n)) return { calories: 750, fatPct: 0.35, carbPct: 0.25, proteinPct: 0.40, sugarPctOfCarbs: 0.04, fiber: 2, sodium: 1800, cholesterol: 200 }
  if (/shrimp.*grits/i.test(n)) return { calories: 650, fatPct: 0.42, carbPct: 0.33, proteinPct: 0.25, sugarPctOfCarbs: 0.04, fiber: 2, sodium: 1200, cholesterol: 150 }
  if (/gambas|shrimp.*garlic/i.test(n)) return { calories: 400, fatPct: 0.55, carbPct: 0.15, proteinPct: 0.30, sugarPctOfCarbs: 0.05, fiber: 1, sodium: 800, cholesterol: 180 }
  if (/shrimp.*rice.*bowl/i.test(n)) return { calories: 550, fatPct: 0.30, carbPct: 0.40, proteinPct: 0.30, sugarPctOfCarbs: 0.04, fiber: 3, sodium: 1000, cholesterol: 150 }

  return null
}

function buildFromEstimate(est: DishEstimate): Record<string, number> {
  const fat = Math.round((est.calories * est.fatPct) / 9)
  const carbs = Math.round((est.calories * est.carbPct) / 4)
  const protein = Math.round((est.calories * est.proteinPct) / 4)
  const sugar = Math.round(carbs * est.sugarPctOfCarbs)
  return {
    calories: est.calories,
    carbs, fat, protein, sugar,
    fiber: est.fiber,
    sodium: est.sodium,
    cholesterol: est.cholesterol,
    confidence_score: 40,
  }
}

function fixGenericProfiles(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number>; profile: string }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number>; profile: string }[] = []

  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd || nd.calories === null) continue
    if (fixedIds.has(nd.id)) continue

    for (const bp of KNOWN_BAD_PROFILES) {
      if (nd.calories !== bp.calories || nd.carbs !== bp.carbs || nd.fat !== bp.fat || nd.protein !== bp.protein) continue

      const est = estimateFromName(item.name, item.category)
      if (!est) continue

      const changes = buildFromEstimate(est)
      fixes.push({ item, nd, changes, profile: bp.name })
      break
    }
  }
  return fixes
}

// ─── Phase 3: Targeted Wrong Profiles ───────────────────────────────
// Specific items with clearly wrong nutrition data

interface TargetedFix {
  namePattern: RegExp
  restaurantPattern?: RegExp
  condition: (nd: NutRow) => boolean  // only match if condition is true
  changes: Record<string, number>
  reason: string
}

const TARGETED_FIXES: TargetedFix[] = [
  // Porterhouse 28oz at STK - has 200 cal, 2g protein for a 28oz steak
  {
    namePattern: /dry.*aged.*porterhouse.*28/i,
    condition: (nd) => (nd.calories ?? 0) < 500,
    changes: { calories: 1800, fat: 90, carbs: 0, protein: 220, sugar: 0, fiber: 0, sodium: 800, cholesterol: 350, confidence_score: 40 },
    reason: '28oz steak at 200cal → 1800cal'
  },
  // Oysters at Atlantic - 0g protein, 18g sugar
  {
    namePattern: /^oysters$/i,
    restaurantPattern: /atlantic/i,
    condition: (nd) => (nd.protein ?? 0) === 0,
    changes: { calories: 120, fat: 4, carbs: 6, protein: 12, sugar: 0, fiber: 0, sodium: 300, cholesterol: 60, confidence_score: 40 },
    reason: 'Oysters with 0g protein → 120cal with proper macros'
  },
  // Garlic Cream Penne at Mythos - 3g carbs, 74g fat
  {
    namePattern: /garlic.*cream.*penne/i,
    condition: (nd) => (nd.carbs ?? 0) < 20,
    changes: { calories: 800, fat: 35, carbs: 85, protein: 25, sugar: 6, fiber: 3, sodium: 1100, cholesterol: 70, confidence_score: 40 },
    reason: 'Pasta with 3g carbs → 800cal with proper macros'
  },
  // Ohana Noodles - 1200cal but only 2g protein
  {
    namePattern: /ohana noodles/i,
    condition: (nd) => (nd.protein ?? 0) < 10,
    changes: { calories: 700, fat: 25, carbs: 90, protein: 25, sugar: 8, fiber: 3, sodium: 1200, cholesterol: 40, confidence_score: 40 },
    reason: 'Noodle dish with 2g protein → 700cal balanced'
  },
  // Polite Caesar at Polite Pig - 542cal, 3g carbs, 58g fat, 2g protein
  {
    namePattern: /polite caesar/i,
    condition: (nd) => (nd.protein ?? 0) < 10,
    changes: { calories: 550, fat: 35, carbs: 25, protein: 35, sugar: 3, fiber: 3, sodium: 1000, cholesterol: 70, confidence_score: 40 },
    reason: 'Caesar salad all-fat profile → balanced'
  },
  // Burrata at Naples - 1882cal, 190g fat, 0 carbs
  {
    namePattern: /^burrata$/i,
    restaurantPattern: /naples/i,
    condition: (nd) => (nd.calories ?? 0) > 1500,
    changes: { calories: 450, fat: 30, carbs: 15, protein: 25, sugar: 2, fiber: 1, sodium: 600, cholesterol: 50, confidence_score: 40 },
    reason: 'Burrata appetizer 1882cal → 450cal'
  },
  // Eggplant Parmigiana at Naples - 1843cal
  {
    namePattern: /eggplant parm/i,
    restaurantPattern: /naples/i,
    condition: (nd) => (nd.calories ?? 0) > 1500,
    changes: { calories: 700, fat: 35, carbs: 60, protein: 25, sugar: 12, fiber: 6, sodium: 1200, cholesterol: 50, confidence_score: 40 },
    reason: 'Eggplant parm 1843cal → 700cal'
  },
  // Sea Salt Caramel Ice Cream at Salt & Straw - 1857cal for a scoop
  {
    namePattern: /sea salt caramel ice cream/i,
    condition: (nd) => (nd.calories ?? 0) > 1000,
    changes: { calories: 380, fat: 22, carbs: 42, protein: 5, sugar: 36, fiber: 0, sodium: 200, cholesterol: 70, confidence_score: 40 },
    reason: 'Ice cream scoop 1857cal → 380cal'
  },
  // Double Fold Vanilla at Salt & Straw - 1857cal
  {
    namePattern: /double fold vanilla/i,
    condition: (nd) => (nd.calories ?? 0) > 1000,
    changes: { calories: 370, fat: 23, carbs: 35, protein: 5, sugar: 30, fiber: 0, sodium: 150, cholesterol: 75, confidence_score: 40 },
    reason: 'Ice cream scoop 1857cal → 370cal'
  },
  // Beer-battered Onion Rings at '50s Prime Time - 1773cal
  {
    namePattern: /beer.*battered.*onion.*ring/i,
    condition: (nd) => (nd.calories ?? 0) > 1200,
    changes: { calories: 600, fat: 35, carbs: 60, protein: 8, sugar: 6, fiber: 3, sodium: 900, cholesterol: 15, confidence_score: 40 },
    reason: 'Onion rings 1773cal → 600cal'
  },
  // Pandoran Sunrise at Satu'li - 800cal, 190g carbs, 170g sugar (clearly a drink)
  {
    namePattern: /pandoran sunrise/i,
    condition: (nd) => (nd.sugar ?? 0) > 100,
    changes: { calories: 200, fat: 0, carbs: 50, protein: 1, sugar: 45, fiber: 0, sodium: 20, cholesterol: 0, confidence_score: 40 },
    reason: 'Beverage with 170g sugar → 200cal drink'
  },
  // Salsiccia e Peperoni at Tuscany - 680cal, 1g protein for sausage
  {
    namePattern: /salsiccia/i,
    condition: (nd) => (nd.protein ?? 0) < 5,
    changes: { calories: 500, fat: 32, carbs: 25, protein: 25, sugar: 4, fiber: 2, sodium: 1100, cholesterol: 75, confidence_score: 40 },
    reason: 'Italian sausage with 1g protein → 500cal balanced'
  },
  // Trio de Pintxos at Spain - 1000cal, 1g protein, 2500mg sodium
  {
    namePattern: /trio de pintxos/i,
    condition: (nd) => (nd.protein ?? 0) < 5,
    changes: { calories: 450, fat: 25, carbs: 35, protein: 20, sugar: 3, fiber: 2, sodium: 900, cholesterol: 50, confidence_score: 40 },
    reason: 'Spanish tapas with 1g protein → 450cal balanced'
  },
  // Lemon Tart at Citrus Blossom - 1200cal (festival item)
  {
    namePattern: /lemon tart/i,
    restaurantPattern: /citrus blossom/i,
    condition: (nd) => (nd.calories ?? 0) > 800,
    changes: { calories: 350, fat: 16, carbs: 48, protein: 4, sugar: 30, fiber: 1, sodium: 200, cholesterol: 40, confidence_score: 40 },
    reason: 'Festival lemon tart 1200cal → 350cal'
  },
  // Polenta Pasticciata - 1200cal, 2g protein
  {
    namePattern: /polenta pasticciata/i,
    condition: (nd) => (nd.calories ?? 0) > 800,
    changes: { calories: 400, fat: 18, carbs: 45, protein: 12, sugar: 3, fiber: 2, sodium: 700, cholesterol: 30, confidence_score: 40 },
    reason: 'Festival polenta 1200cal → 400cal'
  },
  // Warm Cheese Strudel - 510cal, 1g protein
  {
    namePattern: /warm cheese strudel/i,
    condition: (nd) => (nd.protein ?? 0) < 5,
    changes: { calories: 400, fat: 22, carbs: 40, protein: 10, sugar: 18, fiber: 1, sodium: 350, cholesterol: 45, confidence_score: 40 },
    reason: 'Cheese strudel with 1g protein → 400cal balanced'
  },
  // Customized Bowl: Tofu at Satu'li - 600cal, 1g protein for tofu
  {
    namePattern: /customized bowl.*tofu.*mixed greens/i,
    condition: (nd) => (nd.protein ?? 0) < 5,
    changes: { calories: 400, fat: 18, carbs: 40, protein: 20, sugar: 4, fiber: 5, sodium: 700, cholesterol: 0, confidence_score: 40 },
    reason: 'Tofu bowl with 1g protein → 400cal balanced'
  },
  // Customized Bowl: Tofu on Rice & Beans at Satu'li - 1863cal
  {
    namePattern: /customized bowl.*tofu.*rice.*beans/i,
    condition: (nd) => (nd.calories ?? 0) > 1200,
    changes: { calories: 550, fat: 18, carbs: 70, protein: 22, sugar: 4, fiber: 6, sodium: 800, cholesterol: 0, confidence_score: 40 },
    reason: 'Tofu rice bowl 1863cal → 550cal'
  },
  // Two Meat, One Side Platter at Oak and Star - 200cal, 40g sugar for BBQ platter
  {
    namePattern: /two meat.*one side.*platter/i,
    condition: (nd) => (nd.calories ?? 0) < 500,
    changes: { calories: 1000, fat: 45, carbs: 60, protein: 75, sugar: 12, fiber: 3, sodium: 1600, cholesterol: 120, confidence_score: 40 },
    reason: 'BBQ 2-meat platter 200cal → 1000cal'
  },
  // One Meat, One Side Platter at Oak and Star
  {
    namePattern: /one meat.*one side.*platter/i,
    condition: (nd) => (nd.calories ?? 0) < 500,
    changes: { calories: 700, fat: 30, carbs: 45, protein: 50, sugar: 8, fiber: 3, sodium: 1200, cholesterol: 80, confidence_score: 40 },
    reason: 'BBQ 1-meat platter 200cal → 700cal'
  },
]

function fixTargetedItems(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number>; reason: string }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number>; reason: string }[] = []

  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd) continue
    if (fixedIds.has(nd.id)) continue

    for (const tf of TARGETED_FIXES) {
      if (!tf.namePattern.test(item.name)) continue
      if (tf.restaurantPattern) {
        const rName = (item.restaurant as any)?.name ?? ''
        if (!tf.restaurantPattern.test(rName)) continue
      }
      if (!tf.condition(nd)) continue

      fixes.push({ item, nd, changes: tf.changes, reason: tf.reason })
      break
    }
  }
  return fixes
}

// ─── Phase 4: Over-Multiplied Items (>1800 cal, not platters) ───────
// Items with extreme calories that aren't sharing/platter size

function fixOverEstimated(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number>; reason: string }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number>; reason: string }[] = []

  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd || !nd.calories || nd.calories <= 1800) continue
    if (fixedIds.has(nd.id)) continue
    if (item.category === 'beverage') continue

    // Skip if it's a sharing/platter item — these can legitimately be 1800+
    if (/platter|for\s*2|for\s*two|sharing|family|feast|sampler|butcher.*board/i.test(item.name)) continue
    // Skip official data
    if ((nd.confidence_score ?? 0) >= 80 && nd.source === 'official') continue

    const n = item.name.toLowerCase()

    // Determine reasonable target based on dish type
    let targetCal: number
    if (/ice cream|gelato|sundae|scoop/i.test(n)) targetCal = 400
    else if (/onion ring/i.test(n)) targetCal = 600
    else if (/mahi|sea bass|fish|salmon|tuna|lobster|crab|oyster|scallop/i.test(n)) targetCal = 600
    else if (/poke.*bowl|rice.*bowl/i.test(n)) targetCal = 650
    else if (/salad/i.test(n)) targetCal = 550
    else if (/soup|chowder|bisque|bouillabaisse/i.test(n)) targetCal = 500
    else if (/tofu|vegetable|vegan/i.test(n)) targetCal = 550
    else if (/burger|cheeseburger/i.test(n)) targetCal = 900
    else if (/steak|porterhouse|ribeye|filet/i.test(n)) targetCal = 800
    else if (/ribs|rack|brisket|pulled pork/i.test(n)) targetCal = 900
    else if (/chicken|turkey|meatloaf/i.test(n)) targetCal = 800
    else if (/shrimp|prawn|gambas/i.test(n)) targetCal = 600
    else if (/pasta|fettuccine|spaghetti|penne|ravioli/i.test(n)) targetCal = 800
    else if (/pie|tart|cake|brownie|cookie/i.test(n)) targetCal = 500
    else if (/shepherd/i.test(n)) targetCal = 700
    else targetCal = 800 // generic entree cap

    const scale = targetCal / nd.calories
    const changes: Record<string, number> = {
      calories: targetCal,
      confidence_score: 40,
    }
    if (nd.carbs !== null) changes.carbs = Math.round(nd.carbs * scale)
    if (nd.fat !== null) changes.fat = Math.round(nd.fat * scale)
    if (nd.protein !== null) changes.protein = Math.round(nd.protein * scale)
    if (nd.sugar !== null) changes.sugar = Math.round(nd.sugar * scale)
    if (nd.fiber !== null) changes.fiber = Math.round(nd.fiber * scale)
    if (nd.sodium !== null) changes.sodium = Math.round(nd.sodium * scale)
    if (nd.cholesterol !== null) changes.cholesterol = Math.round(nd.cholesterol * scale)

    // Validate sugar <= carbs
    if (changes.sugar !== undefined && changes.carbs !== undefined && changes.sugar > changes.carbs) {
      changes.sugar = changes.carbs
    }

    fixes.push({ item, nd, changes, reason: `${nd.calories}→${targetCal}cal (scale ${scale.toFixed(2)})` })
  }
  return fixes
}

// ─── Phase 5: Under-Estimated Entrees (<100 cal) ────────────────────
// Entrees/snacks with absurdly low calories for clearly substantial food

function fixUnderEstimated(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number>; reason: string }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number>; reason: string }[] = []

  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd || nd.calories === null) continue
    if (fixedIds.has(nd.id)) continue
    if (item.category === 'beverage') continue
    if ((nd.confidence_score ?? 0) >= 80 && nd.source === 'official') continue

    const n = item.name.toLowerCase()
    const cal = nd.calories

    // Skip items that are legitimately low-cal (plain sides, sauces, modifiers, etc.)
    if (/sauce|dressing|dip|condiment|garnish|topping(?!s)|side of|add |make any/i.test(n)) continue

    let targetCal: number | null = null
    let reason = ''

    // Combos should be 400+ cal minimum
    if (/combo/i.test(n) && cal < 200) {
      if (/grilled cheese|tomato soup/i.test(n)) { targetCal = 650; reason = 'grilled cheese combo' }
      else if (/chicken.*katsu|chick.n.*katsu/i.test(n)) { targetCal = 750; reason = 'katsu combo' }
      else if (/lo mein|noodle/i.test(n)) { targetCal = 550; reason = 'noodle combo' }
      else if (/spaghetti|meatball/i.test(n)) { targetCal = 700; reason = 'pasta combo' }
      else if (/alfredo|fettuccine/i.test(n)) { targetCal = 800; reason = 'alfredo combo' }
      else if (/rice.*bowl|shrimp.*rice/i.test(n)) { targetCal = 600; reason = 'rice bowl combo' }
      else if (/stir.*fry|stir.*fried/i.test(n)) { targetCal = 550; reason = 'stir fry combo' }
      else if (/salad|greek/i.test(n)) { targetCal = 400; reason = 'salad combo' }
      else if (/pizza|veggie.*slice/i.test(n)) { targetCal = 600; reason = 'pizza combo' }
      else if (/gyro/i.test(n)) { targetCal = 650; reason = 'gyro combo' }
      else { targetCal = 600; reason = 'generic combo' }
    }
    // Burrito bowls
    else if (/burrito.*bowl/i.test(n) && cal < 200) { targetCal = 650; reason = 'burrito bowl' }
    // Pizza (non-combo, non-slice)
    else if (/pizza/i.test(n) && !/slice|bites|rolls|bread|station/i.test(n) && cal < 200) { targetCal = 700; reason = 'pizza' }
    // Sushi platter
    else if (/sushi.*platter/i.test(n) && cal < 200) { targetCal = 450; reason = 'sushi platter' }
    // Lobster
    else if (/lobster.*tail/i.test(n) && cal < 100) { targetCal = 350; reason = 'lobster tail' }
    // Clam chowder in bread bowl
    else if (/clam.*chowder.*bread/i.test(n) && cal < 100) { targetCal = 650; reason = 'bread bowl chowder' }
    // Chips and salsa
    else if (/chips.*salsa/i.test(n) && cal < 100) { targetCal = 400; reason = 'chips & salsa' }
    // Calamari
    else if (/calamari/i.test(n) && cal < 100) { targetCal = 450; reason = 'fried calamari' }
    // Scallop risotto
    else if (/scallop.*risotto|risotto.*scallop/i.test(n) && cal < 100) { targetCal = 600; reason = 'scallop risotto' }
    // Swordfish
    else if (/sword.*fish|sword.*ratatouille/i.test(n) && cal < 150) { targetCal = 500; reason = 'swordfish entree' }
    // Chicken ravioli
    else if (/chicken.*ravioli|ravioli.*chicken/i.test(n) && cal < 150) { targetCal = 650; reason = 'chicken ravioli' }
    // Empanada
    else if (/empanada/i.test(n) && cal < 100) { targetCal = 350; reason = 'empanada' }
    // Vegetable lo mein (not combo)
    else if (/lo mein/i.test(n) && !/combo/i.test(n) && cal < 100) { targetCal = 450; reason = 'lo mein' }
    // Salad with chicken
    else if (/salad.*chicken|chicken.*salad/i.test(n) && cal < 100) { targetCal = 450; reason = 'chicken salad entree' }
    // Grilled chicken entree
    else if (/pineapple.*chicken|grilled.*chicken/i.test(n) && cal < 150) { targetCal = 500; reason = 'grilled chicken entree' }
    // S'mores dessert
    else if (/s.mores/i.test(n) && cal < 100) { targetCal = 350; reason = 'smores dessert' }
    // Turkey breast
    else if (/turkey.*breast/i.test(n) && cal < 150) { targetCal = 350; reason = 'turkey breast' }
    // Sea bass / mahi
    else if (/sea bass|mahi|miso.*glazed/i.test(n) && cal < 150) { targetCal = 450; reason = 'fish entree' }
    // Milkshake
    else if (/milkshake|shake/i.test(n) && !/salt & pepper|pepper shaker|salt shaker/i.test(n) && cal < 250) { targetCal = 600; reason = 'milkshake' }
    // Burger (any)
    else if (/burger|cheeseburger/i.test(n) && cal < 250) { targetCal = 700; reason = 'burger' }
    // Whiskey BBQ items
    else if (/whiskey.*bbq|bbq.*whiskey/i.test(n) && cal < 250) { targetCal = 800; reason = 'bbq burger' }

    if (targetCal === null) continue
    // Don't reduce calories
    if (targetCal <= cal) continue

    const est = estimateFromNameSimple(item.name, item.category, targetCal)
    fixes.push({ item, nd, changes: est, reason: `${cal}→${targetCal}cal (${reason})` })
  }
  return fixes
}

// Simple macro estimation from target calories + dish type
function estimateFromNameSimple(name: string, category: string, targetCal: number): Record<string, number> {
  const n = name.toLowerCase()
  let fatPct = 0.38, carbPct = 0.35, proteinPct = 0.27
  let sugarPct = 0.08, fiber = 3, sodium = 1000, cholesterol = 60

  if (/milkshake|shake/i.test(n)) { fatPct = 0.35; carbPct = 0.55; proteinPct = 0.10; sugarPct = 0.70; fiber = 0; sodium = 250; cholesterol = 60 }
  else if (/pizza/i.test(n)) { fatPct = 0.38; carbPct = 0.40; proteinPct = 0.22; sugarPct = 0.06; fiber = 3; sodium = 1200; cholesterol = 50 }
  else if (/pasta|ravioli|alfredo|fettuccine|spaghetti|lo mein|noodle/i.test(n)) { fatPct = 0.35; carbPct = 0.45; proteinPct = 0.20; sugarPct = 0.06; fiber = 3; sodium = 1100; cholesterol = 50 }
  else if (/burger|cheeseburger/i.test(n)) { fatPct = 0.45; carbPct = 0.30; proteinPct = 0.25; sugarPct = 0.06; fiber = 3; sodium = 1200; cholesterol = 90 }
  else if (/salad/i.test(n)) { fatPct = 0.48; carbPct = 0.28; proteinPct = 0.24; sugarPct = 0.10; fiber = 4; sodium = 800; cholesterol = 50 }
  else if (/soup|chowder|bisque/i.test(n)) { fatPct = 0.40; carbPct = 0.40; proteinPct = 0.20; sugarPct = 0.06; fiber = 3; sodium = 1300; cholesterol = 40 }
  else if (/fish|mahi|sea bass|salmon|swordfish|lobster|scallop/i.test(n)) { fatPct = 0.35; carbPct = 0.25; proteinPct = 0.40; sugarPct = 0.04; fiber = 2; sodium = 800; cholesterol = 80 }
  else if (/burrito|taco|quesadilla|empanada/i.test(n)) { fatPct = 0.40; carbPct = 0.38; proteinPct = 0.22; sugarPct = 0.04; fiber = 4; sodium = 1000; cholesterol = 50 }
  else if (/chicken.*katsu|fried.*chicken|chicken.*tender|calamari/i.test(n)) { fatPct = 0.45; carbPct = 0.30; proteinPct = 0.25; sugarPct = 0.04; fiber = 1; sodium = 1200; cholesterol = 80 }
  else if (/s.mores|dessert|brownie|cookie/i.test(n)) { fatPct = 0.40; carbPct = 0.50; proteinPct = 0.10; sugarPct = 0.55; fiber = 1; sodium = 250; cholesterol = 40 }
  else if (/turkey|chicken.*breast/i.test(n)) { fatPct = 0.25; carbPct = 0.10; proteinPct = 0.65; sugarPct = 0.05; fiber = 0; sodium = 700; cholesterol = 90 }
  else if (/chips.*salsa/i.test(n)) { fatPct = 0.40; carbPct = 0.50; proteinPct = 0.10; sugarPct = 0.06; fiber = 3; sodium = 900; cholesterol = 0 }
  else if (/sushi/i.test(n)) { fatPct = 0.25; carbPct = 0.50; proteinPct = 0.25; sugarPct = 0.08; fiber = 2; sodium = 800; cholesterol = 30 }
  else if (/stir.*fry|rice.*bowl|gyro|combo/i.test(n)) { fatPct = 0.35; carbPct = 0.40; proteinPct = 0.25; sugarPct = 0.06; fiber = 3; sodium = 1100; cholesterol = 50 }
  else if (/grilled cheese/i.test(n)) { fatPct = 0.50; carbPct = 0.30; proteinPct = 0.20; sugarPct = 0.04; fiber = 2; sodium = 1000; cholesterol = 60 }

  const fat = Math.round((targetCal * fatPct) / 9)
  const carbs = Math.round((targetCal * carbPct) / 4)
  const protein = Math.round((targetCal * proteinPct) / 4)
  const sugar = Math.round(carbs * sugarPct)

  return { calories: targetCal, carbs, fat, protein, sugar, fiber, sodium, cholesterol, confidence_score: 40 }
}

// ─── Phase 6: Shared Over-Multiplied Profiles ───────────────────────
// Items sharing identical 1868/107/80/162 profile (seafood over-mult) that weren't caught by Phase 2

function fixSharedOverMultiplied(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number>; reason: string }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number>; reason: string }[] = []

  // Known over-multiplied shared profiles (beyond the KNOWN_BAD_PROFILES already handled)
  const SHARED_PROFILES = [
    // 1943 profile items at Hollywood Studios
    { cal: 1943, match: (nd: NutRow) => nd.calories === 1943 },
    // 1857 profile items
    { cal: 1857, match: (nd: NutRow) => nd.calories === 1857 },
  ]

  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd || nd.calories === null) continue
    if (fixedIds.has(nd.id)) continue
    if (item.category === 'beverage') continue
    if ((nd.confidence_score ?? 0) >= 80 && nd.source === 'official') continue

    // These will be caught by Phase 4 (overestimated >1800) — skip to avoid double counting
    // Phase 6 is only for items between 1400-1800 with shared suspicious profiles
    // that weren't caught by known bad profiles in Phase 2
  }

  return fixes // Intentionally empty - Phase 4 handles >1800, Phase 2 handles known profiles
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (use --apply to write) ===' : '=== APPLYING FIXES ===')
  console.log('Fetching all items...')
  const items = await fetchAll()
  console.log(`Fetched ${items.length} items\n`)

  // ─── Phase 1: Earl of Sandwich ───────────────────────────────────
  banner('PHASE 1: Earl of Sandwich Null Macros')
  const eosFixes = fixEarlOfSandwich(items)
  for (const f of eosFixes) {
    const foodType = classifyEosItem(f.item.name)
    console.log(`  ✓ ${f.item.name} [${foodType}] | ${f.nd.calories}cal → C=${f.changes.carbs} F=${f.changes.fat} P=${f.changes.protein ?? f.nd.protein}`)
    await updateNut(f.nd.id, f.changes)
    fixedIds.add(f.nd.id)
  }
  console.log(`  → ${eosFixes.length} items fixed`)

  // ─── Phase 2: Generic Fallback Profiles ──────────────────────────
  banner('PHASE 2: Generic Fallback Profiles')
  const gpFixes = fixGenericProfiles(items)
  for (const f of gpFixes) {
    console.log(`  ✓ ${f.item.name} [${f.profile}] | ${loc(f.item)}`)
    console.log(`    ${f.nd.calories}/${f.nd.carbs}/${f.nd.fat}/${f.nd.protein} → ${f.changes.calories}/${f.changes.carbs}/${f.changes.fat}/${f.changes.protein}`)
    await updateNut(f.nd.id, f.changes)
    fixedIds.add(f.nd.id)
  }
  console.log(`  → ${gpFixes.length} items fixed`)

  // ─── Phase 3: Targeted Wrong Profiles ────────────────────────────
  banner('PHASE 3: Targeted Wrong Profiles')
  const tFixes = fixTargetedItems(items)
  for (const f of tFixes) {
    console.log(`  ✓ ${f.item.name} | ${loc(f.item)}`)
    console.log(`    ${f.reason}`)
    await updateNut(f.nd.id, f.changes)
    fixedIds.add(f.nd.id)
  }
  console.log(`  → ${tFixes.length} items fixed`)

  // ─── Phase 4: Over-Estimated (>1800 cal) ─────────────────────────
  banner('PHASE 4: Over-Estimated Items (>1800 cal)')
  const oFixes = fixOverEstimated(items)
  for (const f of oFixes) {
    console.log(`  ✓ ${f.item.name} | ${loc(f.item)}`)
    console.log(`    ${f.reason}`)
    await updateNut(f.nd.id, f.changes)
    fixedIds.add(f.nd.id)
  }
  console.log(`  → ${oFixes.length} items fixed`)

  // ─── Phase 5: Under-Estimated Entrees ────────────────────────────
  banner('PHASE 5: Under-Estimated Entrees')
  const uFixes = fixUnderEstimated(items)
  for (const f of uFixes) {
    console.log(`  ✓ ${f.item.name} | ${loc(f.item)}`)
    console.log(`    ${f.reason}`)
    await updateNut(f.nd.id, f.changes)
    fixedIds.add(f.nd.id)
  }
  console.log(`  → ${uFixes.length} items fixed`)

  // ─── Summary ─────────────────────────────────────────────────────
  banner('SUMMARY')
  console.log(`  Earl of Sandwich macros:    ${eosFixes.length}`)
  console.log(`  Generic profiles:           ${gpFixes.length}`)
  console.log(`  Targeted wrong profiles:    ${tFixes.length}`)
  console.log(`  Over-estimated (>1800):     ${oFixes.length}`)
  console.log(`  Under-estimated entrees:    ${uFixes.length}`)
  console.log(`  TOTAL:                      ${eosFixes.length + gpFixes.length + tFixes.length + oFixes.length + uFixes.length}`)
  console.log(`${'═'.repeat(70)}`)
  if (DRY_RUN) console.log('\n  Run with --apply to write changes')
}

main().catch(console.error)
