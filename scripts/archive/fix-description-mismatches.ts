import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const DRY_RUN = !process.argv.includes('--apply')

// ── Types ────────────────────────────────────────────────────────────────

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
  is_vegetarian: boolean
  is_fried: boolean
  description: string | null
  restaurant: { name: string; park: { name: string } }
  nutritional_data: NutRow[]
}

// ── Fetch all items ──────────────────────────────────────────────────────

async function fetchAll(): Promise<Item[]> {
  const all: Item[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from('menu_items')
      .select('id, name, category, is_vegetarian, is_fried, description, restaurant:restaurants(name, park:parks(name)), nutritional_data(id, menu_item_id, calories, carbs, fat, sugar, protein, fiber, sodium, cholesterol, source, confidence_score)')
      .range(from, from + 499)
    if (error) { console.error(error); break }
    if (!data || data.length === 0) break
    all.push(...(data as unknown as Item[]))
    if (data.length < 500) break
    from += 500
  }
  return all
}

// ── Ingredient detection (from descriptions) ─────────────────────────────

const HIGH_FAT_INGREDIENTS = [
  'bacon', 'cheese', 'cheddar', 'swiss', 'provolone', 'mozzarella', 'brie',
  'cream', 'butter', 'aioli', 'mayo', 'ranch', 'gravy', 'hollandaise',
  'avocado', 'guacamole', 'pork belly', 'chorizo', 'sausage',
  'fried', 'crispy', 'battered', 'tempura', 'breaded',
  'alfredo', 'béchamel', 'beurre', 'truffle',
]

const HIGH_CARB_INGREDIENTS = [
  'fries', 'tots', 'potato',
  'rice', 'noodles', 'pasta', 'bread', 'bun', 'roll', 'tortilla', 'pita',
  'waffle', 'pancake', 'biscuit', 'cornbread',
]

const PROTEIN_INGREDIENTS = [
  'steak', 'beef', 'chicken', 'pork', 'lamb', 'duck', 'turkey',
  'shrimp', 'lobster', 'crab', 'salmon', 'tuna', 'fish',
  'egg', 'pulled pork', 'brisket', 'ribs',
]

function countIngredientHits(desc: string): {
  fatHits: string[]; carbHits: string[]; proteinHits: string[]
} {
  const d = desc.toLowerCase()
  const fatHits = HIGH_FAT_INGREDIENTS.filter(kw => d.includes(kw))
  const carbHits = HIGH_CARB_INGREDIENTS.filter(kw => d.includes(kw))
  const proteinHits = PROTEIN_INGREDIENTS.filter(kw => d.includes(kw))
  return { fatHits, carbHits, proteinHits }
}

function expectedMinCalFromDesc(
  fatHits: string[], carbHits: string[], proteinHits: string[], category: string
): number {
  let base = 0
  base += fatHits.length * 100
  base += carbHits.length * 200
  base += proteinHits.length * 180
  if (category === 'entree') base = Math.max(base, 400)
  if (category === 'dessert') base = Math.max(base, 200)
  if (category === 'snack') base = Math.max(base, 150)
  return base
}

// ── Minimum calorie thresholds per dish type (for name-based detection) ───
// If an item's name matches a dish profile and calories are below minCal,
// it's flagged regardless of description content.
const DISH_MIN_CAL: Record<string, number> = {
  kids_meal: 150,
  wings: 300,
  nachos: 350,
  bbq_platter: 500,
  burger: 350,
  sandwich: 300,
  pasta: 350,
  noodle_bowl: 300,
  pizza: 300,
  taco: 200,
  soup: 150,
  fried_entree: 300,
  grilled_entree: 300,
  salad: 200,
  sushi_roll: 150,
  poke_bowl: 250,
  breakfast: 300,
  appetizer: 150,
  dessert: 150,
  side: 100,
  generic_entree: 300,
}

