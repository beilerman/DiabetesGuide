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

interface FoodEstimate {
  calories: number
  carbs: number
  sugar: number
  fat: number
  protein: number
  fiber: number
  sodium: number
  cholesterol: number
}

// ─── Known-bad template profiles ────────────────────────────────
const KNOWN_TEMPLATES = [
  { cal: 600, carbs: 40, fat: 25, protein: 30 },   // generic entree (210)
  { cal: 200, carbs: 45, fat: 1, protein: 1 },      // sweet beverage (144)
  { cal: 140, carbs: 39, fat: 0, protein: 7 },      // nonsensical snack (112)
  { cal: 400, carbs: 50, fat: 18, protein: 4 },     // dessert default (89)
  { cal: 400, carbs: 55, fat: 18, protein: 5 },     // bakery default (71)
  { cal: 300, carbs: 35, fat: 14, protein: 8 },     // appetizer default (60)
  { cal: 150, carbs: 13, fat: 0, protein: 2 },      // beer default (65)
  { cal: 200, carbs: 18, fat: 0, protein: 2 },      // craft beer default (78)
  { cal: 250, carbs: 25, fat: 12, protein: 8 },     // side dish default (52)
  { cal: 400, carbs: 50, fat: 20, protein: 5 },     // grab-bag (29)
]

function hasTemplateProfile(nd: NutRow): boolean {
  return KNOWN_TEMPLATES.some(t =>
    nd.calories === t.cal && nd.carbs === t.carbs && nd.fat === t.fat && nd.protein === t.protein
  )
}

// ─── Fetch all items ────────────────────────────────────────────
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

async function updateNut(id: string, fields: Record<string, number | null>) {
  if (DRY_RUN) return
  const { error } = await sb.from('nutritional_data').update(fields).eq('id', id)
  if (error) console.error(`  UPDATE FAILED ${id}:`, error.message)
}

// ─── Beverage detection (from fix-caloric-plausibility.ts) ──────
function isLikelyBeverage(name: string): boolean {
  const n = name.toLowerCase()
  if (/\b(modelo|corona|heineken|budweiser|stella artois|yuengling|samuel adams|peroni|chimay|coors|blue moon|strongbow|schöfferhofer|warsteiner|kronenbourg|amstel|beck|dos equis|pacifico|negra modelo|lagunitas|goose island|cigar city|funky buddha|terrapin|sweetwater|dogfish|sierra nevada|new belgium|fat tire|blue point)\b/i.test(n)) return true
  if (/\b(ipa|pilsner|lager|stout|porter|hefeweizen|shandy|gose|amber|pale ale|wheat beer|draft beer|craft beer|on tap)\b/i.test(n) && !/batter|bread|sauce|braise|glaze|crust|rub|marinate/i.test(n)) return true
  if (/\b(martini|margarita|mojito|daiquiri|paloma|negroni|spritz|mule|bellini|mimosa|sangria|old fashioned|mai tai|piña colada|cosmopolitan|manhattan|sidecar|highball|toddy|fizz|sour|boulevardier|sazerac)\b/i.test(n) && !/burger|chicken|pork|steak|fries|sandwich/i.test(n)) return true
  if (/\b(tequila|mezcal|vodka|bourbon|whisky|whiskey|scotch|rum|gin|brandy|cognac|sake|soju)\b/i.test(n) && !/batter|sauce|braise|glaze|crust|rub|marinate|infuse|vodka sauce|alla vodka|penne vodka|bourbon glaze|rum cake|bourbon sauce|whiskey sauce/i.test(n)) return true
  if (/\b(pinot|cabernet|chardonnay|merlot|riesling|sauvignon blanc|prosecco|champagne|rosé|shiraz|malbec|tempranillo|grenache|zinfandel|chianti|barolo|rioja|chablis)\b/i.test(n) && !/sauce|braise|reduction|glaze|braised|rubbed|marinate|infuse/i.test(n)) return true
  if (/\b(cold brew|espresso|latte|cappuccino|americano|macchiato|frappuccino|smoothie|milkshake|juice|soda|lemonade|tea\b|chai\b|matcha|refresher|punch|agua fresca|boba)\b/i.test(n) && !/cake|cookie|brownie|ice cream|crust|sauce/i.test(n)) return true
  if (/\b(butterbeer|wizard'?s brew|daisyroot draught|fishy green ale|gillywater|otter'?s fizzy|fire whiskey|grog|mead|potion|elixir|libation|freeze|slush)\b/i.test(n) && !/fudge|potted cream|ice cream|cake|crêpe/i.test(n)) return true
  if (/\b(flight|on the rocks|neat|up|double|single malt|reserve|aged|barrel|cask)\b/i.test(n) && /\b(tequila|whiskey|bourbon|sake|wine|beer|scotch|rum|vodka|gin)\b/i.test(n)) return true
  if (/\bhigh noon\b/i.test(n)) return true
  return false
}

// ═══════════════════════════════════════════════════════════════════
//  CLASSIFIERS — one per food domain
// ═══════════════════════════════════════════════════════════════════

