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

// Skip official high-confidence data
function skipOfficial(nd: NutRow): boolean {
  return (nd.confidence_score ?? 0) >= 80 && nd.source === 'official'
}

// ─── Phase 1: Fiber > Carbs ──────────────────────────────────────────
// Fiber is a subset of carbs — impossible for fiber > carbs
function fixFiberCarbs(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number> }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number> }[] = []
  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd || nd.fiber === null || nd.carbs === null) continue
    if (nd.fiber <= nd.carbs) continue

    // For official data (Chicken Guy Caesar), adjust carbs up to include fiber + sugar
    const sugar = nd.sugar ?? 0
    const newCarbs = nd.fiber + sugar + (nd.source === 'official' ? 15 : 5) // add estimated starch
    fixes.push({ item, nd, changes: { carbs: newCarbs } })
  }
  return fixes
}

// ─── Phase 2: Garbage Data — Items with absurdly low calories ────────
// These are bad USDA matches or zeroed items that need realistic estimates
interface TargetFix {
  namePattern: RegExp
  locationPattern?: RegExp
  calories: number
  carbs: number
  fat: number
  protein: number
  sugar: number
  fiber: number
  sodium: number
  cholesterol: number
  reason: string
}

const TARGETED_FIXES: TargetFix[] = [
  // Items flagged at 5-20 cal that should be hundreds
  {
    namePattern: /^Coffee Cake Cookie$/i,
    calories: 680, carbs: 80, fat: 36, protein: 8, sugar: 48, fiber: 2, sodium: 380, cholesterol: 65,
    reason: 'Gideon\'s half-pound cookie — zeroed by regex false positive in earlier fix'
  },
  {
    namePattern: /^Espresso Shake$/i,
    locationPattern: /Mythos/i,
    calories: 750, carbs: 95, fat: 35, protein: 12, sugar: 78, fiber: 1, sodium: 280, cholesterol: 85,
    reason: 'Large espresso milkshake — USDA returned per-tbsp espresso (9 cal)'
  },
  {
    namePattern: /^Macaroni & Cheese \(760 cal\.\)$/i,
    calories: 760, carbs: 68, fat: 42, protein: 26, sugar: 6, fiber: 3, sodium: 1400, cholesterol: 80,
    reason: 'Item name literally says 760 cal but stored as 20'
  },
  {
    namePattern: /^Right Side Up Shake$/i,
    calories: 850, carbs: 110, fat: 38, protein: 14, sugar: 92, fiber: 1, sodium: 320, cholesterol: 95,
    reason: 'Toothsome specialty shake — USDA returned per-oz milk (20 cal)'
  },
  {
    namePattern: /^Side Caesar Salad$/i,
    locationPattern: /Cafe 4/i,
    calories: 250, carbs: 12, fat: 20, protein: 8, sugar: 2, fiber: 2, sodium: 480, cholesterol: 25,
    reason: 'Side caesar salad — USDA returned per-leaf romaine (20 cal)'
  },
  {
    namePattern: /^Braised Beef Short Ribs$/i,
    locationPattern: /VIVO/i,
    calories: 850, carbs: 25, fat: 52, protein: 65, sugar: 8, fiber: 3, sodium: 1100, cholesterol: 120,
    reason: 'Braised short ribs entree — USDA returned per-oz raw beef (100 cal)'
  },
  {
    namePattern: /^Stir-Fried Noodles$/i,
    calories: 450, carbs: 58, fat: 16, protein: 14, sugar: 6, fiber: 3, sodium: 900, cholesterol: 20,
    reason: 'Stir-fried noodles dish — USDA returned bean sprouts (39 cal)'
  },
  {
    namePattern: /^Crispy Brussels$/i,
    locationPattern: /Cowfish/i,
    calories: 350, carbs: 28, fat: 24, protein: 8, sugar: 6, fiber: 5, sodium: 650, cholesterol: 10,
    reason: 'Deep-fried brussels appetizer — USDA returned raw sprouts (43 cal)'
  },
]

