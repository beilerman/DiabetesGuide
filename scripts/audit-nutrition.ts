import { readFileSync, writeFileSync } from 'fs'

interface NutData {
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
  nutritional_data: NutData[]
}

interface Flag {
  item: string
  location: string
  pass: number
  issue: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  current: string
  suggested: string
  category: string
}

const items: Item[] = JSON.parse(readFileSync('audit-dump.json', 'utf-8'))
const flags: Flag[] = []

function n(item: Item): NutData | null {
  return item.nutritional_data?.[0] ?? null
}

function loc(item: Item): string {
  const r = item.restaurant as any
  return `${r?.name ?? '?'} (${r?.park?.name ?? '?'})`
}

function pctCal(macro_g: number, calPerG: number, totalCal: number): number {
  if (totalCal <= 0) return 0
  return (macro_g * calPerG / totalCal) * 100
}

// Detect alcoholic beverages — these legitimately have caloric math gaps
// because alcohol provides 7 cal/g not captured by P*4+C*4+F*9
function isLikelyAlcoholic(name: string, category: string, item: Item): boolean {
  const nm = name.toLowerCase()
  const rName = ((item.restaurant as any)?.name ?? '').toLowerCase()

  // --- Patterns that work regardless of category ---

  // Beer brands (comprehensive list)
  if (/\b(modelo|corona|heineken|budweiser|stella artois|yuengling|samuel adams|peroni|chimay|coors|blue moon|strongbow|schöfferhofer|warsteiner|kronenbourg|amstel|beck|dos equis|pacifico|negra modelo|lagunitas|goose island|cigar city|funky buddha|terrapin|sweetwater|dogfish|sierra nevada|new belgium|fat tire|blue point|high noon|allagash|ommegang|delirium|duvel|crooked can|duff|kirin|estrella|coedo|new holland|bud light|safari amber|rochefort|trappist)\b/i.test(nm) && !/batter|bread|sauce|braise|glaze|crust|rub|marinate|infuse/i.test(nm)) return true

  // Beer styles (regardless of category)
  if (/\b(ipa|pilsner|lager|stout|porter|hefeweizen|shandy|gose|pale ale|wheat beer|draft beer|craft beer|on tap|saison|draft\b|draught)\b/i.test(nm) && !/batter|bread|sauce|braise|glaze|ginger ale|beer.batter/i.test(nm)) return true

  // Cocktail names (regardless of category)
  if (/\b(martini|margarita|mojito|daiquiri|paloma|negroni|spritz|mule|bellini|mimosa|sangria|old fashioned|mai tai|piña colada|cosmopolitan|manhattan|sidecar|highball|toddy|boulevardier|sazerac|aperol|bloody mary|gimlet|cosmo.politan|long island iced tea|rita\b)\b/i.test(nm) && !/burger|chicken|pork|steak|fries|sandwich|doughnut|donut|cake\b|cookie/i.test(nm)) return true

  // Spirit names (regardless of category)
  if (/\b(tequila|mezcal|vodka|bourbon|whisky|whiskey|scotch|rum|gin\b|brandy|cognac|sake\b|soju|amarula|liqueur|fernet)\b/i.test(nm) && !/batter|sauce|braise|glaze|crust|rub|marinate|infuse|vodka sauce|alla vodka|rum cake|bourbon glaze|whiskey sauce|beer.batter/i.test(nm)) return true

  // Wine varietals & terms (regardless of category)
  if (/\b(pinot|cabernet|chardonnay|merlot|riesling|sauvignon blanc|prosecco|champagne|rosé|shiraz|malbec|tempranillo|grenache|zinfandel|chianti|barolo|rioja|chablis|chenin blanc|brut|wines?\s+by\s+the)\b/i.test(nm) && !/sauce|braise|reduction|glaze|braised|rubbed|marinate|infuse|cupcake|cake/i.test(nm)) return true

  // Generic alcoholic patterns
  if (/\b(beer|wine|cocktail)\b/i.test(nm) && !/root beer|ginger beer|butter.?beer|beer.?batter|beer.?bread|beer.?cheese|wine.?sauce|wine.?braised|wine.?reduction|wine.?vinaigrette|wine.?bar|wine.?country/i.test(nm)) return true

  // "Draft" or "on tap" or "pilsner" as standalone drink
  if (/\b(draft|seasonal draft|honey pilsner|pilsner)\b/i.test(nm) && !/draft pick|draft house/i.test(nm) && (category === 'beverage' || /bar|pub|lounge|tap|grill|brew/i.test(rName))) return true

  // Names ending in "brew" are typically beer/cocktail
  if (/\bbrew\b/i.test(nm) && !/brew pub|brewery|brewed chicken|home.?brew/i.test(nm)) return true

  // "Canned beers" / "craft beers" / "bottled beers" patterns
  if (/\b(canned|craft|bottled|domestic|imported|draft)\s+(beer|ale|lager|wine)s?\b/i.test(nm)) return true

  // Theme park specific alcoholic drinks
  if (/\b(fire whiskey|wizard'?s brew|grog|mead|butterbeer)\b/i.test(nm) && !/fudge|cake|ice cream|potted cream/i.test(nm)) return true

  // --- Bar/lounge restaurant detection ---
  // Items at bars/lounges/pubs with low fat content are almost certainly drinks
  const isBarRestaurant = /\b(bar|pub|lounge|cantina|tavern|grog|brew|tap\s*house|tiki|wine bar|tonic|cocktail|astropub|watering hole|saloon|speakeasy)\b/i.test(rName)
  if (isBarRestaurant) {
    const nd = n(item)
    const fat = nd?.fat ?? 0
    // Low-fat items at bars are drinks (food at bars has fat from cooking)
    if (fat < 5) return true
    // "Punch" at a bar is always alcoholic
    if (/punch/i.test(nm)) return true
    // "Flight" at a bar = tasting flight
    if (/flight/i.test(nm) && !/chicken flight/i.test(nm)) return true
  }

  // "Frozen" + bar context or alcohol-sounding name
  if (/frozen\s+(flight|slush|punch)/i.test(nm)) return true

  // Category is beverage + has caloric gap pattern (low macros but stated calories)
  // This catches creatively-named drinks at non-bar restaurants
  if (category === 'beverage') {
    const nd = n(item)
    const fat = nd?.fat ?? 0
    const protein = nd?.protein ?? 0
    // Very low fat+protein with moderate calories = likely alcoholic
    if (fat <= 1 && protein <= 2 && (nd?.calories ?? 0) > 100) return true
  }

  // Any item with fat=0 and a large caloric gap (ratio > 2.0) is almost certainly a drink.
  // Real food always has some fat from cooking. The caloric gap = alcohol calories.
  {
    const nd = n(item)
    const fat = nd?.fat ?? 0
    const protein = nd?.protein ?? 0
    const cal = nd?.calories ?? 0
    const estCal = (protein * 4) + ((nd?.carbs ?? 0) * 4) + (fat * 9)
    // Very low fat + protein with any caloric gap
    if (fat === 0 && protein <= 2 && cal > 100 && estCal > 0 && cal / estCal > 1.5) return true
    // Fat=0 with large caloric gap — even with moderate protein (cream liqueurs, protein-enriched drinks)
    // Real food always has some fat; fat=0 + caloric gap = almost certainly a drink
    if (fat === 0 && protein <= 15 && cal > 100 && estCal > 0 && cal / estCal > 2.0) return true
  }

  return false
}

// Detect items that are dessert-like even if categorized as "entree"
function isDessertLike(name: string): boolean {
  return /ice cream|sundae|cake\b|cookie\b|brownie|cupcake|cheesecake|pie\b|cobbler|pudding|mousse|tart\b|crème brûlée|churro|dole whip|sorbet|gelato|fudge|candy|chocolate\b|macarons?|tiramisu|panna cotta|waffle cone|funnel cake|beignet/i.test(name)
}

// Detect kids meals
function isKidsMeal(name: string): boolean {
  return /\b(kid|child|jr\b|junior|little|mini|small)\b/i.test(name) || /^kids?\s/i.test(name)
}

// ============================================================
// PASS 1: INTERNAL CONSISTENCY
// ============================================================
console.log('=== PASS 1: INTERNAL CONSISTENCY ===\n')

for (const item of items) {
  const nd = n(item)
  if (!nd) continue
  const cal = nd.calories ?? 0
  const carbs = nd.carbs ?? 0
  const fat = nd.fat ?? 0
  const protein = nd.protein ?? 0
  const sugar = nd.sugar ?? 0
  const fiber = nd.fiber ?? 0
  const sodium = nd.sodium ?? 0
  const name = item.name
  const location = loc(item)
  const desc = (item.description || '').toLowerCase()
  const nameLower = name.toLowerCase()

  // 1A: Caloric math
  const estCal = protein * 4 + carbs * 4 + fat * 9
  if (cal > 50 && estCal > 50) {
    const ratio = cal / estCal
    const isAlcohol = isLikelyAlcoholic(name, item.category, item)
    if (ratio < 0.5 || ratio > 2.0) {
      // For alcoholic drinks, the gap is expected (alcohol = 7 cal/g) — downgrade to LOW
      if (isAlcohol && ratio > 1.0) {
        flags.push({
          item: name, location, pass: 1, category: 'caloric-math',
          severity: 'LOW',
          issue: `Alcoholic drink caloric gap: stated ${cal} cal vs macro-calculated ${estCal} (ratio ${ratio.toFixed(2)}) — alcohol calories (7 cal/g) explain the difference`,
          current: `cal=${cal}, P=${protein}g, C=${carbs}g, F=${fat}g`,
          suggested: `Expected for alcoholic beverages — no action needed`
        })
      } else {
        flags.push({
          item: name, location, pass: 1, category: 'caloric-math',
          severity: 'HIGH',
          issue: `Extreme caloric math mismatch: stated ${cal} cal vs calculated ${estCal} (ratio ${ratio.toFixed(2)})`,
          current: `cal=${cal}, P=${protein}g, C=${carbs}g, F=${fat}g`,
          suggested: `Recalculate: either cal should be ~${estCal} or macros need adjustment`
        })
      }
    } else if (ratio < 0.75 || ratio > 1.35) {
      if (isAlcohol && ratio > 1.0) {
        flags.push({
          item: name, location, pass: 1, category: 'caloric-math',
          severity: 'LOW',
          issue: `Alcoholic drink caloric gap (${Math.abs(Math.round((1 - ratio) * 100))}%): stated ${cal} vs calculated ${estCal} — alcohol calories explain the difference`,
          current: `cal=${cal}, P=${protein}g, C=${carbs}g, F=${fat}g`,
          suggested: `Expected for alcoholic beverages — no action needed`
        })
      } else {
        flags.push({
          item: name, location, pass: 1, category: 'caloric-math',
          severity: 'MEDIUM',
          issue: `Caloric math off by ${Math.abs(Math.round((1 - ratio) * 100))}%: stated ${cal} vs calculated ${estCal}`,
          current: `cal=${cal}, P=${protein}g, C=${carbs}g, F=${fat}g`,
          suggested: `Verify macros sum to stated calories`
        })
      }
    }
  }

  // 1B: Macro ratio plausibility
  if (cal > 100) {
    const fatPct = pctCal(fat, 9, cal)
    const carbPct = pctCal(carbs, 4, cal)
    const protPct = pctCal(protein, 4, cal)

    // Fried foods should be >25% fat
    if (item.is_fried && fatPct < 20 && fat > 0) {
      flags.push({
        item: name, location, pass: 1, category: 'macro-ratio',
        severity: 'MEDIUM',
        issue: `Fried item with only ${fatPct.toFixed(0)}% cal from fat (expected >25%)`,
        current: `fat=${fat}g (${fatPct.toFixed(0)}% of ${cal} cal)`,
        suggested: `Verify fat content — frying typically adds significant fat`
      })
    }

    // Desserts should be >35% carbs
    if (item.category === 'dessert' && carbPct < 30 && carbs > 0) {
      flags.push({
        item: name, location, pass: 1, category: 'macro-ratio',
        severity: 'LOW',
        issue: `Dessert with only ${carbPct.toFixed(0)}% cal from carbs (expected >35%)`,
        current: `carbs=${carbs}g (${carbPct.toFixed(0)}% of ${cal} cal)`,
        suggested: `Verify carb content for a dessert item`
      })
    }

    // Meat-heavy items should have decent protein
    if (/turkey leg|chicken dinner|grilled (chicken|steak|salmon|fish)|ribeye|rib.eye|filet|tenderloin|pork chop/i.test(nameLower) && protPct < 15 && protein > 0) {
      flags.push({
        item: name, location, pass: 1, category: 'macro-ratio',
        severity: 'MEDIUM',
        issue: `Protein-dominant dish with only ${protPct.toFixed(0)}% cal from protein (expected >20%)`,
        current: `protein=${protein}g (${protPct.toFixed(0)}% of ${cal} cal)`,
        suggested: `Verify protein — grilled meats should be protein-heavy`
      })
    }
  }

  // 1C: Sodium plausibility
  if (cal > 200) {
    // Savory entrees with very low sodium — exclude dessert-like items and fruit plates
    if (item.category === 'entree' && sodium > 0 && sodium < 200
      && !isDessertLike(name)
      && !/fruit|smoothie|juice|tea\b|coffee|water|milk|açaí|acai/i.test(nameLower)
      && !/salad.*fruit|fruit.*salad|fresh fruit/i.test(nameLower)) {
      flags.push({
        item: name, location, pass: 1, category: 'sodium',
        severity: 'LOW',
        issue: `Savory entree with only ${sodium}mg sodium — suspiciously low for theme park food`,
        current: `sodium=${sodium}mg`,
        suggested: `Typical theme park entree: 800-2000mg sodium`
      })
    }

    // Desserts with very high sodium (unless pretzel/salted caramel)
    if (item.category === 'dessert' && sodium > 1500 && !/pretzel|salted|salt|caramel/.test(nameLower + ' ' + desc)) {
      flags.push({
        item: name, location, pass: 1, category: 'sodium',
        severity: 'MEDIUM',
        issue: `Dessert with ${sodium}mg sodium — high unless salted/pretzel component`,
        current: `sodium=${sodium}mg`,
        suggested: `Verify — typical dessert: 200-600mg sodium`
      })
    }
  }

  // 1D: Sugar/fiber <= carbs
  if (sugar > carbs && carbs > 0) {
    flags.push({
      item: name, location, pass: 1, category: 'sugar-carbs',
      severity: 'HIGH',
      issue: `Sugar (${sugar}g) > total carbs (${carbs}g) — impossible`,
      current: `sugar=${sugar}g, carbs=${carbs}g`,
      suggested: `Sugar must be ≤ carbs. Likely sugar=${Math.round(carbs * 0.3)}g or carbs needs increase`
    })
  }
  if (fiber > carbs && carbs > 0) {
    flags.push({
      item: name, location, pass: 1, category: 'fiber-carbs',
      severity: 'HIGH',
      issue: `Fiber (${fiber}g) > total carbs (${carbs}g) — impossible`,
      current: `fiber=${fiber}g, carbs=${carbs}g`,
      suggested: `Fiber must be ≤ carbs`
    })
  }
}

// ============================================================
// PASS 2: EXTERNAL PLAUSIBILITY (heuristic estimation)
// ============================================================
console.log('=== PASS 2: EXTERNAL PLAUSIBILITY ===\n')

// Define expected ranges for common food types
interface FoodProfile {
  pattern: RegExp
  exclude?: RegExp
  calRange: [number, number]
  carbRange: [number, number]
  fatRange: [number, number]
  proteinRange: [number, number]
  label: string
}

const profiles: FoodProfile[] = [
  // --- Kids meals (MUST come before adult versions) ---
  { pattern: /\b(kids?|child|jr\b|junior|little|mini)\b.*(?:burger|cheeseburger)/i, calRange: [200, 700], carbRange: [15, 50], fatRange: [10, 40], proteinRange: [10, 30], label: 'kids burger' },
  { pattern: /\b(kids?|child|jr\b|junior|little|mini)\b.*pizza/i, calRange: [150, 600], carbRange: [20, 60], fatRange: [5, 30], proteinRange: [5, 25], label: 'kids pizza' },
  { pattern: /\b(kids?|child|jr\b|junior|little|mini)\b.*(?:hot dog|corn dog)/i, calRange: [150, 500], carbRange: [15, 40], fatRange: [8, 30], proteinRange: [5, 20], label: 'kids hot dog' },
  { pattern: /\b(kids?|child|jr\b|junior|little|mini)\b.*(?:chicken|tender|nugget|finger)/i, calRange: [150, 600], carbRange: [10, 40], fatRange: [8, 30], proteinRange: [10, 30], label: 'kids chicken' },
  { pattern: /\b(kids?|child|jr\b|junior|little|mini)\b.*(?:mac|cheese|pasta|noodle)/i, calRange: [150, 600], carbRange: [20, 60], fatRange: [5, 30], proteinRange: [5, 20], label: 'kids pasta' },
  { pattern: /\b(kids?|child|jr\b|junior|little|mini)\b/i, exclude: /sierra nevada|hazy little thing|mother'?s little helper|churro|ipa\b|lager\b|stout\b|\bale\b|pilsner|beer|wine|cocktail|margarita|sangria|fruit\s*cup/i, calRange: [100, 700], carbRange: [10, 80], fatRange: [3, 40], proteinRange: [3, 40], label: 'kids meal' },

  // --- Fruit/veggie platters (MUST come before platter/combo) ---
  { pattern: /fruit\s*(?:platter|plate|cup|bowl|salad)|fresh\s*fruit/i, calRange: [50, 400], carbRange: [10, 90], fatRange: [0, 10], proteinRange: [0, 10], label: 'fruit plate' },

  // --- Adult food profiles ---
  { pattern: /cheeseburger|hamburger|burger(?!.*impossible)/i, calRange: [500, 1400], carbRange: [30, 80], fatRange: [25, 70], proteinRange: [20, 60], label: 'burger' },
  { pattern: /cheese pizza|pepperoni pizza|pizza/i, calRange: [400, 1200], carbRange: [40, 100], fatRange: [15, 50], proteinRange: [15, 45], label: 'pizza' },
  { pattern: /hot dog|corn dog/i, calRange: [300, 900], carbRange: [25, 60], fatRange: [15, 50], proteinRange: [10, 30], label: 'hot dog' },
  { pattern: /turkey leg/i, calRange: [800, 1200], carbRange: [0, 10], fatRange: [40, 70], proteinRange: [80, 160], label: 'turkey leg' },
  { pattern: /funnel cake/i, exclude: /topping/i, calRange: [600, 1200], carbRange: [70, 150], fatRange: [25, 60], proteinRange: [5, 20], label: 'funnel cake' },
  { pattern: /churro/i, exclude: /milk\s*shake|shake\b|family/i, calRange: [200, 600], carbRange: [30, 80], fatRange: [10, 30], proteinRange: [2, 10], label: 'churro' },
  { pattern: /cupcake/i, calRange: [350, 800], carbRange: [45, 120], fatRange: [15, 40], proteinRange: [3, 10], label: 'cupcake' },
  { pattern: /dole whip|soft.serve/i, calRange: [150, 400], carbRange: [30, 80], fatRange: [0, 15], proteinRange: [0, 8], label: 'frozen treat' },
  { pattern: /pretzel(?!.*pretzel kitchen)/i, exclude: /bread pudding|bread stick|breadstick|loaded/i, calRange: [300, 700], carbRange: [50, 120], fatRange: [5, 25], proteinRange: [5, 20], label: 'pretzel' },
  { pattern: /mac.*cheese|mac n cheese/i, calRange: [400, 1000], carbRange: [35, 80], fatRange: [20, 55], proteinRange: [15, 35], label: 'mac & cheese' },
  { pattern: /chicken tender|chicken finger|chicken strip|chicken nugget/i, exclude: /1 pc|single|per piece/i, calRange: [400, 1000], carbRange: [20, 60], fatRange: [20, 50], proteinRange: [25, 55], label: 'chicken tenders' },
  { pattern: /nachos|totchos/i, calRange: [500, 1300], carbRange: [40, 100], fatRange: [25, 70], proteinRange: [15, 45], label: 'nachos' },
  { pattern: /caesar salad/i, calRange: [150, 700], carbRange: [8, 40], fatRange: [8, 45], proteinRange: [5, 40], label: 'caesar salad' },
  { pattern: /brownie/i, calRange: [300, 800], carbRange: [40, 100], fatRange: [15, 45], proteinRange: [3, 12], label: 'brownie' },
  { pattern: /milkshake|\bshake\b/i, calRange: [400, 1100], carbRange: [50, 130], fatRange: [15, 50], proteinRange: [8, 20], label: 'milkshake' },
  { pattern: /platter|feast|sampler/i, exclude: /make any|vegetable platter|veggie platter|cheese platter|fruit|combo tray|imperial sampler|beer sampler|wine sampler|flight/i, calRange: [500, 1800], carbRange: [30, 200], fatRange: [15, 80], proteinRange: [15, 120], label: 'platter/sampler' },
  { pattern: /combo/i, exclude: /make any|combo tray/i, calRange: [300, 1600], carbRange: [15, 200], fatRange: [5, 80], proteinRange: [5, 120], label: 'combo meal' },
  { pattern: /\blatte\b|cold brew|\bcappuccino\b/i, calRange: [0, 700], carbRange: [0, 90], fatRange: [0, 35], proteinRange: [0, 50], label: 'coffee drink' },
  { pattern: /\bbeer\b(?!.*(?:butter|batter|brined|braised|cheese|glazed|marinated|infused|float|root))/i, exclude: /chicken|pork|steak|burger|sandwich|wings|ribs|fish|tacos/i, calRange: [100, 350], carbRange: [5, 30], fatRange: [0, 2], proteinRange: [0, 5], label: 'beer' },
  { pattern: /\bwine\b(?!.*(?:braised|reduction|sauce|vinaigrette|marinated|glazed|infused|cupcake|cake|country|bar))/i, calRange: [100, 400], carbRange: [2, 20], fatRange: [0, 1], proteinRange: [0, 2], label: 'wine' },
  { pattern: /margarita|mojito|sangria|(?<!shrimp |fruit |prawn |seafood )cocktail/i, calRange: [50, 500], carbRange: [5, 60], fatRange: [0, 5], proteinRange: [0, 3], label: 'cocktail' },
  { pattern: /^(?:bottled |sparkling |still |spring |mineral |flavored |dasani |smart)?water$/i, calRange: [0, 10], carbRange: [0, 0], fatRange: [0, 0], proteinRange: [0, 0], label: 'water' },
  { pattern: /ribs|rib plate|bbq.*rib/i, calRange: [600, 1400], carbRange: [15, 60], fatRange: [30, 70], proteinRange: [30, 70], label: 'ribs' },
  { pattern: /doughnut|donut/i, exclude: /chicken.*(?:doughnut|donut)|(?:doughnut|donut).*chicken|chicken\s*'?n'?\s*donut/i, calRange: [250, 700], carbRange: [30, 90], fatRange: [10, 35], proteinRange: [3, 10], label: 'doughnut' },
  { pattern: /ice cream|sundae/i, calRange: [250, 1200], carbRange: [30, 130], fatRange: [10, 55], proteinRange: [3, 15], label: 'ice cream/sundae' },
  { pattern: /cookie/i, exclude: /cookies\s*&\s*cream|cookies\s*'?n'?\s*cream/i, calRange: [200, 1000], carbRange: [25, 120], fatRange: [10, 50], proteinRange: [2, 15], label: 'cookie' },
  { pattern: /wrap|burrito/i, calRange: [350, 1000], carbRange: [30, 80], fatRange: [15, 50], proteinRange: [15, 45], label: 'wrap/burrito' },
  { pattern: /sandwich|panini|sub/i, exclude: /potato chip|chips\b|make any/i, calRange: [250, 1200], carbRange: [20, 80], fatRange: [8, 55], proteinRange: [8, 50], label: 'sandwich' },
  { pattern: /(?<!cheese)steak(?! dog)|filet|ribeye|rib.eye|prime rib/i, exclude: /cauliflower|vegan|veggie|extra steak|add steak/i, calRange: [400, 1200], carbRange: [0, 60], fatRange: [20, 65], proteinRange: [30, 80], label: 'steak' },
  { pattern: /fish\s*(?:&|and|'?n'?)\s*chips/i, calRange: [700, 1400], carbRange: [60, 130], fatRange: [30, 80], proteinRange: [25, 100], label: 'fish & chips' },
  { pattern: /salmon|sea bass|fish(?!.*finger)/i, exclude: /\b(ipa|ale|lager|stout|porter|pilsner|dogfish|sailfish|swordfish\s+ipa)\b/i, calRange: [300, 900], carbRange: [5, 80], fatRange: [10, 50], proteinRange: [15, 60], label: 'fish entree' },
]

for (const item of items) {
  const nd = n(item)
  if (!nd) continue
  const cal = nd.calories ?? 0
  const carbs = nd.carbs ?? 0
  const fat = nd.fat ?? 0
  const protein = nd.protein ?? 0
  if (cal === 0) continue

  for (const p of profiles) {
    if (!p.pattern.test(item.name)) continue
    if (p.exclude && p.exclude.test(item.name)) continue

    const location = loc(item)
    const issues: string[] = []

    if (cal < p.calRange[0] * 0.75) issues.push(`cal ${cal} well below expected ${p.calRange[0]}-${p.calRange[1]} for ${p.label}`)
    if (cal > p.calRange[1] * 1.25) issues.push(`cal ${cal} well above expected ${p.calRange[0]}-${p.calRange[1]} for ${p.label}`)
    if (carbs > 0 && carbs < p.carbRange[0] * 0.6) issues.push(`carbs ${carbs}g below expected ${p.carbRange[0]}-${p.carbRange[1]}g for ${p.label}`)
    if (carbs > p.carbRange[1] * 1.4) issues.push(`carbs ${carbs}g above expected ${p.carbRange[0]}-${p.carbRange[1]}g for ${p.label}`)
    if (fat > 0 && fat < p.fatRange[0] * 0.5) issues.push(`fat ${fat}g below expected ${p.fatRange[0]}-${p.fatRange[1]}g for ${p.label}`)
    if (fat > p.fatRange[1] * 1.5) issues.push(`fat ${fat}g above expected ${p.fatRange[0]}-${p.fatRange[1]}g for ${p.label}`)
    if (protein > 0 && protein < p.proteinRange[0] * 0.5) issues.push(`protein ${protein}g below expected ${p.proteinRange[0]}-${p.proteinRange[1]}g for ${p.label}`)
    if (protein > p.proteinRange[1] * 1.5) issues.push(`protein ${protein}g above expected ${p.proteinRange[0]}-${p.proteinRange[1]}g for ${p.label}`)

    if (issues.length > 0) {
      flags.push({
        item: item.name, location, pass: 2, category: 'plausibility',
        severity: issues.some(i => /well below|well above/.test(i)) ? 'HIGH' : 'MEDIUM',
        issue: issues.join('; '),
        current: `cal=${cal}, C=${carbs}g, F=${fat}g, P=${protein}g`,
        suggested: `Expected for ${p.label}: cal ${p.calRange[0]}-${p.calRange[1]}, C ${p.carbRange[0]}-${p.carbRange[1]}g, F ${p.fatRange[0]}-${p.fatRange[1]}g, P ${p.proteinRange[0]}-${p.proteinRange[1]}g`
      })
    }
    break // only match first profile
  }
}

// ============================================================
// PASS 3: SYSTEMATIC PATTERNS
// ============================================================
console.log('=== PASS 3: SYSTEMATIC PATTERNS ===\n')

// 3A: Suspiciously round numbers
for (const item of items) {
  const nd = n(item)
  if (!nd || !nd.calories) continue
  const cal = nd.calories
  const carbs = nd.carbs ?? 0
  const fat = nd.fat ?? 0
  const protein = nd.protein ?? 0

  // Check if ALL four values are multiples of 5 or 10
  if (cal % 10 === 0 && carbs % 5 === 0 && fat % 5 === 0 && protein % 5 === 0 && cal > 100) {
    // Additional check: all are multiples of 10
    if (cal % 50 === 0 && carbs % 10 === 0 && fat % 10 === 0 && protein % 10 === 0) {
      flags.push({
        item: item.name, location: loc(item), pass: 3, category: 'round-numbers',
        severity: 'LOW',
        issue: `All macros are very round numbers — likely estimated, not measured`,
        current: `cal=${cal}, C=${carbs}g, F=${fat}g, P=${protein}g`,
        suggested: `Flag as estimate — confidence should be low`
      })
    }
  }
}

// 3B: Duplicate nutritional profiles
// Skip generic beverages and common items that legitimately share profiles
function isGenericBeverage(name: string, category: string): boolean {
  if (category === 'beverage') {
    // Generic beer/wine/soda/water listings that legitimately share nutrition across restaurants
    if (/^(draft |bottled |canned )?(beer|ale|lager|wine|prosecco|champagne|soda|pop|water|juice|milk|coffee|tea|iced tea|lemonade)s?$/i.test(name.trim())) return true
    if (/^(domestic|imported|craft|premium|house) (beer|wine|red|white)s?$/i.test(name.trim())) return true
    if (/^(coca.cola|pepsi|sprite|dr.pepper|fanta|mountain dew|dasani|aquafina|smartwater|powerade|gatorade|minute maid|tropicana)/i.test(name.trim())) return true
  }
  return false
}

const profileMap = new Map<string, Item[]>()
for (const item of items) {
  const nd = n(item)
  if (!nd || !nd.calories) continue
  // Skip generic beverages — they legitimately share profiles
  if (isGenericBeverage(item.name, item.category)) continue
  const key = `${nd.calories}|${nd.carbs}|${nd.fat}|${nd.protein}`
  if (!profileMap.has(key)) profileMap.set(key, [])
  profileMap.get(key)!.push(item)
}

for (const [key, dupes] of profileMap) {
  // Require 3+ different items sharing a profile (not just 2)
  if (dupes.length < 3) continue
  // Check if the items are actually different foods (not variants of same dish)
  const names = dupes.map(d => d.name.toLowerCase().replace(/customized bowl:?\s*/g, '').trim())
  const uniqueRoots = new Set(names.map(n => n.split(' ').slice(0, 3).join(' ')))
  if (uniqueRoots.size > 2) {
    // Actually different foods with identical nutrition
    const [cal, carbs, fat, protein] = key.split('|')
    for (const d of dupes) {
      flags.push({
        item: d.name, location: loc(d), pass: 3, category: 'duplicate-profile',
        severity: 'LOW',
        issue: `Shares identical nutrition profile with ${dupes.length - 1} other different item(s): ${dupes.filter(x => x !== d).map(x => x.name).slice(0, 2).join(', ')}`,
        current: `cal=${cal}, C=${carbs}g, F=${fat}g, P=${protein}g`,
        suggested: `Verify — different foods shouldn't have identical macros`
      })
    }
  }
}

// 3C: Category ranking violations
const categories = ['entree', 'dessert', 'beverage', 'snack', 'side']
for (const cat of categories) {
  const catItems = items.filter(i => i.category === cat && n(i)?.calories)
    .sort((a, b) => (n(b)!.calories ?? 0) - (n(a)!.calories ?? 0))

  // Flag extreme outliers within category
  if (catItems.length < 5) continue
  const cals = catItems.map(i => n(i)!.calories!)
  const median = cals[Math.floor(cals.length / 2)]
  const q1 = cals[Math.floor(cals.length * 0.75)]
  const q3 = cals[Math.floor(cals.length * 0.25)]
  const iqr = q3 - q1

  for (const item of catItems) {
    const cal = n(item)!.calories!
    if (cal > q3 + 2 * iqr || cal < q1 - 2 * iqr) {
      if (cal < 10 && cat !== 'beverage') {
        flags.push({
          item: item.name, location: loc(item), pass: 3, category: 'category-outlier',
          severity: 'HIGH',
          issue: `${cat} with only ${cal} cal — extreme outlier (category median: ${median})`,
          current: `cal=${cal}`,
          suggested: `Verify — possibly missing or corrupted data`
        })
      }
    }
  }

  // Specific ranking checks
  if (cat === 'beverage') {
    for (const item of catItems) {
      const cal = n(item)!.calories!
      const nameLower = item.name.toLowerCase()
      if (/\bwater\b/.test(nameLower) && !/watermelon|waterfront|cold water|water chestnut|waterfall|water park/.test(nameLower) && cal > 20) {
        flags.push({
          item: item.name, location: loc(item), pass: 3, category: 'category-ranking',
          severity: 'MEDIUM',
          issue: `Water with ${cal} calories`,
          current: `cal=${cal}`,
          suggested: `Water should be 0 cal`
        })
      }
    }
  }
}

// 3D: Missing data patterns
const parkMissing = new Map<string, { total: number; missingSodium: number; missingSugar: number; missingProtein: number; missingFiber: number }>()
for (const item of items) {
  const nd = n(item)
  if (!nd) continue
  const park = (item.restaurant as any)?.park?.name ?? 'Unknown'
  if (!parkMissing.has(park)) parkMissing.set(park, { total: 0, missingSodium: 0, missingSugar: 0, missingProtein: 0, missingFiber: 0 })
  const pm = parkMissing.get(park)!
  pm.total++
  if (nd.sodium == null || nd.sodium === 0) pm.missingSodium++
  if (nd.sugar == null || nd.sugar === 0) pm.missingSugar++
  if (nd.protein == null || nd.protein === 0) pm.missingProtein++
  if (nd.fiber == null || nd.fiber === 0) pm.missingFiber++
}

console.log('Missing Data by Park:')
for (const [park, pm] of [...parkMissing.entries()].sort((a, b) => b[1].total - a[1].total)) {
  const sodiumPct = Math.round(pm.missingSodium / pm.total * 100)
  const sugarPct = Math.round(pm.missingSugar / pm.total * 100)
  const proteinPct = Math.round(pm.missingProtein / pm.total * 100)
  if (sodiumPct > 30 || sugarPct > 30 || proteinPct > 30) {
    console.log(`  ${park} (${pm.total} items): sodium missing ${sodiumPct}%, sugar missing ${sugarPct}%, protein missing ${proteinPct}%`)
  }
}

// ============================================================
// OUTPUT SUMMARY
// ============================================================
console.log('\n=== AUDIT SUMMARY ===\n')

// Deduplicate flags by item+issue
const seen = new Set<string>()
const uniqueFlags = flags.filter(f => {
  const key = `${f.item}|||${f.issue}`
  if (seen.has(key)) return false
  seen.add(key)
  return true
})

// Sort by severity
const severityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }
uniqueFlags.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

const highFlags = uniqueFlags.filter(f => f.severity === 'HIGH')
const medFlags = uniqueFlags.filter(f => f.severity === 'MEDIUM')
const lowFlags = uniqueFlags.filter(f => f.severity === 'LOW')

console.log(`Total flags: ${uniqueFlags.length}`)
console.log(`  HIGH severity: ${highFlags.length}`)
console.log(`  MEDIUM severity: ${medFlags.length}`)
console.log(`  LOW severity: ${lowFlags.length}`)

console.log('\n--- HIGH SEVERITY FLAGS (require correction) ---\n')
for (const f of highFlags) {
  console.log(`ITEM: ${f.item}`)
  console.log(`  Location: ${f.location}`)
  console.log(`  Pass ${f.pass} [${f.category}]: ${f.issue}`)
  console.log(`  Current: ${f.current}`)
  console.log(`  Suggested: ${f.suggested}`)
  console.log()
}

console.log('\n--- MEDIUM SEVERITY FLAGS (should verify) ---\n')
for (const f of medFlags) {
  console.log(`ITEM: ${f.item}`)
  console.log(`  Location: ${f.location}`)
  console.log(`  Pass ${f.pass} [${f.category}]: ${f.issue}`)
  console.log(`  Current: ${f.current}`)
  console.log(`  Suggested: ${f.suggested}`)
  console.log()
}

console.log('\n--- LOW SEVERITY FLAGS (informational) ---\n')
for (const f of lowFlags.slice(0, 30)) {
  console.log(`ITEM: ${f.item}`)
  console.log(`  Location: ${f.location}`)
  console.log(`  Pass ${f.pass} [${f.category}]: ${f.issue}`)
  console.log()
}
if (lowFlags.length > 30) console.log(`  ... and ${lowFlags.length - 30} more LOW severity flags`)

// Write full report
writeFileSync('audit-report.json', JSON.stringify(uniqueFlags, null, 2))
console.log('\nFull report written to audit-report.json')

// Category breakdown
console.log('\n--- FLAGS BY CATEGORY ---')
const catCounts = new Map<string, number>()
for (const f of uniqueFlags) {
  catCounts.set(f.category, (catCounts.get(f.category) ?? 0) + 1)
}
for (const [cat, count] of [...catCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${count}`)
}