// Beverage detection for items miscategorized as food
function isLikelyDrink(item: Item): boolean {
  const n = item.name.toLowerCase()
  if (item.category === 'beverage') return true
  // Alcoholic drinks
  if (/\b(beer|ale|lager|ipa|pilsner|stout|porter|wine|cocktail|margarita|mojito|daiquiri|martini|sangria|spritz|mule|bellini|mimosa|sour|fizz|highball|toddy|negroni|paloma|sazerac|flight)\b/i.test(n) &&
      !/cake|cookie|brownie|sauce|batter|bread|ice cream/i.test(n)) return true
  // Spirit names
  if (/\b(tequila|mezcal|vodka|bourbon|whisky|whiskey|scotch|rum|gin|brandy|sake|soju)\b/i.test(n) &&
      !/sauce|glaze|cake|braised/i.test(n)) return true
  // Specific wine varietals
  if (/\b(chardonnay|cabernet|merlot|pinot|riesling|prosecco|champagne|rosé|shiraz|malbec)\b/i.test(n)) return true
  // Non-alcoholic drinks
  if (/\b(cold brew|espresso|latte|cappuccino|americano|smoothie|milkshake|juice|soda|lemonade|tea\b|matcha|refresher|slush)\b/i.test(n) &&
      !/cake|cookie|crust|sauce/i.test(n)) return true
  // Beer brands
  if (/\b(modelo|corona|heineken|budweiser|stella|yuengling|peroni|strongbow|blue moon|high noon)\b/i.test(n)) return true
  return false
}

// ── Detection: should this item be fixed? ────────────────────────────────
// Dual approach: name-based profile detection + description-based ingredient detection

function shouldFix(item: Item, nd: NutRow): { expected: number; severity: string; method: string } | null {
  if (!nd.calories || nd.calories <= 0) return null

  // Skip high-confidence official data
  if ((nd.confidence_score ?? 0) >= 80 && nd.source === 'official') return null

  // Skip beverages
  if (isLikelyDrink(item)) return null

  // Skip prix fixe / tasting menu / buffet / topping / add-on items
  const n = item.name.toLowerCase()
  if (/prix fixe|tasting menu|buffet|all.you.can/i.test(n)) return null
  if (/^(topping|add-on|side of|extra|garnish|dipping sauce|dressing)/i.test(n)) return null
  // Skip generic menu section headers
  if (/^(sides|drinks|desserts|appetizers|entrees|beverages|salads|soups|specials)$/i.test(n.trim())) return null
  // Skip items named "Salad Enhancement", "Add Protein", etc.
  if (/^(salad enhancement|add protein|add .* to)/i.test(n)) return null

  const cal = nd.calories

  // ── Method 1: Name-based profile detection ─────────────────────────
  // If the item name clearly identifies a dish type, check against minimum
  const profile = detectDishType(item)
  const minCal = DISH_MIN_CAL[profile.type] ?? 200

  // Only use name-based detection for specific dish profiles
  // Generic fallbacks (generic_entree, appetizer, dessert, side) are too broad
  const isSpecificProfile = !['generic_entree', 'appetizer', 'dessert', 'side'].includes(profile.type)

  if (isSpecificProfile && cal < minCal) {
    const severity = cal < minCal * 0.5 ? 'CRITICAL' : 'SIGNIFICANT'
    return { expected: profile.baseCal, severity, method: `name:${profile.type}` }
  }

  // ── Method 2: Description-based ingredient detection ───────────────
  const desc = item.description
  if (desc && desc.length >= 15) {
    const { fatHits, carbHits, proteinHits } = countIngredientHits(desc)
    const totalHits = fatHits.length + carbHits.length + proteinHits.length
    if (totalHits >= 2) {
      const expectedMin = expectedMinCalFromDesc(fatHits, carbHits, proteinHits, item.category)
      if (cal < expectedMin * 0.5) {
        return { expected: expectedMin, severity: 'CRITICAL', method: 'desc' }
      }
      if (cal < expectedMin * 0.7) {
        return { expected: expectedMin, severity: 'SIGNIFICANT', method: 'desc' }
      }
    }
  }

  return null
}

// ── Dish type detection ──────────────────────────────────────────────────

interface DishProfile {
  type: string
  baseCal: number
  fatPct: number
  carbPct: number
  proteinPct: number
  sugarPctOfCarbs: number
  fiber: number
  sodium: number
  maxCal: number
  // Ingredients already accounted for in baseCal — skip these as additions
  implied: Set<string>
}