function fixGarbageData(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number>; reason: string }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number>; reason: string }[] = []
  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd) continue

    for (const tf of TARGETED_FIXES) {
      if (!tf.namePattern.test(item.name)) continue
      if (tf.locationPattern && !tf.locationPattern.test(loc(item))) continue

      // Skip if already at the target calorie value (idempotent)
      if (nd.calories === tf.calories) break

      fixes.push({
        item, nd,
        changes: {
          calories: tf.calories, carbs: tf.carbs, fat: tf.fat, protein: tf.protein,
          sugar: tf.sugar, fiber: tf.fiber, sodium: tf.sodium, cholesterol: tf.cholesterol,
        },
        reason: tf.reason
      })
      break
    }
  }
  return fixes
}

// ─── Phase 3: Macro-Ratio Fixes ──────────────────────────────────────
function fixMacroRatios(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number>; reason: string }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number>; reason: string }[] = []
  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd || !nd.calories || nd.calories <= 0) continue
    if (fixedIds.has(nd.id)) continue
    if (skipOfficial(nd)) continue

    const n = item.name.toLowerCase()
    const cal = nd.calories

    // Grilled Chicken BLT Sandwich: 850 cal but only 15g protein
    if (/grilled chicken.*sandwich|chicken.*blt/i.test(n) && (nd.protein ?? 0) < 20 && cal > 500) {
      const targetProtein = Math.round(cal * 0.22 / 4) // 22% cal from protein
      const protDiff = targetProtein - (nd.protein ?? 0)
      const newCarbs = Math.max(20, (nd.carbs ?? 0) - Math.round(protDiff * 0.5))
      fixes.push({ item, nd, changes: { protein: targetProtein, carbs: newCarbs }, reason: 'Chicken sandwich with <20g protein' })
      continue
    }

    // BBQ Beef Rice Bowl: 200 cal for beef + rice is way too low
    if (/beef.*rice.*bowl|rice.*bowl.*beef/i.test(n) && cal < 300) {
      fixes.push({
        item, nd,
        changes: { calories: 650, carbs: 65, fat: 22, protein: 38, sugar: 10, fiber: 3, sodium: 1100, cholesterol: 60 },
        reason: 'Beef rice bowl at 200 cal — bad USDA match'
      })
      continue
    }

    // Cookie with <15g carbs (cookies are 50-60% carbs)
    if (/cookie/i.test(n) && item.category === 'dessert' && (nd.carbs ?? 0) < 15 && cal > 100) {
      const targetCarbs = Math.round(cal * 0.52 / 4)
      const targetSugar = Math.round(targetCarbs * 0.6)
      fixes.push({ item, nd, changes: { carbs: targetCarbs, sugar: targetSugar }, reason: 'Cookie with <15g carbs' })
      continue
    }
  }
  return fixes
}

// ─── Phase 4: Under-Portioned Items (USDA per-piece/per-slice/per-100g) ─