function classifyDrink(name: string): FoodEstimate | null {
  const n = name.toLowerCase()

  // ── Light beers ───
  if (/\b(bud light|miller lite|michelob ultra|coors light|corona light|amstel light|natural light)\b/i.test(n))
    return { calories: 105, carbs: 5, sugar: 1, fat: 0, protein: 1, fiber: 0, sodium: 10, cholesterol: 0 }

  // ── Standard lagers ───
  if (/\b(corona|modelo|heineken|stella artois|peroni|yuengling|budweiser|beck|dos equis|pacifico|negra modelo|estrella|kronenbourg|amstel|coors(?! light)|pbr|pabst)\b/i.test(n))
    return { calories: 150, carbs: 13, sugar: 2, fat: 0, protein: 2, fiber: 0, sodium: 14, cholesterol: 0 }

  // ── Craft / IPA / Pale Ales ───
  if (/\b(ipa|pale ale|pilsner|amber ale|wheat|hefeweizen|saison|gose|sour|blonde ale|golden ale|session|kolsch|farmhouse|hazy)\b/i.test(n) && !/batter|bread|sauce/i.test(n))
    return { calories: 200, carbs: 18, sugar: 2, fat: 0, protein: 2, fiber: 0, sodium: 15, cholesterol: 0 }

  // ── Strong beers / Belgian / Stout / Porter ───
  if (/\b(stout|porter|barleywine|trappist|abbey|chimay|rochefort|duvel|delirium|triple|tripel|quad|imperial|barrel.aged|strong ale|ommegang)\b/i.test(n))
    return { calories: 300, carbs: 25, sugar: 3, fat: 0, protein: 3, fiber: 0, sodium: 15, cholesterol: 0 }

  // ── Theme park specialty non-alcoholic drinks (BEFORE generic beer/brew) ───
  if (/\b(butterbeer|wizard'?s brew|daisyroot|gillywater|fishy green ale|otter'?s fizzy)\b/i.test(n))
    return { calories: 250, carbs: 50, sugar: 45, fat: 4, protein: 1, fiber: 0, sodium: 30, cholesterol: 0 }

  // ── Hard seltzers (BEFORE generic beer) ───
  if (/\b(hard seltzer|seltzer|nutrl|high noon|white claw|truly|vizzy|topo chico hard)\b/i.test(n))
    return { calories: 100, carbs: 2, sugar: 1, fat: 0, protein: 0, fiber: 0, sodium: 10, cholesterol: 0 }

  // ── Specific beer brands ───
  if (/\b(lagunitas|goose island|cigar city|funky buddha|terrapin|sweetwater|dogfish|sierra nevada|new belgium|fat tire|blue point|blue moon|strongbow|schöfferhofer|warsteiner|crooked can|orange blossom)\b/i.test(n))
    return { calories: 190, carbs: 16, sugar: 2, fat: 0, protein: 2, fiber: 0, sodium: 14, cholesterol: 0 }

  // ── Cider ───
  if (/\b(cider|strongbow)\b/i.test(n) && !/vinegar/i.test(n))
    return { calories: 200, carbs: 22, sugar: 18, fat: 0, protein: 0, fiber: 0, sodium: 10, cholesterol: 0 }

  // ── Generic beer / ale / brew / draft ───
  if (/\b(beer|ale|brew|draft|draught|on tap|craft)\b/i.test(n) && !/batter|bread|sauce|root beer|ginger beer|butterbeer|wizard|proven[çc]ale?|ratatouille|baguette|tamale/i.test(n))
    return { calories: 180, carbs: 15, sugar: 2, fat: 0, protein: 2, fiber: 0, sodium: 14, cholesterol: 0 }

  // ── Wine by bottle ───
  if (/\b(bottle)\b/i.test(n) && /\b(wine|pinot|cabernet|chardonnay|merlot|riesling|sauvignon|prosecco|champagne|rosé|regale)\b/i.test(n))
    return { calories: 625, carbs: 20, sugar: 5, fat: 0, protein: 0, fiber: 0, sodium: 25, cholesterol: 0 }

  // ── Wine flight ───
  if (/\bflight\b/i.test(n) && /\bwine\b/i.test(n))
    return { calories: 200, carbs: 6, sugar: 2, fat: 0, protein: 0, fiber: 0, sodium: 8, cholesterol: 0 }

  // ── Wine by glass / generic varietal ───
  if (/\b(pinot|cabernet|chardonnay|merlot|riesling|sauvignon|prosecco|champagne|rosé|moscato|malbec|shiraz|tempranillo|grenache|zinfandel|chianti|barolo|rioja|chablis|sangiovese|gewurztraminer|regale|vermentino|trebbiano|barbera|primitivo|nebbiolo|grüner|albariño)\b/i.test(n) && !/sauce|braise|reduction|glaze/i.test(n))
    return { calories: 125, carbs: 4, sugar: 1, fat: 0, protein: 0, fiber: 0, sodium: 5, cholesterol: 0 }

  if (/\b(glass|pour)\b/i.test(n) && /\bwine\b/i.test(n))
    return { calories: 125, carbs: 4, sugar: 1, fat: 0, protein: 0, fiber: 0, sodium: 5, cholesterol: 0 }

  if (/^(?:house |red |white |sparkling )?wine$/i.test(n.trim()))
    return { calories: 125, carbs: 4, sugar: 1, fat: 0, protein: 0, fiber: 0, sodium: 5, cholesterol: 0 }

  // ── Spirits (neat/rocks) ───
  if (/\b(whiskey|bourbon|scotch|tequila|mezcal|vodka|rum|gin|brandy|cognac|sake|soju)\b/i.test(n) && !/sauce|glaze|batter|cake|braised/i.test(n))
    return { calories: 130, carbs: 0, sugar: 0, fat: 0, protein: 0, fiber: 0, sodium: 0, cholesterol: 0 }

  // ── Cocktails ───
  if (/\b(margarita|mojito|daiquiri|paloma|negroni|spritz|mule|manhattan|old fashioned|martini|cosmopolitan|sidecar|highball|bellini|mimosa|sangria|mai tai|piña colada|boulevardier|sazerac|aperol)\b/i.test(n) && !/shrimp|fruit|prawn|seafood/i.test(n))
    return { calories: 220, carbs: 18, sugar: 15, fat: 0, protein: 0, fiber: 0, sodium: 5, cholesterol: 0 }

  // ── Frozen alcoholic drinks ───
  if (/\b(frozen|slushy|slush|freeze)\b/i.test(n) && /\b(margarita|daiquiri|colada|rum|vodka|tequila|cocktail|alcoholic)\b/i.test(n))
    return { calories: 280, carbs: 40, sugar: 35, fat: 0, protein: 0, fiber: 0, sodium: 10, cholesterol: 0 }

  // ── Generic "cocktail" word (after excluding shrimp/fruit cocktail above) ───
  if (/\bcocktail\b/i.test(n) && !/shrimp|fruit|prawn|seafood/i.test(n))
    return { calories: 220, carbs: 18, sugar: 15, fat: 0, protein: 0, fiber: 0, sodium: 5, cholesterol: 0 }

  // ── Energy drinks ───
  if (/\b(monster|red bull|celsius|bang|rockstar|reign|energy drink)\b/i.test(n))
    return { calories: 210, carbs: 54, sugar: 52, fat: 0, protein: 0, fiber: 0, sodium: 180, cholesterol: 0 }

  // ── POWERADE / Gatorade ───
  if (/\b(powerade|gatorade|body armor)\b/i.test(n))
    return { calories: 80, carbs: 21, sugar: 21, fat: 0, protein: 0, fiber: 0, sodium: 100, cholesterol: 0 }

  // ── Bottled soda ───
  if (/\b(coca.cola|pepsi|sprite|fanta|dr pepper|mountain dew|root beer|ginger ale|ginger beer)\b/i.test(n) && !/float|cake|sauce/i.test(n))
    return { calories: 140, carbs: 39, sugar: 39, fat: 0, protein: 0, fiber: 0, sodium: 45, cholesterol: 0 }
  if (/\b(soda|bottled soda|pop|cola)\b/i.test(n) && !/float|cake/i.test(n))
    return { calories: 140, carbs: 39, sugar: 39, fat: 0, protein: 0, fiber: 0, sodium: 45, cholesterol: 0 }

  // ── Lemonade / iced tea / juice ───
  if (/\b(lemonade|limeade|iced tea|sweet tea|arnold palmer)\b/i.test(n))
    return { calories: 150, carbs: 38, sugar: 36, fat: 0, protein: 0, fiber: 0, sodium: 10, cholesterol: 0 }
  if (/\b(juice|orange juice|apple juice|cranberry)\b/i.test(n) && !/sauce|glaze/i.test(n))
    return { calories: 140, carbs: 34, sugar: 32, fat: 0, protein: 1, fiber: 0, sodium: 5, cholesterol: 0 }

  // ── Frozen non-alcoholic slushy ───
  if (/\b(frozen|slushy|slush|freeze|icee)\b/i.test(n))
    return { calories: 200, carbs: 50, sugar: 48, fat: 0, protein: 0, fiber: 0, sodium: 20, cholesterol: 0 }

  // ── Coffee drinks ───
  if (/\b(latte|mocha|cappuccino|frappuccino|macchiato)\b/i.test(n) && !/cake|cookie/i.test(n))
    return { calories: 280, carbs: 38, sugar: 32, fat: 10, protein: 8, fiber: 0, sodium: 150, cholesterol: 25 }
  if (/\b(cold brew|iced coffee)\b/i.test(n) && !/cake|cookie/i.test(n))
    return { calories: 150, carbs: 20, sugar: 18, fat: 5, protein: 3, fiber: 0, sodium: 80, cholesterol: 10 }
  if (/\bespresso\b/i.test(n) && !/cake|cookie/i.test(n))
    return { calories: 10, carbs: 1, sugar: 0, fat: 0, protein: 0, fiber: 0, sodium: 5, cholesterol: 0 }

  // ── Hot chocolate ───
  if (/\b(hot chocolate|hot cocoa)\b/i.test(n))
    return { calories: 280, carbs: 42, sugar: 36, fat: 8, protein: 8, fiber: 2, sodium: 150, cholesterol: 20 }

  // ── Smoothie / milkshake ───
  if (/\b(smoothie|milkshake|shake)\b/i.test(n) && !/salt & pepper|pepper shaker|salt shaker/i.test(n))
    return { calories: 450, carbs: 70, sugar: 60, fat: 14, protein: 8, fiber: 2, sodium: 200, cholesterol: 40 }

  // ── Agua fresca / horchata ───
  if (/\b(agua fresca|horchata)\b/i.test(n))
    return { calories: 150, carbs: 35, sugar: 30, fat: 1, protein: 1, fiber: 0, sodium: 20, cholesterol: 0 }

  // ── Water ───
  if (/\bwater\b/i.test(n) && !/watermelon|cold water|waterfront/i.test(n))
    return { calories: 0, carbs: 0, sugar: 0, fat: 0, protein: 0, fiber: 0, sodium: 0, cholesterol: 0 }

  // ── Plain tea ───
  if (/\btea\b/i.test(n) && !/sweet|iced|boba|chai|latte|milk|bubble/i.test(n))
    return { calories: 5, carbs: 1, sugar: 0, fat: 0, protein: 0, fiber: 0, sodium: 5, cholesterol: 0 }

  // ── Black coffee ───
  if (/\bcoffee\b/i.test(n) && !/latte|mocha|cappuccino|cold brew|cream|caramel|vanilla|cinnamon/i.test(n))
    return { calories: 5, carbs: 0, sugar: 0, fat: 0, protein: 0, fiber: 0, sodium: 5, cholesterol: 0 }

  // ── Generic "punch" / unnamed drink ───
  if (/\bpunch\b/i.test(n))
    return { calories: 180, carbs: 42, sugar: 38, fat: 0, protein: 0, fiber: 0, sodium: 10, cholesterol: 0 }

  return null
}