const DISH_PROFILES: DishProfile[] = [
  // Order matters — more specific patterns first
  { type: 'kids_meal',     baseCal: 350, fatPct: 0.40, carbPct: 0.35, proteinPct: 0.25, sugarPctOfCarbs: 0.10, fiber: 2, sodium: 800,  maxCal: 700,  implied: new Set(['bread', 'fries']) },
  { type: 'wings',         baseCal: 600, fatPct: 0.55, carbPct: 0.15, proteinPct: 0.30, sugarPctOfCarbs: 0.05, fiber: 1, sodium: 1800, maxCal: 1200, implied: new Set(['chicken']) },
  { type: 'nachos',        baseCal: 700, fatPct: 0.50, carbPct: 0.30, proteinPct: 0.20, sugarPctOfCarbs: 0.05, fiber: 4, sodium: 1400, maxCal: 1400, implied: new Set(['cheese', 'tortilla']) },
  { type: 'bbq_platter',   baseCal: 900, fatPct: 0.42, carbPct: 0.30, proteinPct: 0.28, sugarPctOfCarbs: 0.08, fiber: 4, sodium: 1600, maxCal: 1800, implied: new Set(['beef', 'pork', 'bread']) },
  { type: 'burger',        baseCal: 550, fatPct: 0.45, carbPct: 0.30, proteinPct: 0.25, sugarPctOfCarbs: 0.10, fiber: 3, sodium: 1200, maxCal: 1400, implied: new Set(['beef', 'bread']) },
  { type: 'sandwich',      baseCal: 500, fatPct: 0.38, carbPct: 0.38, proteinPct: 0.24, sugarPctOfCarbs: 0.08, fiber: 3, sodium: 1100, maxCal: 1100, implied: new Set(['bread']) },  // primary protein is an extra
  { type: 'pasta',         baseCal: 600, fatPct: 0.35, carbPct: 0.45, proteinPct: 0.20, sugarPctOfCarbs: 0.08, fiber: 3, sodium: 1000, maxCal: 1200, implied: new Set([]) },
  { type: 'noodle_bowl',   baseCal: 550, fatPct: 0.30, carbPct: 0.45, proteinPct: 0.25, sugarPctOfCarbs: 0.10, fiber: 3, sodium: 1400, maxCal: 1100, implied: new Set(['rice']) },
  { type: 'pizza',         baseCal: 550, fatPct: 0.38, carbPct: 0.40, proteinPct: 0.22, sugarPctOfCarbs: 0.08, fiber: 3, sodium: 1200, maxCal: 1200, implied: new Set(['bread', 'cheese']) },
  { type: 'taco',          baseCal: 450, fatPct: 0.40, carbPct: 0.35, proteinPct: 0.25, sugarPctOfCarbs: 0.05, fiber: 4, sodium: 1000, maxCal: 1000, implied: new Set(['tortilla']) },
  { type: 'soup',          baseCal: 350, fatPct: 0.40, carbPct: 0.35, proteinPct: 0.25, sugarPctOfCarbs: 0.08, fiber: 3, sodium: 1400, maxCal: 800,  implied: new Set([]) },
  { type: 'fried_entree',  baseCal: 600, fatPct: 0.48, carbPct: 0.32, proteinPct: 0.20, sugarPctOfCarbs: 0.05, fiber: 2, sodium: 1200, maxCal: 1200, implied: new Set([]) },
  { type: 'grilled_entree',baseCal: 550, fatPct: 0.38, carbPct: 0.30, proteinPct: 0.32, sugarPctOfCarbs: 0.05, fiber: 3, sodium: 1000, maxCal: 1200, implied: new Set([]) },
  { type: 'salad',         baseCal: 400, fatPct: 0.45, carbPct: 0.30, proteinPct: 0.25, sugarPctOfCarbs: 0.15, fiber: 5, sodium: 800,  maxCal: 900,  implied: new Set([]) },
  { type: 'sushi_roll',    baseCal: 350, fatPct: 0.25, carbPct: 0.50, proteinPct: 0.25, sugarPctOfCarbs: 0.10, fiber: 2, sodium: 900,  maxCal: 700,  implied: new Set(['rice']) },
  { type: 'poke_bowl',     baseCal: 500, fatPct: 0.25, carbPct: 0.45, proteinPct: 0.30, sugarPctOfCarbs: 0.05, fiber: 4, sodium: 1000, maxCal: 900,  implied: new Set(['rice']) },
  { type: 'breakfast',     baseCal: 550, fatPct: 0.45, carbPct: 0.35, proteinPct: 0.20, sugarPctOfCarbs: 0.12, fiber: 2, sodium: 1100, maxCal: 1200, implied: new Set(['bread', 'egg']) },
  { type: 'appetizer',     baseCal: 400, fatPct: 0.45, carbPct: 0.35, proteinPct: 0.20, sugarPctOfCarbs: 0.08, fiber: 2, sodium: 900,  maxCal: 900,  implied: new Set([]) },
  { type: 'dessert',       baseCal: 450, fatPct: 0.35, carbPct: 0.55, proteinPct: 0.10, sugarPctOfCarbs: 0.65, fiber: 2, sodium: 300,  maxCal: 1000, implied: new Set([]) },
  { type: 'side',          baseCal: 300, fatPct: 0.40, carbPct: 0.45, proteinPct: 0.15, sugarPctOfCarbs: 0.10, fiber: 3, sodium: 600,  maxCal: 600,  implied: new Set([]) },
  { type: 'generic_entree',baseCal: 550, fatPct: 0.38, carbPct: 0.35, proteinPct: 0.27, sugarPctOfCarbs: 0.08, fiber: 3, sodium: 1000, maxCal: 1400, implied: new Set([]) },
]

