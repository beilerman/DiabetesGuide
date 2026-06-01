import { createClient } from '@supabase/supabase-js'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const usdaKey = process.env.USDA_API_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}
if (!usdaKey) {
  console.error('Set USDA_API_KEY in env')
  process.exit(1)
}

const supabase = createClient(url, key)

const NUTRIENT_IDS = {
  protein: 1003,
  carbs: 1005,
  fat: 1004,
  calories: 1008,
  sugar: 2000,
  fiber: 1079,
  sodium: 1093,
  cholesterol: 1253,
} as const

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface USDAFood {
  description: string
  foodNutrients: { nutrientId: number; value: number }[]
}

async function searchUSDA(query: string): Promise<USDAFood | null> {
  const params = new URLSearchParams({
    api_key: usdaKey!,
    query,
    pageSize: '3',
  })
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?${params}`)
  if (!res.ok) return null
  const data = await res.json()
  if (!data.foods?.length) return null
  return data.foods[0]
}

function getNutrient(food: USDAFood, id: number): number | null {
  const n = food.foodNutrients.find(fn => fn.nutrientId === id)
  return n ? Math.round(n.value) : null
}

// Map theme-park item names/descriptions to simple USDA-searchable terms
function buildSearchQuery(name: string, desc: string): string[] {
  const n = name.toLowerCase()
  const d = desc.toLowerCase()
  const queries: string[] = []

  // Starbucks items — use exact Starbucks product names
  if (n.includes('brewed coffee') && n.includes('pike place')) {
    const size = n.includes('venti') ? 'venti' : 'grande'
    queries.push(`starbucks pike place ${size}`)
    queries.push('brewed coffee black')
    return queries
  }
  if (n.includes('caffè americano') || n.includes('caffe americano')) {
    queries.push('americano coffee')
    return queries
  }
  if (n.includes('caffè mocha') || n.includes('caffe mocha')) {
    queries.push('mocha coffee with whipped cream')
    queries.push('cafe mocha')
    return queries
  }
  if (n.includes('cappuccino')) {
    queries.push('cappuccino')
    return queries
  }
  if (n.includes('cold brew')) {
    if (n.includes('vanilla sweet cream')) {
      queries.push('vanilla sweet cream cold brew coffee')
      queries.push('cold brew coffee with cream')
    } else {
      queries.push('cold brew coffee unsweetened')
    }
    return queries
  }
  if (n.includes('nitro cold brew')) {
    queries.push('cold brew coffee unsweetened')
    return queries
  }
  if (n.includes('matcha green tea latte')) {
    queries.push('matcha latte')
    queries.push('green tea latte')
    return queries
  }
  if (n.includes('white chocolate mocha')) {
    queries.push('white chocolate mocha')
    queries.push('white mocha coffee')
    return queries
  }

  // Alcoholic drinks — estimate by type (only if it's actually a drink, not food with these words in description)
  const isLikelyDrink = !n.includes('chicken') && !n.includes('rice bowl') && !n.includes('shrimp') && !n.includes('sandwich') && !n.includes('burger') && !n.includes('salad') && !n.includes('steak') && !n.includes('pork') && !n.includes('taco') && !n.includes('pizza')
  if (isLikelyDrink && (d.includes('vodka') || d.includes('tequila') || d.includes('bourbon') ||
      d.includes('rum') || d.includes('gin') || d.includes('whiskey') ||
      d.includes('brandy') || n.includes('margarita') || n.includes('cocktail'))) {
    if (n.includes('margarita') || d.includes('margarita')) queries.push('margarita cocktail')
    else if (d.includes('bourbon') || d.includes('whiskey')) queries.push('whiskey cocktail mixed drink')
    else if (d.includes('rum') && d.includes('fruit')) queries.push('rum punch cocktail')
    else if (d.includes('vodka') && d.includes('cream')) queries.push('creamy cocktail mixed drink')
    else if (d.includes('vodka')) queries.push('vodka mixed drink cocktail')
    else if (d.includes('tequila')) queries.push('margarita cocktail')
    else if (d.includes('gin')) queries.push('gin cocktail mixed drink')
    else if (d.includes('rum')) queries.push('rum cocktail mixed drink')
    else queries.push('cocktail mixed drink')
    return queries
  }

  // Butterbeer (non-alcoholic butterscotch drink) — must check before beer/lager
  if (n.includes('butterbeer') && !n.includes('ice cream')) {
    queries.push('butterscotch cream soda')
    queries.push('cream soda')
    return queries
  }
  if (n.includes('butterbeer ice cream')) {
    queries.push('butterscotch ice cream waffle cone')
    queries.push('soft serve ice cream waffle cone')
    return queries
  }

  // Beer/lager
  if (n.includes('lager') || n.includes('beer') || n.includes('ale') || n.includes('draft beer') || n.includes('craft beer')) {
    queries.push('beer lager')
    return queries
  }

  // Non-alcoholic specialty drinks
  if (n.includes('blue milk')) {
    queries.push('coconut rice milk smoothie')
    return queries
  }
  if (d.includes('lemonade') && !d.includes('vodka') && !d.includes('rum')) {
    queries.push('lemonade')
    return queries
  }
  if (n.includes('boba') || d.includes('boba')) {
    queries.push('bubble tea boba')
    return queries
  }

  // Frozen drinks (non-alcoholic)
  if (d.includes('frozen') && !d.includes('vodka') && !d.includes('rum') && !d.includes('tequila')) {
    queries.push('frozen fruit drink slushie')
    return queries
  }

  // Bourbon Chicken is food, not a cocktail — check before alcoholic drinks
  if (n.includes('bourbon chicken')) {
    queries.push('bourbon chicken')
    queries.push('glazed chicken')
    return queries
  }

  // Now handle food items using description keywords
  // Pizza
  if (n.includes('pizza') || n.includes('flatbread')) {
    if (d.includes('pepperoni') || n.includes('pepperoni')) queries.push('pepperoni pizza slice')
    else if (d.includes('margherita')) queries.push('margherita pizza')
    else queries.push('cheese pizza slice')
    return queries
  }

  // Burgers
  if (n.includes('burger') || n.includes('cheeseburger')) {
    if (d.includes('bacon')) queries.push('bacon cheeseburger with fries')
    else if (d.includes('vegan') || d.includes('plant')) queries.push('veggie burger with fries')
    else if (n.includes('1 lb') || n.includes('altitude')) queries.push('double cheeseburger with fries')
    else queries.push('cheeseburger with french fries')
    return queries
  }

  // Hot dogs
  if (n.includes('hot dog') || n.includes('corn dog') || n.includes('foot long')) {
    if (d.includes('chili') && d.includes('cheese')) queries.push('chili cheese hot dog')
    else if (d.includes('pretzel')) queries.push('pretzel hot dog')
    else if (n.includes('corn dog')) queries.push('corn dog')
    else if (d.includes('plant') || d.includes('vegan')) queries.push('veggie hot dog')
    else queries.push('hot dog with bun')
    return queries
  }

  // Sandwiches
  if (n.includes('sandwich') || n.includes('melt') || n.includes('sub') || n.includes('wrap')) {
    if (d.includes('grilled chicken') || n.includes('grilled chicken')) queries.push('grilled chicken sandwich')
    else if (d.includes('fried chicken') || d.includes('crispy chicken') || d.includes('breaded chicken')) queries.push('fried chicken sandwich')
    else if (d.includes('brisket') || d.includes('bbq')) queries.push('bbq beef sandwich')
    else if (d.includes('chicken salad')) queries.push('chicken salad sandwich')
    else if (d.includes('seafood')) queries.push('seafood salad sandwich')
    else if (d.includes('grilled cheese') || d.includes('three-cheese') || d.includes('three cheese')) queries.push('grilled cheese sandwich')
    else if (d.includes('ham') && d.includes('cheese')) queries.push('ham and cheese sandwich')
    else if (d.includes('turkey') || d.includes('roast beef')) queries.push('deli sandwich')
    else if (d.includes('pork')) queries.push('pulled pork sandwich')
    else if (d.includes('chicken') && d.includes('waffle')) queries.push('chicken and waffle sandwich')
    else if (d.includes('meatball')) queries.push('meatball sub')
    else if (d.includes('jackfruit')) queries.push('pulled pork sandwich vegetarian')
    else if (d.includes('fish')) queries.push('fish sandwich')
    else {
      // Extract main protein from description
      const protein = extractProtein(d)
      queries.push(`${protein} sandwich`)
    }
    return queries
  }

  // Tacos/burritos
  if (n.includes('taco') || n.includes('burrito') || n.includes('fajita') || n.includes('birria')) {
    if (d.includes('birria') || n.includes('birria')) queries.push('beef birria tacos')
    else if (d.includes('pork') || d.includes('carnitas')) queries.push('pork carnitas tacos')
    else if (d.includes('chicken') && n.includes('fajita')) queries.push('chicken fajitas')
    else if (d.includes('chicken')) queries.push('chicken tacos')
    else if (n.includes('burrito')) queries.push('chicken burrito')
    else queries.push('beef tacos')
    return queries
  }

  // Salads
  if (n.includes('salad')) {
    if (d.includes('caesar')) queries.push('caesar salad with chicken')
    else if (d.includes('chicken')) queries.push('grilled chicken salad')
    else if (d.includes('tuna') || d.includes('seafood')) queries.push('tuna salad')
    else queries.push('garden salad with dressing')
    return queries
  }

  // Rice bowls / poke
  if (n.includes('rice bowl') || n.includes('poke')) {
    if (d.includes('tuna') || n.includes('poke')) queries.push('tuna poke bowl')
    else if (d.includes('shrimp')) queries.push('shrimp rice bowl')
    else if (d.includes('teriyaki')) queries.push('chicken teriyaki rice bowl')
    else if (d.includes('chicken')) queries.push('chicken rice bowl')
    else queries.push('rice bowl with protein')
    return queries
  }

  // Customized bowls — use the components from the name
  if (n.includes('customized bowl')) {
    if (n.includes('shrimp') && n.includes('greens') && n.includes('no sauce')) queries.push('shrimp salad no dressing')
    else if (n.includes('shrimp') && n.includes('rice')) queries.push('shrimp rice and beans')
    else if (n.includes('tofu') && n.includes('greens')) queries.push('fried tofu salad')
    else if (n.includes('tofu') && n.includes('potato')) queries.push('fried tofu sweet potato hash')
    else if (n.includes('tofu') && n.includes('rice')) queries.push('fried tofu rice and beans')
    else if (n.includes('beef') && n.includes('greens')) queries.push('roast beef salad')
    else if (n.includes('beef') && n.includes('potato')) queries.push('roast beef sweet potato')
    else if (n.includes('chicken') && n.includes('potato')) queries.push('grilled chicken sweet potato')
    else if (n.includes('chicken') && n.includes('rice')) queries.push('grilled chicken rice and beans')
    else queries.push('protein bowl rice vegetables')
    return queries
  }

  // Chicken dishes
  if (n.includes('chicken') || d.includes('chicken')) {
    if (n.includes('fried chicken') || d.includes('fried chicken') || n.includes('chicken strip') || n.includes('chicken tender') || n.includes('chicken finger') || n.includes('chicken cutlet') || d.includes('breaded')) {
      if (n.includes('strip') || n.includes('tender') || n.includes('finger')) queries.push('chicken tenders with fries')
      else if (d.includes('waffle')) queries.push('chicken and waffles')
      else if (d.includes('curry') || n.includes('katsu')) queries.push('chicken katsu curry with rice')
      else if (d.includes('buffalo') || n.includes('buffalo')) queries.push('buffalo chicken wings')
      else queries.push('fried chicken dinner')
    }
    else if (n.includes('rotisserie') || d.includes('rotisserie') || d.includes('smoked')) queries.push('rotisserie chicken dinner')
    else if (n.includes('orange chicken') || d.includes('orange sauce')) queries.push('orange chicken with fried rice')
    else if (n.includes('bourbon') || d.includes('bourbon')) queries.push('bourbon chicken')
    else if (n.includes('butter chicken') || d.includes('curry') || d.includes('cream-based')) queries.push('butter chicken with rice')
    else if (n.includes('bbq') || d.includes('bbq')) queries.push('bbq chicken')
    else if (n.includes('asian') || d.includes('asian')) queries.push('asian bbq chicken with rice')
    else if (d.includes('dumplings') || n.includes('dumplings')) queries.push('chicken dumplings steamed')
    else if (n.includes('1/2 chicken') || d.includes('skin-on')) queries.push('half roasted chicken dinner')
    else queries.push('grilled chicken with rice')
    return queries
  }

  // Ribs
  if (n.includes('rib') || d.includes('ribs')) {
    if (d.includes('korean')) queries.push('korean bbq ribs with rice')
    else if (d.includes('spare')) queries.push('spareribs with sides')
    else queries.push('baby back ribs bbq with sides')
    return queries
  }

  // Fish and seafood
  if (n.includes('fish') || n.includes('salmon') || n.includes('shrimp') || n.includes('seafood') || n.includes('crab')) {
    if (n.includes('fish and chips') || n.includes('fish & chips')) queries.push('fish and chips')
    else if (n.includes('salmon')) queries.push('grilled salmon with vegetables')
    else if (n.includes('fried shrimp') || d.includes('fried shrimp')) queries.push('fried shrimp platter with fries')
    else if (n.includes('shrimp') && d.includes('mac') || n.includes('mac')) queries.push('shrimp mac and cheese')
    else if (n.includes('fried fish')) queries.push('fried fish platter with fries')
    else if (d.includes('crab')) queries.push('crab salad')
    else if (d.includes('escargot')) queries.push('escargot appetizer')
    else queries.push('grilled fish with sides')
    return queries
  }

  // Beef dishes
  if (n.includes('brisket') || n.includes('pot roast') || n.includes('filet') || n.includes('steak') || n.includes('beef')) {
    if (n.includes('brisket')) queries.push('smoked beef brisket')
    else if (n.includes('pot roast')) queries.push('pot roast dinner')
    else if (n.includes('filet mignon')) queries.push('filet mignon dinner')
    else if (d.includes('noodle soup')) queries.push('beef noodle soup')
    else if (d.includes('broccoli')) queries.push('beef and broccoli with rice')
    else if (d.includes('stew')) queries.push('beef stew in bread bowl')
    else if (d.includes('tagine') || n.includes('tagine')) queries.push('beef tagine stew')
    else queries.push('roast beef dinner')
    return queries
  }

  // Nachos
  if (n.includes('nacho') || n.includes('totcho')) {
    queries.push('loaded nachos with beef and cheese')
    return queries
  }

  // Pasta
  if (n.includes('spaghetti') || n.includes('mac') || n.includes('pasta') || n.includes('parmigiana')) {
    if (d.includes('meatball') || n.includes('meatball')) queries.push('spaghetti and meatballs')
    else if (n.includes('mac') && n.includes('cheese')) queries.push('macaroni and cheese')
    else if (n.includes('parmigiana') || n.includes('parmesan')) queries.push('chicken parmesan with spaghetti')
    else queries.push('pasta with sauce')
    return queries
  }

  // Pretzels
  if (n.includes('pretzel')) {
    if (d.includes('cinnamon') || n.includes('cinnamon')) queries.push('cinnamon sugar pretzel')
    else if (d.includes('cheese') || d.includes('bacon') || d.includes('stuffed')) queries.push('soft pretzel with cheese sauce')
    else if (n.includes('mickey')) queries.push('soft pretzel with cheese sauce')
    else queries.push('soft pretzel')
    return queries
  }

  // Turkey
  if (n.includes('turkey')) {
    if (n.includes('turkey leg') || d.includes('turkey leg')) queries.push('smoked turkey leg')
    else queries.push('roasted turkey breast dinner')
    return queries
  }

  // Pork
  if (n.includes('pork') || d.includes('pulled pork')) {
    queries.push('pulled pork bbq sandwich')
    return queries
  }

  // Lamb
  if (n.includes('lamb') || d.includes('lamb')) {
    queries.push('grilled lamb kebab')
    return queries
  }

  // Desserts
  if (n.includes('cake') || n.includes('brownie') || n.includes('sundae') || n.includes('funnel cake') ||
      n.includes('donut') || n.includes('cookie') || n.includes('churro') || n.includes('tart') ||
      n.includes('ice cream') || n.includes('dole whip') || n.includes('chocolate')) {
    if (n.includes('funnel cake')) queries.push('funnel cake with powdered sugar')
    else if (n.includes('brownie sundae')) queries.push('brownie sundae with ice cream')
    else if (n.includes('donut') || n.includes('glazed donut')) queries.push('glazed donut')
    else if (n.includes('dole whip')) queries.push('pineapple soft serve')
    else if (n.includes('ice cream cookie') || n.includes('cookie sandwich')) queries.push('ice cream sandwich')
    else if (n.includes('ice cream cup') || n.includes('hand-scooped')) queries.push('ice cream two scoops')
    else if (n.includes('grapefruit cake')) queries.push('layer cake with frosting slice')
    else if (n.includes('chocolate cake') || n.includes('lava')) queries.push('chocolate lava cake')
    else if (n.includes('cinnamon sugar') || n.includes('pretzel nuggets')) queries.push('cinnamon sugar pretzel bites')
    else if (n.includes('waffle cone') || n.includes('soft-serve')) queries.push('soft serve ice cream waffle cone')
    else if (n.includes('tart')) queries.push('fruit tart pastry')
    else queries.push('dessert pastry')
    return queries
  }

  // Pastries / breakfast
  if (n.includes('croissant') || n.includes('pastry') || n.includes('muffin')) {
    if (d.includes('ham') && d.includes('cheese')) queries.push('ham and cheese croissant')
    else if (d.includes('egg') && d.includes('cheese')) queries.push('egg and cheese croissant')
    else if (d.includes('chocolate')) queries.push('chocolate pastry')
    else queries.push('butter croissant')
    return queries
  }

  // Breakfast
  if (n.includes('oat') || n.includes('yogurt') || n.includes('scrambled egg')) {
    if (n.includes('oat')) queries.push('overnight oats')
    else if (n.includes('yogurt')) queries.push('greek yogurt with honey')
    else if (n.includes('scrambled egg')) queries.push('scrambled eggs')
    return queries
  }

  // Popcorn
  if (n.includes('popcorn')) {
    queries.push('buttered popcorn')
    return queries
  }

  // Empanadas
  if (n.includes('empanada')) {
    queries.push('cheese empanada fried')
    return queries
  }

  // Charcuterie
  if (n.includes('charcuterie') || n.includes('sampler') || n.includes('antipasto')) {
    if (n.includes('antipasto')) queries.push('antipasto salad')
    else if (d.includes('rib') && d.includes('brisket')) queries.push('bbq combo platter ribs brisket')
    else queries.push('charcuterie board cheese and crackers')
    return queries
  }

  // Corn
  if (n.includes('corn on the cob') || n.includes('corn cob')) {
    queries.push('corn on the cob with butter')
    return queries
  }

  // Chai
  if (n.includes('chai')) {
    queries.push('chai tea latte')
    return queries
  }

  // Gyro
  if (n.includes('gyro')) {
    queries.push('chicken gyro pita')
    return queries
  }

  // Bangers and mash
  if (n.includes('bangers')) {
    queries.push('bangers and mash sausage')
    return queries
  }

  // Loaded fries
  if (n.includes('loaded fries') || n.includes('fries')) {
    queries.push('loaded fries with cheese and toppings')
    return queries
  }

  // Buffet plate
  if (n.includes('buffet') || d.includes('buffet')) {
    queries.push('turkey dinner plate with sides')
    return queries
  }

  // Meatball cone or specialty
  if (n.includes('meatball')) {
    queries.push('meatball sub')
    return queries
  }

  // Stir fry
  if (n.includes('stir fry') || n.includes('stir-fry')) {
    queries.push('vegetable stir fry with rice')
    return queries
  }

  // Kebab
  if (n.includes('kebab')) {
    queries.push('grilled meat kebab')
    return queries
  }

  // Pickles
  if (n.includes('fried') && n.includes('pickle')) {
    queries.push('fried pickles appetizer')
    return queries
  }

  // Milkshake
  if (n.includes('shake')) {
    queries.push('milkshake cookies and cream')
    return queries
  }

  // Dagwood
  if (n.includes('dagwood')) {
    queries.push('deli club sandwich')
    return queries
  }

  // General fallback: use the description directly, stripped of fluff
  const cleaned = desc
    .replace(/\b(house-?made|signature|artisan|hand-?crafted|premium|classic|famous|served with|choice of|on a|topped with)\b/gi, '')
    .replace(/[.!,]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (cleaned.length > 5) {
    queries.push(cleaned.substring(0, 80))
  }
  queries.push(name.replace(/[()]/g, '').trim())
  return queries
}

function extractProtein(desc: string): string {
  if (desc.includes('chicken')) return 'chicken'
  if (desc.includes('beef') || desc.includes('brisket')) return 'beef'
  if (desc.includes('pork')) return 'pork'
  if (desc.includes('turkey')) return 'turkey'
  if (desc.includes('fish') || desc.includes('salmon')) return 'fish'
  if (desc.includes('shrimp')) return 'shrimp'
  return 'chicken'
}

async function enrich() {
  const { data: rows, error } = await supabase
    .from('menu_items')
    .select('id, name, description, nutritional_data(id, calories, carbs, fat, sugar, protein, fiber, sodium, cholesterol)')

  if (error) {
    console.error('Failed to fetch menu items:', error)
    process.exit(1)
  }

  if (!rows?.length) {
    console.log('No menu items found.')
    return
  }

  // Filter to only unmatched items
  const unmatched = rows.filter(row => {
    const nutData = Array.isArray(row.nutritional_data) ? row.nutritional_data[0] : row.nutritional_data
    return nutData && nutData.sugar == null && nutData.protein == null && nutData.fiber == null && nutData.sodium == null
  })

  console.log(`Found ${unmatched.length} unmatched items to enrich.\n`)

  let enriched = 0
  let failed = 0

  for (let i = 0; i < unmatched.length; i++) {
    const row = unmatched[i]
    const nutData = Array.isArray(row.nutritional_data) ? row.nutritional_data[0] : row.nutritional_data

    if (!nutData) {
      failed++
      continue
    }

    const queries = buildSearchQuery(row.name, row.description || '')
    let food: USDAFood | null = null

    for (const q of queries) {
      food = await searchUSDA(q)
      await delay(200)
      if (food) break
    }

    if (!food) {
      console.log(`  MISS: ${row.name} (tried: ${queries.join(' | ')})`)
      failed++
      continue
    }

    const sugar = getNutrient(food, NUTRIENT_IDS.sugar)
    const protein = getNutrient(food, NUTRIENT_IDS.protein)
    const fiber = getNutrient(food, NUTRIENT_IDS.fiber)
    const sodium = getNutrient(food, NUTRIENT_IDS.sodium)
    const cholesterol = getNutrient(food, NUTRIENT_IDS.cholesterol)
    const usdaCals = getNutrient(food, NUTRIENT_IDS.calories)
    const usdaCarbs = getNutrient(food, NUTRIENT_IDS.carbs)
    const usdaFat = getNutrient(food, NUTRIENT_IDS.fat)

    // Lower confidence since we're matching by description, not exact name
    const confidence = 55

    const update: Record<string, number | null | string> = {
      sugar,
      protein,
      fiber,
      sodium,
      cholesterol,
      confidence_score: confidence,
      source: 'api_lookup',
    }

    // Backfill calories/carbs/fat if currently 0
    if ((nutData.calories ?? 0) === 0 && usdaCals != null) update.calories = usdaCals
    if ((nutData.carbs ?? 0) === 0 && usdaCarbs != null) update.carbs = usdaCarbs
    if ((nutData.fat ?? 0) === 0 && usdaFat != null) update.fat = usdaFat

    const { error: updateErr } = await supabase
      .from('nutritional_data')
      .update(update)
      .eq('id', nutData.id)

    if (updateErr) {
      console.error(`  ERR: ${row.name}: ${updateErr.message}`)
      failed++
    } else {
      enriched++
    }

    if ((enriched + failed) % 20 === 0) {
      console.log(`Progress: ${enriched + failed}/${unmatched.length} (enriched: ${enriched}, failed: ${failed})`)
    }
  }

  console.log(
    `\nDone! Enriched ${enriched} items, ${failed} failed (no USDA match or error)`
  )
}

enrich().catch(console.error)