// ─── Dessert/Treat Classification ───────────────────────────────

function classifyDessert(name: string): FoodEstimate | null {
  const n = name.toLowerCase()

  // Sundae
  if (/\bsundae\b/i.test(n))
    return { calories: 550, carbs: 72, sugar: 58, fat: 24, protein: 8, fiber: 2, sodium: 200, cholesterol: 70 }

  // Float
  if (/\bfloat\b/i.test(n))
    return { calories: 350, carbs: 55, sugar: 50, fat: 10, protein: 4, fiber: 0, sodium: 100, cholesterol: 30 }

  // Cupcake
  if (/\bcupcake\b/i.test(n))
    return { calories: 550, carbs: 70, sugar: 50, fat: 28, protein: 5, fiber: 1, sodium: 300, cholesterol: 60 }

  // Funnel cake
  if (/\bfunnel cake\b/i.test(n))
    return { calories: 700, carbs: 85, sugar: 35, fat: 35, protein: 8, fiber: 2, sodium: 400, cholesterol: 50 }

  // Cinnamon roll
  if (/\bcinnamon roll\b/i.test(n))
    return { calories: 550, carbs: 75, sugar: 40, fat: 24, protein: 8, fiber: 2, sodium: 500, cholesterol: 40 }

  // Bread pudding
  if (/\bbread pudding\b/i.test(n))
    return { calories: 500, carbs: 60, sugar: 35, fat: 24, protein: 8, fiber: 1, sodium: 350, cholesterol: 90 }

  // Cake / cheesecake / flan
  if (/\b(cake|cheesecake|flan|entremet|torta|gateau|tres leches|cuatro leches)\b/i.test(n) && !/pancake|crab cake|funnel cake|grilled cheese/i.test(n))
    return { calories: 500, carbs: 60, sugar: 42, fat: 26, protein: 6, fiber: 1, sodium: 350, cholesterol: 80 }

  // Pie / tart
  if (/\b(pie|tart|crisp|cobbler)\b/i.test(n) && !/pizza|pot pie|savory|shepherd/i.test(n))
    return { calories: 450, carbs: 55, sugar: 30, fat: 22, protein: 5, fiber: 2, sodium: 350, cholesterol: 40 }

  // Brownie
  if (/\bbrownie\b/i.test(n))
    return { calories: 400, carbs: 50, sugar: 35, fat: 20, protein: 5, fiber: 2, sodium: 200, cholesterol: 50 }

  // Cookie
  if (/\bcookie\b/i.test(n))
    return { calories: 350, carbs: 45, sugar: 28, fat: 17, protein: 4, fiber: 1, sodium: 250, cholesterol: 35 }

  // Donut / doughnut
  if (/\b(donut|doughnut)\b/i.test(n))
    return { calories: 480, carbs: 58, sugar: 32, fat: 22, protein: 6, fiber: 1, sodium: 350, cholesterol: 30 }

  // Muffin
  if (/\bmuffin\b/i.test(n) && !/english muffin/i.test(n))
    return { calories: 420, carbs: 55, sugar: 28, fat: 18, protein: 6, fiber: 2, sodium: 400, cholesterol: 50 }

  // Croissant (sweet)
  if (/\bcroissant\b/i.test(n))
    return { calories: 350, carbs: 38, sugar: 12, fat: 20, protein: 7, fiber: 1, sodium: 300, cholesterol: 55 }

  // Ice cream sandwich / bar
  if (/\b(ice cream sandwich|ice cream bar|mickey bar|dipped bar|dipped mickey)\b/i.test(n))
    return { calories: 300, carbs: 35, sugar: 28, fat: 16, protein: 4, fiber: 1, sodium: 100, cholesterol: 30 }

  // Ice cream scoop / gelato (single)
  if (/\b(scoop|gelato|ice cream|sorbet|dole whip|soft serve)\b/i.test(n) && !/sundae|float|cake|sandwich|pie|bar/i.test(n))
    return { calories: 280, carbs: 32, sugar: 26, fat: 15, protein: 5, fiber: 1, sodium: 80, cholesterol: 45 }

  // Eclair / cream puff
  if (/\b(eclair|cream puff|profiterole)\b/i.test(n))
    return { calories: 350, carbs: 35, sugar: 22, fat: 20, protein: 6, fiber: 1, sodium: 200, cholesterol: 90 }

  // Candy apple / caramel apple
  if (/\b(candy apple|caramel apple)\b/i.test(n))
    return { calories: 350, carbs: 60, sugar: 50, fat: 12, protein: 2, fiber: 3, sodium: 100, cholesterol: 10 }

  // Marshmallow wand / rice crispy treat
  if (/\b(marshmallow|rice crisp|crispy treat|wand|cereal treat)\b/i.test(n))
    return { calories: 250, carbs: 45, sugar: 30, fat: 6, protein: 2, fiber: 0, sodium: 150, cholesterol: 5 }

  // S'more
  if (/\bs'?more\b/i.test(n))
    return { calories: 350, carbs: 52, sugar: 35, fat: 14, protein: 4, fiber: 1, sodium: 200, cholesterol: 10 }

  // Chocolate dipped fruit/strawberry
  if (/\b(dipped|chocolate.covered|chocolate.*strawberry|dipper)\b/i.test(n))
    return { calories: 200, carbs: 28, sugar: 24, fat: 10, protein: 2, fiber: 2, sodium: 15, cholesterol: 5 }

  // Churro
  if (/\bchurro\b/i.test(n))
    return { calories: 380, carbs: 48, sugar: 20, fat: 18, protein: 4, fiber: 1, sodium: 300, cholesterol: 20 }

  // Fudge / praline / brittle / truffle
  if (/\b(fudge|praline|brittle|toffee|truffle|bonbon)\b/i.test(n))
    return { calories: 300, carbs: 40, sugar: 35, fat: 14, protein: 3, fiber: 1, sodium: 80, cholesterol: 15 }

  // Pudding / mousse / panna cotta / crème brûlée
  if (/\b(pudding|mousse|panna cotta|creme brulee|crème brûlée|verrine|parfait)\b/i.test(n) && !/bread pudding/i.test(n))
    return { calories: 350, carbs: 40, sugar: 30, fat: 18, protein: 5, fiber: 0, sodium: 150, cholesterol: 60 }

  // Pastry / danish / loaf / beignet
  if (/\b(pastry|danish|loaf|beignet|zeppole|baklava|tiramisu|twist|strudel|cannoli)\b/i.test(n))
    return { calories: 380, carbs: 48, sugar: 25, fat: 18, protein: 5, fiber: 1, sodium: 250, cholesterol: 40 }

  // Generic dessert fallback
  return { calories: 400, carbs: 50, sugar: 35, fat: 18, protein: 5, fiber: 1, sodium: 200, cholesterol: 35 }
}

// ─── Entree Classification ──────────────────────────────────────

function classifyEntree(name: string, isFried: boolean): FoodEstimate | null {
  const n = name.toLowerCase()

  // ── BBQ platters / combos ───
  if (/\b(platter|combo|feast|sampler)\b/i.test(n) && /\b(rib|bbq|brisket|pork|pulled|smoked|carnitas|chicken|shrimp|fish|wing)\b/i.test(n))
    return { calories: 950, carbs: 65, sugar: 12, fat: 42, protein: 60, fiber: 4, sodium: 1600, cholesterol: 120 }

  // ── Fish & chips ───
  if (/\b(fish.*chips|fish.*fries|battered.*fish|fried.*fish|fish.*platter)\b/i.test(n))
    return { calories: 800, carbs: 70, sugar: 4, fat: 40, protein: 35, fiber: 3, sodium: 1300, cholesterol: 80 }

  // ── Crab boil / seafood boil ───
  if (/\b(crab boil|seafood boil|bouillabaisse|cioppino|steam pot)\b/i.test(n))
    return { calories: 750, carbs: 30, sugar: 4, fat: 30, protein: 80, fiber: 3, sodium: 2000, cholesterol: 250 }

  // ── Whole lobster / snow crab / king crab ───
  if (/\b(snow crab|king crab|lobster tail|whole lobster)\b/i.test(n))
    return { calories: 400, carbs: 5, sugar: 1, fat: 12, protein: 65, fiber: 0, sodium: 1200, cholesterol: 200 }

  // ── Grilled fish (salmon, grouper, mahi, etc.) ───
  if (/\b(salmon|swordfish|sea bass|grouper|mahi|tuna|tilapia|cod|halibut|trout|snapper|branzino|barramundi)\b/i.test(n) && !/fried|battered|crispy/i.test(n))
    return { calories: 550, carbs: 20, sugar: 3, fat: 25, protein: 55, fiber: 2, sodium: 900, cholesterol: 90 }

  // ── Shrimp & grits ───
  if (/\bshrimp.*grit/i.test(n))
    return { calories: 650, carbs: 40, sugar: 3, fat: 30, protein: 50, fiber: 2, sodium: 1200, cholesterol: 250 }

  // ── Scallops ───
  if (/\bscallop\b/i.test(n))
    return { calories: 450, carbs: 15, sugar: 2, fat: 22, protein: 40, fiber: 1, sodium: 800, cholesterol: 100 }

  // ── Burgers ───
  if (/\b(burger|cheeseburger)\b/i.test(n) && !/slider|mini|kid/i.test(n))
    return { calories: 850, carbs: 55, sugar: 10, fat: 42, protein: 48, fiber: 3, sodium: 1200, cholesterol: 100 }

  // ── Sliders ───
  if (/\bslider\b/i.test(n))
    return { calories: 450, carbs: 30, sugar: 5, fat: 22, protein: 28, fiber: 2, sodium: 800, cholesterol: 60 }

  // ── Steak / prime rib ───
  if (/\b(steak|ribeye|rib.eye|filet|porterhouse|ny strip|sirloin|prime rib|short rib|strip steak|flank)\b/i.test(n))
    return { calories: 700, carbs: 15, sugar: 2, fat: 40, protein: 70, fiber: 1, sodium: 800, cholesterol: 150 }

  // ── BBQ ribs ───
  if (/\b(ribs|rack|spare rib|baby back|st\.? louis)\b/i.test(n) && !/platter|combo/i.test(n))
    return { calories: 800, carbs: 25, sugar: 15, fat: 50, protein: 55, fiber: 1, sodium: 1400, cholesterol: 130 }

  // ── Pulled pork / brisket (no platter) ───
  if (/\b(pulled pork|brisket|smoked|pernil|carnitas)\b/i.test(n) && !/platter|combo/i.test(n))
    return { calories: 650, carbs: 40, sugar: 10, fat: 30, protein: 45, fiber: 2, sodium: 1200, cholesterol: 90 }

  // ── Mac and cheese ───
  if (/\b(mac.*cheese|mac n cheese|mac & cheese)\b/i.test(n))
    return { calories: 550, carbs: 50, sugar: 5, fat: 30, protein: 22, fiber: 2, sodium: 1000, cholesterol: 60 }

  // ── Pasta / lasagna ───
  if (/\b(pasta|spaghetti|penne|fettuccine|rigatoni|linguine|ravioli|lasagna|gnocchi|paccheri|carbonara|alfredo|bolognese|marinara|primavera|puttanesca)\b/i.test(n))
    return { calories: 700, carbs: 75, sugar: 8, fat: 28, protein: 30, fiber: 3, sodium: 1100, cholesterol: 60 }

  // ── Pizza / flatbread ───
  if (/\b(pizza|flatbread)\b/i.test(n) && !/bagel/i.test(n))
    return { calories: 650, carbs: 65, sugar: 7, fat: 27, protein: 30, fiber: 3, sodium: 1200, cholesterol: 50 }

  // ── Wings ───
  if (/\bwings?\b/i.test(n))
    return { calories: 700, carbs: 10, sugar: 3, fat: 45, protein: 55, fiber: 1, sodium: 1800, cholesterol: 180 }

  // ── Grilled/roasted chicken ───
  if (/\b(grilled chicken|roasted chicken|rotisserie|chicken breast|jerk chicken|half chicken|whole chicken)\b/i.test(n))
    return { calories: 600, carbs: 25, sugar: 4, fat: 25, protein: 55, fiber: 2, sodium: 1000, cholesterol: 120 }

  // ── Fried chicken / tenders ───
  if (/\b(fried chicken|chicken tender|chicken finger|chicken strip|chicken nugget|chicken katsu)\b/i.test(n))
    return { calories: 700, carbs: 40, sugar: 3, fat: 38, protein: 42, fiber: 2, sodium: 1400, cholesterol: 100 }

  // ── Chicken sandwich ───
  if (/\bchicken\b/i.test(n) && /\b(sandwich|panini|sub)\b/i.test(n))
    return { calories: 650, carbs: 50, sugar: 6, fat: 30, protein: 42, fiber: 3, sodium: 1200, cholesterol: 80 }

  // ── Sandwich / panini / sub ───
  if (/\b(sandwich|panini|sub|hoagie|po.boy|grilled cheese|melt)\b/i.test(n))
    return { calories: 600, carbs: 50, sugar: 6, fat: 28, protein: 35, fiber: 3, sodium: 1100, cholesterol: 70 }

  // ── Wrap ───
  if (/\bwrap\b/i.test(n))
    return { calories: 550, carbs: 45, sugar: 5, fat: 25, protein: 35, fiber: 4, sodium: 1000, cholesterol: 60 }

  // ── Tacos / burritos ───
  if (/\b(taco|burrito|quesadilla|enchilada|chimichanga|fajita|chile relleno)\b/i.test(n))
    return { calories: 550, carbs: 45, sugar: 4, fat: 28, protein: 30, fiber: 5, sodium: 1000, cholesterol: 60 }

  // ── Asian noodles / stir fry ───
  if (/\b(pad thai|lo mein|noodle|stir.fry|fried rice|ramen|pho|udon|chow mein|yakisoba)\b/i.test(n))
    return { calories: 600, carbs: 65, sugar: 8, fat: 22, protein: 30, fiber: 3, sodium: 1400, cholesterol: 50 }

  // ── Sushi / poke ───
  if (/\b(sushi|poke|roll|maki|sashimi|bento)\b/i.test(n) && !/cinnamon|egg|bread/i.test(n))
    return { calories: 400, carbs: 50, sugar: 8, fat: 12, protein: 22, fiber: 2, sodium: 900, cholesterol: 30 }

  // ── Soup / chowder ───
  if (/\b(soup|chowder|bisque|gumbo|stew|chili)\b/i.test(n))
    return { calories: 350, carbs: 30, sugar: 5, fat: 16, protein: 18, fiber: 3, sodium: 1400, cholesterol: 40 }

  // ── Nachos / totchos ───
  if (/\b(nachos|totchos)\b/i.test(n))
    return { calories: 700, carbs: 55, sugar: 5, fat: 40, protein: 25, fiber: 5, sodium: 1400, cholesterol: 60 }

  // ── Salad (entree) ───
  if (/\bsalad\b/i.test(n))
    return { calories: 450, carbs: 25, sugar: 8, fat: 28, protein: 30, fiber: 5, sodium: 800, cholesterol: 50 }

  // ── Fried entree (generic) ───
  if (isFried || /\b(fried|crispy|battered|tempura|breaded)\b/i.test(n))
    return { calories: 700, carbs: 45, sugar: 4, fat: 38, protein: 35, fiber: 2, sodium: 1200, cholesterol: 80 }

  // ── Grilled/roasted entree (generic) ───
  if (/\b(grilled|roasted|braised|seared|pan.seared)\b/i.test(n))
    return { calories: 600, carbs: 25, sugar: 4, fat: 28, protein: 45, fiber: 3, sodium: 1000, cholesterol: 80 }

  // ── Chicken (generic) ───
  if (/\bchicken\b/i.test(n))
    return { calories: 650, carbs: 30, sugar: 4, fat: 30, protein: 50, fiber: 2, sodium: 1100, cholesterol: 100 }

  // ── Generic entree fallback ───
  return { calories: 600, carbs: 45, sugar: 6, fat: 28, protein: 35, fiber: 3, sodium: 1000, cholesterol: 60 }
}

// ─── Appetizer/Snack Classification ─────────────────────────────

function classifyAppetizer(name: string): FoodEstimate | null {
  const n = name.toLowerCase()

  if (/\bwings?\b/i.test(n))
    return { calories: 700, carbs: 10, sugar: 3, fat: 45, protein: 55, fiber: 1, sodium: 1800, cholesterol: 180 }

  if (/\b(queso|dip|guacamole|hummus|spinach.*dip|cheese.*dip)\b/i.test(n))
    return { calories: 400, carbs: 30, sugar: 5, fat: 28, protein: 12, fiber: 3, sodium: 900, cholesterol: 40 }

  if (/\b(chips|tortilla chips)\b/i.test(n))
    return { calories: 450, carbs: 50, sugar: 4, fat: 25, protein: 6, fiber: 4, sodium: 700, cholesterol: 0 }

  if (/\bcrab cake\b/i.test(n))
    return { calories: 400, carbs: 15, sugar: 2, fat: 22, protein: 30, fiber: 1, sodium: 800, cholesterol: 150 }

  if (/\bmeatball\b/i.test(n))
    return { calories: 400, carbs: 20, sugar: 6, fat: 22, protein: 28, fiber: 2, sodium: 1000, cholesterol: 80 }

  if (/\bscallop\b/i.test(n))
    return { calories: 300, carbs: 10, sugar: 2, fat: 15, protein: 28, fiber: 1, sodium: 600, cholesterol: 80 }

  if (/\bmussel\b/i.test(n))
    return { calories: 350, carbs: 15, sugar: 3, fat: 12, protein: 35, fiber: 0, sodium: 900, cholesterol: 60 }

  if (/\bcalamari\b/i.test(n))
    return { calories: 450, carbs: 30, sugar: 2, fat: 25, protein: 22, fiber: 1, sodium: 1000, cholesterol: 200 }

  if (/\b(soup|chowder|bisque)\b/i.test(n))
    return { calories: 300, carbs: 25, sugar: 5, fat: 15, protein: 12, fiber: 2, sodium: 1200, cholesterol: 30 }

  if (/\b(bruschetta|crostini)\b/i.test(n))
    return { calories: 350, carbs: 30, sugar: 4, fat: 18, protein: 14, fiber: 2, sodium: 700, cholesterol: 30 }

  if (/\b(cheese.*board|charcuterie|burrata)\b/i.test(n))
    return { calories: 500, carbs: 20, sugar: 5, fat: 35, protein: 25, fiber: 1, sodium: 1200, cholesterol: 80 }

  if (/\b(spring roll|egg roll|wonton|dumpling|potsticker|gyoza)\b/i.test(n))
    return { calories: 350, carbs: 35, sugar: 4, fat: 16, protein: 14, fiber: 2, sodium: 800, cholesterol: 30 }

  if (/\b(flauta|tostada|empanada|taquito|tostado)\b/i.test(n))
    return { calories: 400, carbs: 30, sugar: 3, fat: 22, protein: 18, fiber: 3, sodium: 800, cholesterol: 40 }

  if (/\b(pretzel|pretzel bites)\b/i.test(n))
    return { calories: 400, carbs: 65, sugar: 5, fat: 10, protein: 10, fiber: 2, sodium: 800, cholesterol: 5 }

  if (/\b(fries|tots|onion ring)\b/i.test(n))
    return { calories: 400, carbs: 48, sugar: 2, fat: 22, protein: 5, fiber: 3, sodium: 600, cholesterol: 0 }

  // Generic appetizer
  return { calories: 350, carbs: 30, sugar: 5, fat: 18, protein: 14, fiber: 2, sodium: 800, cholesterol: 40 }
}

// ─── Side Dish Classification ───────────────────────────────────

function classifySide(name: string): FoodEstimate | null {
  const n = name.toLowerCase()

  if (/\b(loaded|poutine|cheese fries|chili fries)\b/i.test(n))
    return { calories: 600, carbs: 55, sugar: 3, fat: 35, protein: 15, fiber: 4, sodium: 1000, cholesterol: 40 }

  if (/\b(fries|french fries|tots|tater|waffle fries|curly fries)\b/i.test(n))
    return { calories: 400, carbs: 48, sugar: 1, fat: 20, protein: 5, fiber: 4, sodium: 600, cholesterol: 0 }

  if (/\b(mashed|baked potato|sweet potato|roasted potato|potato)\b/i.test(n) && !/fries|tots|chips/i.test(n))
    return { calories: 250, carbs: 35, sugar: 3, fat: 10, protein: 5, fiber: 3, sodium: 500, cholesterol: 15 }

  if (/\b(corn|esquites|elote)\b/i.test(n))
    return { calories: 200, carbs: 28, sugar: 6, fat: 8, protein: 5, fiber: 3, sodium: 350, cholesterol: 10 }

  if (/\b(slaw|coleslaw)\b/i.test(n))
    return { calories: 200, carbs: 18, sugar: 12, fat: 14, protein: 2, fiber: 2, sodium: 300, cholesterol: 10 }

  if (/\bbean\b/i.test(n))
    return { calories: 250, carbs: 40, sugar: 15, fat: 4, protein: 12, fiber: 8, sodium: 600, cholesterol: 5 }

  if (/\b(green bean|broccoli|asparagus|brussels|sauteed|steamed|vegetable|green)\b/i.test(n) && !/fried|crispy/i.test(n))
    return { calories: 120, carbs: 12, sugar: 4, fat: 6, protein: 4, fiber: 4, sodium: 300, cholesterol: 0 }

  if (/\bsalad\b/i.test(n))
    return { calories: 200, carbs: 12, sugar: 4, fat: 14, protein: 5, fiber: 3, sodium: 350, cholesterol: 10 }

  if (/\brice\b/i.test(n))
    return { calories: 220, carbs: 48, sugar: 1, fat: 1, protein: 4, fiber: 1, sodium: 400, cholesterol: 0 }

  if (/\b(bread|biscuit|naan|roll|cornbread|hush pupp)\b/i.test(n))
    return { calories: 250, carbs: 35, sugar: 5, fat: 10, protein: 6, fiber: 2, sodium: 500, cholesterol: 20 }

  if (/\b(mac|mac.*cheese)\b/i.test(n))
    return { calories: 350, carbs: 30, sugar: 3, fat: 20, protein: 14, fiber: 1, sodium: 700, cholesterol: 40 }

  if (/\b(onion ring)\b/i.test(n))
    return { calories: 400, carbs: 45, sugar: 6, fat: 22, protein: 5, fiber: 2, sodium: 600, cholesterol: 10 }

  if (/\b(soup|chowder)\b/i.test(n))
    return { calories: 250, carbs: 20, sugar: 4, fat: 12, protein: 10, fiber: 2, sodium: 900, cholesterol: 25 }

  // Generic side
  return { calories: 250, carbs: 25, sugar: 4, fat: 12, protein: 8, fiber: 3, sodium: 500, cholesterol: 15 }
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN CLASSIFICATION ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

function estimateItem(item: Item): FoodEstimate | null {
  const n = item.name.toLowerCase()

  // Skip sauces, dressings, modifiers
  if (/\b(sauce|dressing|condiment|garnish|add |make any|side of sauce|toppings\/sauce)\b/i.test(n)) return null

  // 1. Beverages (by category or name detection)
  if (item.category === 'beverage' || isLikelyBeverage(item.name)) {
    return classifyDrink(item.name)
  }

  // 2. Check if an "entree" is actually a drink or dessert
  if (item.category === 'entree') {
    const drinkResult = classifyDrink(item.name)
    if (drinkResult) return drinkResult

    // Check for dessert items miscategorized as entree
    if (/\b(ice cream|gelato|scoop|sundae|brownie|cookie|cake|cupcake|pie|tart|donut|doughnut|muffin|marshmallow|candy|fudge|praline|brittle|churro|eclair|pastry|danish|beignet|strudel|cannoli|s'?more|dipped|truffle|pudding|mousse|chocolate)\b/i.test(n) && !/chicken|burger|steak|fish|sandwich|pork|rib|beef|salmon|pasta|shrimp|crab/i.test(n)) {
      return classifyDessert(item.name)
    }

    return classifyEntree(item.name, item.is_fried)
  }

  // 3. Desserts
  if (item.category === 'dessert') {
    return classifyDessert(item.name)
  }

  // 4. Sides
  if (item.category === 'side') {
    return classifySide(item.name)
  }

  // 5. Snacks / appetizers
  if (item.category === 'snack') {
    return classifyAppetizer(item.name)
  }

  // 6. Fallback — try all classifiers
  const drinkResult = classifyDrink(item.name)
  if (drinkResult) return drinkResult
  const dessertResult = classifyDessert(item.name)
  if (dessertResult) return dessertResult
  return classifyEntree(item.name, item.is_fried)
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (use --apply to write) ===' : '=== APPLYING FIXES ===')
  console.log('Fetching all items...')
  const items = await fetchAll()
  console.log(`Fetched ${items.length} items\n`)

  // Skip official data
  const candidates = items.filter(item => {
    const nd = item.nutritional_data?.[0]
    if (!nd) return false
    if ((nd.confidence_score ?? 0) >= 80 && nd.source === 'official') return false
    return hasTemplateProfile(nd)
  })

  console.log(`Found ${candidates.length} items with known-bad template profiles\n`)

  let fixed = 0
  let skipped = 0
  const byTemplate = new Map<string, number>()

  for (const item of candidates) {
    const nd = item.nutritional_data[0]
    const templateKey = `${nd.calories}/${nd.carbs}/${nd.fat}/${nd.protein}`

    const estimate = estimateItem(item)
    if (!estimate) {
      skipped++
      continue
    }

    // Don't apply if the estimate is identical to the template
    if (estimate.calories === nd.calories && estimate.carbs === nd.carbs &&
        estimate.fat === nd.fat && estimate.protein === nd.protein) {
      skipped++
      continue
    }

    // Validate: caloric math should be within 15%
    // Skip for beverages — alcohol (7 cal/g) isn't captured by P*4+C*4+F*9
    const isBeverage = item.category === 'beverage' || isLikelyBeverage(item.name) || estimate.fat === 0
    const calcCal = (estimate.protein * 4) + (estimate.carbs * 4) + (estimate.fat * 9)
    if (calcCal > 0 && !isBeverage) {
      const ratio = estimate.calories / calcCal
      if (ratio < 0.85 || ratio > 1.15) {
        estimate.calories = calcCal
      }
    }

    // Validate: sugar <= carbs
    if (estimate.sugar > estimate.carbs) estimate.sugar = estimate.carbs

    const r = (item.restaurant as any)
    const loc = `${r?.name ?? '?'} @ ${r?.park?.name ?? '?'}`

    console.log(`  ${templateKey} → ${item.name} | ${loc}`)
    console.log(`    cal=${nd.calories}→${estimate.calories}  C=${nd.carbs}→${estimate.carbs}  F=${nd.fat}→${estimate.fat}  P=${nd.protein}→${estimate.protein}  S=${nd.sugar ?? '?'}→${estimate.sugar}`)

    byTemplate.set(templateKey, (byTemplate.get(templateKey) ?? 0) + 1)

    await updateNut(nd.id, {
      calories: estimate.calories,
      carbs: estimate.carbs,
      fat: estimate.fat,
      protein: estimate.protein,
      sugar: estimate.sugar,
      fiber: estimate.fiber,
      sodium: estimate.sodium,
      cholesterol: estimate.cholesterol,
      confidence_score: 40,
    } as any)

    fixed++
  }

  console.log(`\n${'═'.repeat(70)}`)
  console.log(`  SUMMARY`)
  console.log(`${'═'.repeat(70)}`)
  console.log(`  Total with template profiles: ${candidates.length}`)
  console.log(`  Fixed:    ${fixed}`)
  console.log(`  Skipped:  ${skipped}`)
  console.log(`\n  By template:`)
  for (const [key, count] of [...byTemplate.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${key}: ${count} items`)
  }
  console.log(`${'═'.repeat(70)}`)
  if (DRY_RUN) console.log('\n  Run with --apply to write changes')
}

main().catch(console.error)