function detectDishType(item: Item): DishProfile {
  const n = item.name.toLowerCase()
  const d = (item.description ?? '').toLowerCase()
  const both = n + ' ' + d

  // Kids meals first
  if (/\bkid|child/i.test(n)) return findProfile('kids_meal')

  // Specific types by name
  if (/wings|drumettes/i.test(n)) return findProfile('wings')
  if (/nachos|totchos/i.test(n)) return findProfile('nachos')
  // BBQ platter requires explicit BBQ keywords (not just generic meat)
  if (/platter|feast|sampler/i.test(n) && /\brib|brisket|bbq|bar-?b-?q|smoked|pulled pork/i.test(both))
    return findProfile('bbq_platter')
  if (/\bcombo\b/i.test(n) && !/sandwich|burger|chicken|wrap/i.test(n) && /\brib|brisket|bbq|smoked|pulled/i.test(both))
    return findProfile('bbq_platter')
  if (/burger|cheeseburger/i.test(n)) return findProfile('burger')
  // "wrap" must be a standalone word, not part of "wrapped"
  // Exclude cookie/ice cream sandwiches (desserts) and restaurant name matches (Earl of Sandwich Chips)
  if (/sandwich|sub\b|po.boy|panini|\bwrap\b|hoagie/i.test(n) &&
      !/cookie sandwich|ice cream sandwich|chips|chip\b|make any/i.test(n))
    return findProfile('sandwich')
  if (/pasta|paccheri|penne|spaghetti|fettuccine|gnocchi|mac.*cheese|alfredo/i.test(n))
    return findProfile('pasta')
  if (/pad thai|ramen|pho|noodle|lo mein|stir.fry|fried rice/i.test(n))
    return findProfile('noodle_bowl')
  if (/pizza|flatbread/i.test(n)) return findProfile('pizza')
  if (/taco|burrito|quesadilla|tostada|enchilada/i.test(n)) return findProfile('taco')
  // "chili" only matches soup when not paired with fries/dog/burger/nachos
  if (/soup|chowder|gumbo|bisque/i.test(n)) return findProfile('soup')
  if (/\bchili\b/i.test(n) && !/fries|tots|dog|burger|nachos|cheese fries/i.test(n)) return findProfile('soup')
  // Salad — exclude fruit salads (legitimately low cal) and simple side salads
  if (/salad|slaw/i.test(n) && item.category === 'entree' &&
      !/fruit salad|tropical salad|side salad|house salad|green salad|garden salad|mixed green/i.test(n))
    return findProfile('salad')
  // Exclude cinnamon/cinnabon rolls from sushi detection
  if ((/\broll\b|sushi|maki/i.test(n)) && !/cinnamon|cinnabon/i.test(n)) return findProfile('sushi_roll')
  if (/poke|bowl/i.test(n) && /chicken|beef|fish|shrimp|salmon|tuna|pork/i.test(both))
    return findProfile('poke_bowl')
  if (/breakfast|brunch|pancake|biscuit|omelet|benedict/i.test(n))
    return findProfile('breakfast')
  // Waffle matches breakfast ONLY if not a cone/bowl/bubble waffle (those are desserts)
  if (/waffle/i.test(n) && !/cone|bowl|sundae|bubble waffle/i.test(n))
    return findProfile('breakfast')

  // Cooking method based — require the item to contain a protein source (not just a vegetable/starch)
  const hasProteinInName = /chicken|beef|steak|pork|lamb|duck|turkey|shrimp|fish|salmon|tuna|mahi|cod|grouper|tilapia|lobster|crab|scallop|mussel|rib\b|brisket|short rib|filet|fillet|chop\b|loin|tenderloin|meatball|sausage|calamari|octopus/i.test(n)
  if (hasProteinInName) {
    if (/fried|crispy|battered|tempura|breaded/i.test(n) && item.category === 'entree' &&
        !/^(fried ricotta|crispy calamari|crispy spring roll|pan.fried potsticker)/i.test(n))
      return findProfile('fried_entree')
    if (/grilled|roasted|braised|seared/i.test(n) && item.category === 'entree')
      return findProfile('grilled_entree')
  }

  // Category fallbacks
  if (item.category === 'snack') return findProfile('appetizer')
  if (item.category === 'dessert') return findProfile('dessert')
  if (item.category === 'side') return findProfile('side')

  return findProfile('generic_entree')
}