// Beverage detection (reuse from fix-caloric-plausibility.ts)
function isLikelyBeverage(name: string, category: string): boolean {
  if (category === 'beverage') return true
  const n = name.toLowerCase()
  if (/\b(modelo|corona|heineken|budweiser|stella artois|yuengling|samuel adams|peroni|coors|blue moon|strongbow|schöfferhofer|bud light|michelob|dos equis|pacifico|lagunitas|goose island|cigar city|funky buddha|sierra nevada|fat tire|blue point|high noon)\b/i.test(n)) return true
  if (/\b(ipa|pilsner|lager|stout|porter|hefeweizen|shandy|gose|amber|pale ale|wheat beer|draft beer|craft beer|on tap)\b/i.test(n) && !/batter|bread|sauce|braise|glaze|crust/i.test(n)) return true
  if (/\b(martini|margarita|mojito|daiquiri|paloma|negroni|spritz|mule|bellini|mimosa|sangria|old fashioned|mai tai|piña colada|cosmopolitan|manhattan|sidecar|fizz|sour|sazerac)\b/i.test(n) && !/burger|chicken|pork|steak|fries|sandwich/i.test(n)) return true
  if (/\b(tequila|mezcal|vodka|bourbon|whisky|whiskey|scotch|rum|gin|brandy|cognac|sake|soju)\b/i.test(n) && !/batter|sauce|braise|glaze|alla vodka|penne vodka|bourbon glaze|rum cake|bourbon sauce|whiskey sauce/i.test(n)) return true
  if (/\b(pinot|cabernet|chardonnay|merlot|riesling|sauvignon blanc|prosecco|champagne|rosé|shiraz|malbec|zinfandel|chianti)\b/i.test(n) && !/sauce|braise|reduction|glaze/i.test(n)) return true
  if (/\b(cold brew|espresso|latte|cappuccino|americano|macchiato|smoothie|milkshake|juice|soda|lemonade|tea\b|chai\b|matcha|refresher|punch|agua fresca|boba)\b/i.test(n) && !/cake|cookie|brownie|ice cream|crust|sauce/i.test(n)) return true
  if (/\b(butterbeer|wizard'?s brew|gillywater|grog|mead|freeze|slush)\b/i.test(n) && !/fudge|ice cream|cake/i.test(n)) return true
  return false
}

interface PortionProfile {
  namePattern: RegExp
  exclude?: RegExp
  category?: string // restrict to this category
  minExpectedCal: number
  maxExpectedCal: number
  targetCal: number // if below min, scale up to this
  targetFatPct: number
  targetCarbPct: number
  targetProteinPct: number
  sugarPctOfCarbs: number
  fiber: number
  sodium: number
  cholesterol: number
  name: string
}

const PORTION_PROFILES: PortionProfile[] = [
  // Turkey legs — USDA returns per-100g (~160 cal), park turkey legs are ~700g (1000+ cal)
  {
    namePattern: /turkey leg/i,
    minExpectedCal: 600, maxExpectedCal: 1200, targetCal: 1050,
    targetFatPct: 0.45, targetCarbPct: 0.02, targetProteinPct: 0.53,
    sugarPctOfCarbs: 0, fiber: 0, sodium: 2200, cholesterol: 285,
    name: 'turkey_leg'
  },
  // Milkshakes — USDA returns per-8oz (~300 cal), park shakes are 16-24oz (600-1000 cal)
  {
    namePattern: /shake|milkshake|malt/i,
    exclude: /steak|shaker|salt|single malt|flight|whisky|whiskey|scotch/i,
    minExpectedCal: 400, maxExpectedCal: 1100, targetCal: 700,
    targetFatPct: 0.38, targetCarbPct: 0.52, targetProteinPct: 0.10,
    sugarPctOfCarbs: 0.82, fiber: 1, sodium: 300, cholesterol: 80,
    name: 'milkshake'
  },
  // Funnel cakes — USDA returns standard funnel cake (~300 cal), park versions are huge with toppings
  {
    namePattern: /funnel cake/i,
    exclude: /topping/i,
    minExpectedCal: 500, maxExpectedCal: 1200, targetCal: 760,
    targetFatPct: 0.40, targetCarbPct: 0.50, targetProteinPct: 0.10,
    sugarPctOfCarbs: 0.50, fiber: 2, sodium: 500, cholesterol: 55,
    name: 'funnel_cake'
  },
  // Pizza — USDA returns per-slice (~280 cal), parks serve personal/large slices (500-900 cal)
  {
    namePattern: /pizza|flatbread/i,
    exclude: /bagel bite|mini|roll|dough|bitz|buns|bread(?! pizza)|station|kid|personal|add .* to any/i,
    minExpectedCal: 400, maxExpectedCal: 1400, targetCal: 650,
    targetFatPct: 0.38, targetCarbPct: 0.40, targetProteinPct: 0.22,
    sugarPctOfCarbs: 0.10, fiber: 3, sodium: 1200, cholesterol: 45,
    name: 'pizza'
  },
  // Chicken tenders/strips/nuggets — USDA returns per-piece (~80 cal), parks serve 3-5 piece plates (400-700 cal)
  {
    namePattern: /chicken tender|chicken strip|chicken finger|chicken nugget|chicken breast tender/i,
    exclude: /1 pc|single|side of/i,
    minExpectedCal: 350, maxExpectedCal: 1000, targetCal: 550,
    targetFatPct: 0.45, targetCarbPct: 0.28, targetProteinPct: 0.27,
    sugarPctOfCarbs: 0.05, fiber: 2, sodium: 1100, cholesterol: 65,
    name: 'chicken_tenders'
  },
  // Doughnuts — USDA returns standard (~250 cal), park doughnuts can be 400-700 cal
  {
    namePattern: /doughnut|donut/i,
    exclude: /hole|mini|bite|burger|chicken.*doughnut|fried chicken.*doughnut/i,
    minExpectedCal: 350, maxExpectedCal: 900, targetCal: 480,
    targetFatPct: 0.42, targetCarbPct: 0.48, targetProteinPct: 0.10,
    sugarPctOfCarbs: 0.55, fiber: 1, sodium: 350, cholesterol: 40,
    name: 'doughnut'
  },
  // Nachos — USDA returns plain chips (~140 cal), loaded nachos are 600-1200 cal
  {
    namePattern: /nachos|totchos/i,
    minExpectedCal: 500, maxExpectedCal: 1400, targetCal: 800,
    targetFatPct: 0.48, targetCarbPct: 0.32, targetProteinPct: 0.20,
    sugarPctOfCarbs: 0.08, fiber: 5, sodium: 1400, cholesterol: 55,
    name: 'nachos'
  },
  // Burgers — USDA can return patty-only (~250 cal), park burgers with bun/toppings are 600-1400 cal
  {
    namePattern: /burger|cheeseburger/i,
    exclude: /slider|mini|kid|impossible bite|veggie burger|vegan.*burger|jr\.|junior|donut burger/i,
    minExpectedCal: 450, maxExpectedCal: 1400, targetCal: 750,
    targetFatPct: 0.45, targetCarbPct: 0.28, targetProteinPct: 0.27,
    sugarPctOfCarbs: 0.10, fiber: 3, sodium: 1200, cholesterol: 85,
    name: 'burger'
  },
  // Sandwiches — USDA can return filling only, park sandwiches are 500-1000 cal
  {
    namePattern: /sandwich|panini|sub\b|po.boy|hoagie|club/i,
    exclude: /kid|slider|mini|ice cream sandwich|cookie sandwich|macaron sandwich|churro.*sandwich|thin mint.*sandwich|dipped.*sandwich|uncrustable|make any.*combo|earl of sandwich potato|combo$/i,
    minExpectedCal: 400, maxExpectedCal: 1200, targetCal: 600,
    targetFatPct: 0.38, targetCarbPct: 0.36, targetProteinPct: 0.26,
    sugarPctOfCarbs: 0.08, fiber: 3, sodium: 1100, cholesterol: 65,
    name: 'sandwich'
  },
  // Mac & Cheese — USDA returns per-cup (~300 cal), park portions are 600-1000 cal
  {
    namePattern: /mac.*cheese|macaroni.*cheese/i,
    exclude: /side|small|kid/i,
    minExpectedCal: 400, maxExpectedCal: 1100, targetCal: 700,
    targetFatPct: 0.45, targetCarbPct: 0.38, targetProteinPct: 0.17,
    sugarPctOfCarbs: 0.08, fiber: 2, sodium: 1200, cholesterol: 60,
    name: 'mac_cheese'
  },
  // Steak entrees — USDA returns per-3oz (~200 cal), park steaks are 8-16oz (500-1100 cal)
  {
    namePattern: /steak|filet mignon|ribeye|rib.?eye|strip steak|sirloin|ny strip|new york strip/i,
    exclude: /cauliflower|mushroom|cheese.?steak|steak fries|steak sauce|steak seasoning|vegan|\d+\s*oz/i,
    category: 'entree',
    minExpectedCal: 400, maxExpectedCal: 1400, targetCal: 650,
    targetFatPct: 0.45, targetCarbPct: 0.15, targetProteinPct: 0.40,
    sugarPctOfCarbs: 0.10, fiber: 2, sodium: 800, cholesterol: 120,
    name: 'steak'
  },
  // Cookies — USDA returns standard grocery cookie (~150 cal), park cookies are oversized (350-700 cal)
  {
    namePattern: /cookie/i,
    exclude: /mini|bite|thin/i,
    category: 'dessert',
    minExpectedCal: 250, maxExpectedCal: 1000, targetCal: 400,
    targetFatPct: 0.40, targetCarbPct: 0.50, targetProteinPct: 0.10,
    sugarPctOfCarbs: 0.60, fiber: 1, sodium: 300, cholesterol: 45,
    name: 'cookie'
  },
  // Ribs — USDA can return per-bone (~150 cal), park portions are half-rack+ (600-1200 cal)
  {
    namePattern: /ribs|rib plate|rib platter|rack of ribs|baby back/i,
    exclude: /short rib|rib.?eye|riblet/i,
    minExpectedCal: 500, maxExpectedCal: 1500, targetCal: 800,
    targetFatPct: 0.48, targetCarbPct: 0.20, targetProteinPct: 0.32,
    sugarPctOfCarbs: 0.25, fiber: 1, sodium: 1400, cholesterol: 110,
    name: 'ribs'
  },
  // Caesar salad (entree) — USDA returns side portion (~100 cal), entree caesars are 400-800 cal
  {
    namePattern: /caesar salad/i,
    exclude: /side|small/i,
    category: 'entree',
    minExpectedCal: 300, maxExpectedCal: 900, targetCal: 500,
    targetFatPct: 0.55, targetCarbPct: 0.22, targetProteinPct: 0.23,
    sugarPctOfCarbs: 0.12, fiber: 4, sodium: 900, cholesterol: 55,
    name: 'caesar_salad'
  },
  // Cupcakes — USDA returns standard (~200 cal), park cupcakes are huge (400-700 cal)
  {
    namePattern: /cupcake/i,
    minExpectedCal: 350, maxExpectedCal: 1100, targetCal: 550,
    targetFatPct: 0.38, targetCarbPct: 0.52, targetProteinPct: 0.10,
    sugarPctOfCarbs: 0.65, fiber: 1, sodium: 350, cholesterol: 55,
    name: 'cupcake'
  },
  // Hot dogs — USDA returns standard (~250 cal), park loaded dogs are 450-800 cal
  {
    namePattern: /hot dog|corn dog/i,
    exclude: /kid|mini|slider/i,
    minExpectedCal: 350, maxExpectedCal: 900, targetCal: 550,
    targetFatPct: 0.48, targetCarbPct: 0.30, targetProteinPct: 0.22,
    sugarPctOfCarbs: 0.10, fiber: 2, sodium: 1200, cholesterol: 50,
    name: 'hot_dog'
  },
  // Ice cream sundae / cup — USDA returns per-scoop (~140 cal), park sundaes are 400-900 cal
  {
    namePattern: /sundae|ice cream (cup|bowl|sundae)|banana split/i,
    minExpectedCal: 350, maxExpectedCal: 1000, targetCal: 550,
    targetFatPct: 0.38, targetCarbPct: 0.52, targetProteinPct: 0.10,
    sugarPctOfCarbs: 0.72, fiber: 1, sodium: 200, cholesterol: 80,
    name: 'ice_cream_sundae'
  },
  // Brownie — USDA returns standard (~230 cal), park brownies are oversized (350-600 cal)
  {
    namePattern: /brownie/i,
    exclude: /bite|mini/i,
    minExpectedCal: 300, maxExpectedCal: 800, targetCal: 450,
    targetFatPct: 0.42, targetCarbPct: 0.48, targetProteinPct: 0.10,
    sugarPctOfCarbs: 0.65, fiber: 2, sodium: 280, cholesterol: 50,
    name: 'brownie'
  },
]

function fixUnderPortioned(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number>; profile: string }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number>; profile: string }[] = []

  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd || !nd.calories || nd.calories <= 0) continue
    if (fixedIds.has(nd.id)) continue
    if (skipOfficial(nd)) continue
    if (isLikelyBeverage(item.name, item.category)) continue

    for (const prof of PORTION_PROFILES) {
      if (!prof.namePattern.test(item.name)) continue
      if (prof.exclude && prof.exclude.test(item.name)) continue
      if (prof.category && item.category !== prof.category) continue

      // If item name contains calorie info, use that instead
      const calInName = item.name.match(/\((\d{3,4})\s*cal\.?\)/i)
      if (calInName) {
        const statedCal = parseInt(calInName[1])
        if (Math.abs(nd.calories - statedCal) > 50) {
          // Name says one cal, data says another — trust the name
          const scale = statedCal / prof.targetCal
          const changes: Record<string, number> = {
            calories: statedCal,
            fat: Math.round((statedCal * prof.targetFatPct) / 9),
            carbs: Math.round((statedCal * prof.targetCarbPct) / 4),
            protein: Math.round((statedCal * prof.targetProteinPct) / 4),
            sugar: Math.round((statedCal * prof.targetCarbPct / 4) * prof.sugarPctOfCarbs),
            fiber: prof.fiber,
            sodium: Math.round(prof.sodium * scale),
            cholesterol: Math.round(prof.cholesterol * scale),
          }
          if (changes.sugar > changes.carbs) changes.sugar = changes.carbs
          fixes.push({ item, nd, changes, profile: `${prof.name} (name says ${statedCal} cal)` })
        }
        break
      }

      // Only fix items that are below the minimum expected
      if (nd.calories >= prof.minExpectedCal) break

      // Scale up to target
      const newCal = prof.targetCal
      const changes: Record<string, number> = {
        calories: newCal,
        fat: Math.round((newCal * prof.targetFatPct) / 9),
        carbs: Math.round((newCal * prof.targetCarbPct) / 4),
        protein: Math.round((newCal * prof.targetProteinPct) / 4),
        sugar: Math.round((newCal * prof.targetCarbPct / 4) * prof.sugarPctOfCarbs),
        fiber: prof.fiber,
        sodium: prof.sodium,
        cholesterol: prof.cholesterol,
      }

      // Validate sugar <= carbs
      if (changes.sugar > changes.carbs) changes.sugar = changes.carbs

      fixes.push({ item, nd, changes, profile: prof.name })
      break // first matching profile wins
    }
  }
  return fixes
}