function findProfile(type: string): DishProfile {
  return DISH_PROFILES.find(p => p.type === type) ?? DISH_PROFILES[DISH_PROFILES.length - 1]
}

// ── Ingredient additions from description ────────────────────────────────

interface IngredientAdd {
  name: string
  cal: number
  fat: number
  carb: number
  protein: number
}

const INGREDIENT_ADDITIONS: Array<{ pattern: RegExp; add: IngredientAdd }> = [
  { pattern: /\bbacon\b/i, add: { name: 'bacon', cal: 80, fat: 7, carb: 0, protein: 5 } },
  { pattern: /cheese|cheddar|swiss|provolone|pepper\s?jack|gouda|brie|gruyere|mozzarella|parmesan|goat cheese|blue cheese|colby/i,
    add: { name: 'cheese', cal: 110, fat: 9, carb: 1, protein: 7 } },
  { pattern: /avocado|guacamole|guac\b/i, add: { name: 'avocado', cal: 120, fat: 11, carb: 6, protein: 2 } },
  { pattern: /cream sauce|alfredo|béchamel|hollandaise|béarnaise|beurre blanc/i,
    add: { name: 'cream_sauce', cal: 100, fat: 10, carb: 3, protein: 1 } },
  { pattern: /aioli|mayo|remoulade|ranch|tartar sauce/i,
    add: { name: 'aioli_mayo', cal: 80, fat: 9, carb: 1, protein: 0 } },
  { pattern: /\bgravy\b/i, add: { name: 'gravy', cal: 60, fat: 4, carb: 5, protein: 1 } },
  { pattern: /\bbutter\b(?!milk)(?!.*peanut)/i, add: { name: 'butter', cal: 70, fat: 8, carb: 0, protein: 0 } },
  { pattern: /pork belly/i, add: { name: 'pork_belly', cal: 150, fat: 13, carb: 0, protein: 8 } },
  { pattern: /\bfries\b|french fries|\btots\b|\btater\b/i, add: { name: 'fries', cal: 380, fat: 18, carb: 48, protein: 5 } },
  { pattern: /\brice\b(?!.*vinegar)(?!.*paper)(?!.*noodle)/i, add: { name: 'rice', cal: 220, fat: 1, carb: 48, protein: 4 } },
  { pattern: /\bbun\b|brioche|ciabatta|focaccia|sourdough|baguette|\bbread\b(?!.*crumb)(?!.*ed\b)/i,
    add: { name: 'bread', cal: 150, fat: 3, carb: 28, protein: 5 } },
  { pattern: /cornbread|corn muffin/i, add: { name: 'cornbread', cal: 180, fat: 6, carb: 28, protein: 3 } },
  { pattern: /\bpotato\b(?!\s*(?:bun|roll|bread))|mashed|colcannon/i, add: { name: 'potato', cal: 220, fat: 8, carb: 32, protein: 4 } },
  { pattern: /tortilla|taco shell/i, add: { name: 'tortilla', cal: 120, fat: 4, carb: 18, protein: 3 } },
  { pattern: /\begg\b|fried egg|poached egg/i, add: { name: 'egg', cal: 90, fat: 7, carb: 0, protein: 6 } },
  { pattern: /\bchicken\b/i, add: { name: 'chicken', cal: 200, fat: 8, carb: 0, protein: 30 } },
  { pattern: /\bbeef\b|angus|\bsteak\b|brisket|\bpatty\b/i, add: { name: 'beef', cal: 250, fat: 16, carb: 0, protein: 26 } },
  { pattern: /\bpork\b(?!.*belly)|pulled pork|\bribs\b|carnitas/i, add: { name: 'pork', cal: 220, fat: 14, carb: 0, protein: 22 } },
  { pattern: /shrimp|prawn/i, add: { name: 'shrimp', cal: 100, fat: 2, carb: 0, protein: 20 } },
  { pattern: /\bfish\b(?!\s*(?:roe|sauce|stock))|salmon|\btuna\b|mahi|\bcod\b|grouper|tilapia/i, add: { name: 'fish', cal: 180, fat: 8, carb: 0, protein: 25 } },
  { pattern: /lobster|\bcrab\b/i, add: { name: 'lobster', cal: 130, fat: 3, carb: 0, protein: 24 } },
  { pattern: /sausage|bratwurst|chorizo|andouille/i, add: { name: 'sausage', cal: 180, fat: 15, carb: 2, protein: 10 } },
  { pattern: /whipped cream/i, add: { name: 'whipped_cream', cal: 80, fat: 8, carb: 2, protein: 0 } },
  { pattern: /à la mode|a la mode|with ice cream/i, add: { name: 'ice_cream_add', cal: 200, fat: 12, carb: 22, protein: 3 } },
]

function parseIngredientAdditions(desc: string): IngredientAdd[] {
  const found: IngredientAdd[] = []
  const seen = new Set<string>()
  for (const { pattern, add } of INGREDIENT_ADDITIONS) {
    if (pattern.test(desc) && !seen.has(add.name)) {
      found.push(add)
      seen.add(add.name)
    }
  }
  return found
}

// ── Cooking method multiplier ────────────────────────────────────────────

function cookingMultiplier(name: string, desc: string): number {
  const both = (name + ' ' + desc).toLowerCase()
  if (/fried|deep[\s-]?fried|crispy|battered|tempura|breaded/i.test(both)) return 1.25
  return 1.0
}

// ── Estimate full nutrition ──────────────────────────────────────────────

interface Estimate {
  calories: number
  fat: number
  carbs: number
  protein: number
  sugar: number
  fiber: number
  sodium: number
  cholesterol: number
  dishType: string
  ingredients: string[]
}

function estimateNutrition(item: Item): Estimate {
  const profile = detectDishType(item)
  const desc = item.description ?? ''
  let additions = parseIngredientAdditions(desc)
  const multiplier = cookingMultiplier(item.name, desc)

  // Filter out ingredients already accounted for in the dish base
  additions = additions.filter(a => !profile.implied.has(a.name))

  // For sides: if the item name IS the ingredient (e.g., "French Fries"), skip that addition
  if (profile.type === 'side') {
    const n = item.name.toLowerCase()
    if (/\bfries\b|\btots\b|\btater\b/i.test(n)) additions = additions.filter(a => a.name !== 'fries')
    if (/\bpotato\b|\bmashed\b/i.test(n)) additions = additions.filter(a => a.name !== 'potato')
    if (/\brice\b/i.test(n)) additions = additions.filter(a => a.name !== 'rice')
    if (/\bcornbread\b/i.test(n)) additions = additions.filter(a => a.name !== 'cornbread')
  }

  // Sum ingredient calorie additions
  const ingredientCal = additions.reduce((sum, a) => sum + a.cal, 0)

  // Total calories before cap
  let totalCal = Math.round((profile.baseCal + ingredientCal) * multiplier)
  totalCal = Math.min(totalCal, profile.maxCal)

  // Derive macros from calorie budget using dish profile ratios
  const fat = Math.round((totalCal * profile.fatPct) / 9)
  const carbs = Math.round((totalCal * profile.carbPct) / 4)
  const protein = Math.round((totalCal * profile.proteinPct) / 4)
  const sugar = Math.round(carbs * profile.sugarPctOfCarbs)
  const fiber = profile.fiber
  const sodium = profile.sodium

  // Cholesterol: check if description mentions meat, egg, or dairy
  const hasMeatEggDairy = /chicken|beef|pork|steak|lamb|duck|turkey|shrimp|lobster|crab|salmon|fish|egg|cheese|cream|butter|bacon|sausage|brisket|ribs/i.test(desc)
  const cholesterol = hasMeatEggDairy ? 75 : 15

  return {
    calories: totalCal,
    fat, carbs, protein, sugar, fiber, sodium, cholesterol,
    dishType: profile.type,
    ingredients: additions.map(a => a.name + ' (+' + a.cal + ')'),
  }
}