// ─── Phase 5: MEDIUM Plausibility Macro Fixes ─────────────────────────
// Fix individual macro values that are clearly wrong for the food type
function fixMacroAnomalies(items: Item[]): { item: Item; nd: NutRow; changes: Record<string, number>; reason: string }[] {
  const fixes: { item: Item; nd: NutRow; changes: Record<string, number>; reason: string }[] = []

  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd || !nd.calories || nd.calories <= 0) continue
    if (fixedIds.has(nd.id)) continue
    if (skipOfficial(nd)) continue
    if (isLikelyBeverage(item.name, item.category)) continue

    const n = item.name.toLowerCase()
    const cal = nd.calories
    const carbs = nd.carbs ?? 0
    const fat = nd.fat ?? 0
    const protein = nd.protein ?? 0

    // Steak/meat entrees with >50g carbs (steak entrees should be 0-30g carbs unless they come with a carb side)
    if (/filet mignon|ribeye|rib.?eye|strip steak|sirloin/i.test(n)
      && !/cauliflower|mushroom/i.test(n)
      && item.category === 'entree'
      && carbs > 50
      && !/potato|fries|rice|pasta|mac|mashed/i.test(n)
      && !/potato|fries|rice|pasta|mac|mashed/i.test(item.description ?? '')) {
      // Steak without starch side: cap carbs at 15, redistribute to fat/protein
      const carbExcess = carbs - 15
      const carbCalReduce = carbExcess * 4
      const newFat = fat + Math.round(carbCalReduce * 0.5 / 9)
      const newProtein = protein + Math.round(carbCalReduce * 0.5 / 4)
      fixes.push({
        item, nd,
        changes: { carbs: 15, fat: newFat, protein: newProtein, sugar: Math.min(nd.sugar ?? 0, 10) },
        reason: `Steak with ${carbs}g carbs — capped at 15g, redistributed to fat/protein`
      })
      continue
    }

    // Old Fashioned Burger with 4g carbs — needs bun (~30g carbs)
    if (/burger|cheeseburger/i.test(n) && !/slider|lettuce wrap|bunless|low.?carb/i.test(n)
      && carbs < 20 && cal > 400) {
      const newCarbs = Math.round(cal * 0.28 / 4) // 28% from carbs
      const carbDiff = newCarbs - carbs
      const newFat = Math.max(10, fat - Math.round(carbDiff * 4 * 0.5 / 9))
      fixes.push({
        item, nd,
        changes: { carbs: newCarbs, fat: newFat, sugar: Math.round(newCarbs * 0.10) },
        reason: `Burger with only ${carbs}g carbs — bun alone is 25-35g`
      })
      continue
    }

    // Hot dog with <15g carbs — needs bun
    if (/hot dog|corn dog/i.test(n) && carbs < 15 && cal > 250) {
      const newCarbs = Math.round(cal * 0.30 / 4)
      fixes.push({
        item, nd,
        changes: { carbs: newCarbs, sugar: Math.round(newCarbs * 0.10) },
        reason: `Hot dog with only ${carbs}g carbs — bun adds 25g+`
      })
      continue
    }

    // Mac & cheese with <10g fat — impossible, mac & cheese is fat-heavy
    if (/mac.*cheese|macaroni.*cheese/i.test(n) && fat < 10 && cal > 300) {
      const newFat = Math.round(cal * 0.42 / 9)
      const newProtein = Math.round(cal * 0.17 / 4)
      fixes.push({
        item, nd,
        changes: { fat: newFat, protein: newProtein },
        reason: `Mac & cheese with only ${fat}g fat — cheese/cream should yield 30-50g`
      })
      continue
    }

    // Nachos with <10g protein — loaded nachos have beef/chicken/cheese
    if (/nachos|totchos/i.test(n) && protein < 10 && cal > 400) {
      const newProtein = Math.round(cal * 0.15 / 4)
      fixes.push({
        item, nd,
        changes: { protein: newProtein },
        reason: `Nachos with only ${protein}g protein — meat/cheese toppings add 15-30g`
      })
      continue
    }

    // Ice cream with >25g protein — suspicious
    if (/ice cream|gelato|sorbet/i.test(n) && protein > 25 && cal < 600) {
      const newProtein = Math.round(cal * 0.08 / 4)
      fixes.push({
        item, nd,
        changes: { protein: newProtein },
        reason: `Ice cream with ${protein}g protein — should be 3-10g per serving`
      })
      continue
    }

    // Shake/milkshake with <10g fat — shakes are cream/milk heavy
    if (/shake|milkshake|malt/i.test(n) && !/steak|salt/i.test(n) && fat < 10 && cal > 400) {
      const newFat = Math.round(cal * 0.35 / 9)
      fixes.push({
        item, nd,
        changes: { fat: newFat },
        reason: `Shake with only ${fat}g fat — cream/milk/ice cream base should yield 20-40g`
      })
      continue
    }
  }
  return fixes
}

// ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (use --apply to write) ===' : '=== APPLYING FIXES ===')
  console.log('Fetching all items...')
  const items = await fetchAll()
  console.log(`Fetched ${items.length} items\n`)

  // ─── Phase 1: Fiber > Carbs ──────────────────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log('  PHASE 1: Fiber > Carbs Violations')
  console.log(`${'═'.repeat(70)}`)
  const fcFixes = fixFiberCarbs(items)
  for (const f of fcFixes) {
    console.log(`  ✓ ${f.item.name} | ${loc(f.item)}`)
    console.log(`    fiber=${f.nd.fiber}, carbs=${f.nd.carbs}→${f.changes.carbs}`)
    await updateNut(f.nd.id, { ...f.changes, confidence_score: 40 })
    fixedIds.add(f.nd.id)
  }
  console.log(`  → ${fcFixes.length} items fixed\n`)

  // ─── Phase 2: Garbage Data ───────────────────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log('  PHASE 2: Garbage Data (bad USDA matches, zeroed items)')
  console.log(`${'═'.repeat(70)}`)
  const gdFixes = fixGarbageData(items)
  for (const f of gdFixes) {
    console.log(`  ✓ ${f.item.name} | ${loc(f.item)}`)
    console.log(`    ${f.reason}`)
    console.log(`    cal=${f.nd.calories}→${f.changes.calories}`)
    await updateNut(f.nd.id, { ...f.changes, confidence_score: 40 })
    fixedIds.add(f.nd.id)
  }
  console.log(`  → ${gdFixes.length} items fixed\n`)

  // ─── Phase 3: Macro Ratio Fixes ──────────────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log('  PHASE 3: Macro Ratio Anomalies')
  console.log(`${'═'.repeat(70)}`)
  const mrFixes = fixMacroRatios(items)
  for (const f of mrFixes) {
    console.log(`  ✓ ${f.item.name} | ${loc(f.item)}`)
    console.log(`    ${f.reason}`)
    if (f.changes.calories) console.log(`    cal=${f.nd.calories}→${f.changes.calories}`)
    if (f.changes.protein) console.log(`    protein=${f.nd.protein}→${f.changes.protein}`)
    if (f.changes.carbs) console.log(`    carbs=${f.nd.carbs}→${f.changes.carbs}`)
    await updateNut(f.nd.id, { ...f.changes, confidence_score: 40 })
    fixedIds.add(f.nd.id)
  }
  console.log(`  → ${mrFixes.length} items fixed\n`)

  // ─── Phase 4: Under-Portioned Items ──────────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log('  PHASE 4: Under-Portioned Items (USDA per-piece/per-slice → park serving)')
  console.log(`${'═'.repeat(70)}`)
  const upFixes = fixUnderPortioned(items)
  for (const f of upFixes) {
    console.log(`  ✓ ${f.item.name} [${f.profile}] | ${loc(f.item)}`)
    console.log(`    cal=${f.nd.calories}→${f.changes.calories}`)
    await updateNut(f.nd.id, { ...f.changes, confidence_score: 40 })
    fixedIds.add(f.nd.id)
  }
  console.log(`  → ${upFixes.length} items fixed\n`)

  // ─── Phase 5: MEDIUM Macro Anomalies ─────────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log('  PHASE 5: MEDIUM Plausibility Macro Fixes')
  console.log(`${'═'.repeat(70)}`)
  const maFixes = fixMacroAnomalies(items)
  for (const f of maFixes) {
    console.log(`  ✓ ${f.item.name} | ${loc(f.item)}`)
    console.log(`    ${f.reason}`)
    await updateNut(f.nd.id, { ...f.changes, confidence_score: 40 })
    fixedIds.add(f.nd.id)
  }
  console.log(`  → ${maFixes.length} items fixed\n`)

  // ─── Summary ─────────────────────────────────────────────────────
  console.log(`${'═'.repeat(70)}`)
  console.log('  SUMMARY')
  console.log(`${'═'.repeat(70)}`)
  console.log(`  Fiber > Carbs:         ${fcFixes.length}`)
  console.log(`  Garbage data:          ${gdFixes.length}`)
  console.log(`  Macro ratio:           ${mrFixes.length}`)
  console.log(`  Under-portioned:       ${upFixes.length}`)
  console.log(`  Macro anomalies:       ${maFixes.length}`)
  console.log(`  TOTAL:                 ${fcFixes.length + gdFixes.length + mrFixes.length + upFixes.length + maFixes.length}`)
  console.log(`${'═'.repeat(70)}`)
  if (DRY_RUN) console.log('\n  Run with --apply to write changes')
}

main().catch(console.error)