// ── Validation ───────────────────────────────────────────────────────────

function validateEstimate(est: Estimate): boolean {
  // Caloric math check: P*4 + C*4 + F*9 should be within 15% of stated
  const macroCal = est.protein * 4 + est.carbs * 4 + est.fat * 9
  const ratio = macroCal / est.calories
  if (ratio < 0.85 || ratio > 1.15) return false

  // Sugar must not exceed carbs
  if (est.sugar > est.carbs) return false

  // Fat must be at least 3g for any food
  if (est.fat < 3) return false

  return true
}

// ── Main ─────────────────────────────────────────────────────────────────

interface Fix {
  itemName: string
  restaurant: string
  park: string
  dishType: string
  severity: string
  method: string
  nutId: string
  oldCal: number
  newCal: number
  oldFat: number | null
  newFat: number
  oldCarbs: number | null
  newCarbs: number
  oldProtein: number | null
  newProtein: number
  oldSugar: number | null
  newSugar: number
  oldFiber: number | null
  newFiber: number
  oldSodium: number | null
  newSodium: number
  oldCholesterol: number | null
  newCholesterol: number
  ingredients: string[]
  description: string
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (use --apply to write) ===' : '=== APPLYING DESCRIPTION-BASED FIXES ===')
  console.log('Fetching all menu items...')
  const items = await fetchAll()
  console.log(`Fetched ${items.length} items\n`)

  const fixes: Fix[] = []
  const fixed = new Set<string>()

  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd) continue
    if (fixed.has(nd.id)) continue

    const detection = shouldFix(item, nd)
    if (!detection) continue

    const est = estimateNutrition(item)

    // Validate the estimate
    if (!validateEstimate(est)) continue

    // Don't reduce calories — only increase
    if (est.calories < (nd.calories ?? 0)) continue

    const r = item.restaurant as any
    fixes.push({
      itemName: item.name,
      restaurant: r?.name ?? '?',
      park: r?.park?.name ?? '?',
      dishType: est.dishType,
      severity: detection.severity,
      method: detection.method,
      nutId: nd.id,
      oldCal: nd.calories ?? 0,
      newCal: est.calories,
      oldFat: nd.fat,
      newFat: est.fat,
      oldCarbs: nd.carbs,
      newCarbs: est.carbs,
      oldProtein: nd.protein,
      newProtein: est.protein,
      oldSugar: nd.sugar,
      newSugar: est.sugar,
      oldFiber: nd.fiber,
      newFiber: est.fiber,
      oldSodium: nd.sodium,
      newSodium: est.sodium,
      oldCholesterol: nd.cholesterol,
      newCholesterol: est.cholesterol,
      ingredients: est.ingredients,
      description: item.description ?? '',
    })
    fixed.add(nd.id)
  }

  // Sort by severity then dish type then name
  fixes.sort((a, b) =>
    a.severity.localeCompare(b.severity) ||
    a.dishType.localeCompare(b.dishType) ||
    a.itemName.localeCompare(b.itemName)
  )

  // Print fixes grouped by severity and dish type
  for (const severity of ['CRITICAL', 'SIGNIFICANT']) {
    const group = fixes.filter(f => f.severity === severity)
    if (group.length === 0) continue

    console.log(`\n${'═'.repeat(85)}`)
    console.log(`  ${severity} — ${group.length} items`)
    console.log(`${'═'.repeat(85)}`)

    let currentType = ''
    for (const f of group) {
      if (f.dishType !== currentType) {
        currentType = f.dishType
        const typeCount = group.filter(g => g.dishType === currentType).length
        console.log(`\n  [${currentType.toUpperCase().replace(/_/g, ' ')}] (${typeCount})`)
      }
      console.log(`  ${f.itemName}  [${f.method}]`)
      console.log(`    ${f.restaurant} @ ${f.park}`)
      if (f.description) console.log(`    "${f.description.slice(0, 140)}${f.description.length > 140 ? '...' : ''}"`)
      if (f.ingredients.length) console.log(`    ingredients: ${f.ingredients.join(', ')}`)
      console.log(`    cal: ${f.oldCal} → ${f.newCal}  |  fat: ${f.oldFat ?? '?'} → ${f.newFat}g  |  carbs: ${f.oldCarbs ?? '?'} → ${f.newCarbs}g  |  pro: ${f.oldProtein ?? '?'} → ${f.newProtein}g`)
    }
  }

  // Summary
  console.log(`\n${'─'.repeat(85)}`)
  console.log(`\nSUMMARY: ${fixes.length} items to fix`)

  const bySeverity: Record<string, number> = {}
  const byType: Record<string, number> = {}
  const byPark: Record<string, number> = {}
  const byMethod: Record<string, number> = {}
  let totalCalDelta = 0
  for (const f of fixes) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
    byType[f.dishType] = (byType[f.dishType] ?? 0) + 1
    byPark[f.park] = (byPark[f.park] ?? 0) + 1
    byMethod[f.method] = (byMethod[f.method] ?? 0) + 1
    totalCalDelta += (f.newCal - f.oldCal)
  }

  console.log('\nBy detection method:')
  for (const [m, count] of Object.entries(byMethod).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${m.padEnd(25)} ${count}`)
  }

  console.log('\nBy severity:')
  for (const [s, count] of Object.entries(bySeverity).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s.padEnd(15)} ${count}`)
  }

  console.log('\nBy dish type:')
  for (const [t, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t.padEnd(20)} ${count}`)
  }

  console.log('\nBy park (top 10):')
  for (const [p, count] of Object.entries(byPark).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${p.padEnd(45)} ${count}`)
  }

  const avgDelta = fixes.length > 0 ? Math.round(totalCalDelta / fixes.length) : 0
  console.log(`\nAvg calorie increase: +${avgDelta} cal`)

  // Caloric math verification for all fixes
  let mathOk = 0
  let mathBad = 0
  for (const f of fixes) {
    const macroCal = f.newProtein * 4 + f.newCarbs * 4 + f.newFat * 9
    const ratio = macroCal / f.newCal
    if (ratio >= 0.85 && ratio <= 1.15) mathOk++
    else mathBad++
  }
  console.log(`\nCaloric math check: ${mathOk} pass, ${mathBad} fail`)

  // Apply fixes
  if (!DRY_RUN && fixes.length > 0) {
    console.log('\nApplying fixes...')
    let applied = 0
    for (const f of fixes) {
      const { error } = await sb.from('nutritional_data').update({
        calories: f.newCal,
        fat: f.newFat,
        carbs: f.newCarbs,
        protein: f.newProtein,
        sugar: f.newSugar,
        fiber: f.newFiber,
        sodium: f.newSodium,
        cholesterol: f.newCholesterol,
        confidence_score: 40,
      }).eq('id', f.nutId)
      if (error) {
        console.error(`  ERROR updating ${f.itemName}: ${error.message}`)
      } else {
        applied++
      }
    }
    console.log(`\nApplied ${applied}/${fixes.length} fixes`)
  } else if (DRY_RUN) {
    console.log('\n  Run with --apply to write changes')
  }
}

main().catch(console.error)
