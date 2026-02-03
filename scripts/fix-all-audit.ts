import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const url = process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const sb = createClient(url, key)

// Load audit dump
const items: any[] = JSON.parse(readFileSync(join(__dirname, '..', 'audit-dump.json'), 'utf-8'))

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ============================================================
// Food type detection
// ============================================================
function detectFoodType(name: string, desc: string): string {
  const n = (name + ' ' + desc).toLowerCase()
  if (/turkey leg/.test(n)) return 'turkey_leg'
  if (/funnel cake/.test(n)) return 'funnel_cake'
  if (/fish.*chips|fish n chips/.test(n)) return 'fish_and_chips'
  if (/corn dog/.test(n)) return 'corn_dog'
  if (/hot dog|foot.?long/.test(n)) return 'hotdog'
  if (/chicken tender|chicken strip|chicken nugget|chicken finger/.test(n)) return 'chicken_tenders'
  if (/wing/.test(n) && !/buffalo wing sauce/.test(n)) return 'wings'
  if (/burger|cheeseburger/.test(n)) return 'burger'
  if (/pizza/.test(n)) return 'pizza'
  if (/nachos|totchos/.test(n)) return 'nachos'
  if (/taco/.test(n)) return 'taco'
  if (/burrito/.test(n)) return 'burrito'
  if (/quesadilla/.test(n)) return 'quesadilla'
  if (/wrap/.test(n)) return 'wrap'
  if (/sandwich|panini|sub /.test(n)) return 'sandwich'
  if (/mac.*cheese/.test(n)) return 'mac_cheese'
  if (/pasta|spaghetti|fettuccine|penne|linguine|lasagna/.test(n)) return 'pasta'
  if (/ribs/.test(n)) return 'ribs'
  if (/steak|filet mignon|ribeye|sirloin|new york strip|porterhouse|short rib/.test(n)) return 'steak'
  if (/lobster/.test(n)) return 'lobster'
  if (/crab/.test(n)) return 'crab'
  if (/salmon/.test(n)) return 'salmon'
  if (/shrimp|prawn/.test(n)) return 'shrimp'
  if (/sea bass|mahi|tuna|swordfish|snapper|grouper|cod(?!e)|trout|halibut/.test(n)) return 'fish'
  if (/poke bowl|poke/.test(n)) return 'poke'
  if (/soup|chowder|bisque|gumbo/.test(n)) return 'soup'
  if (/bowl/.test(n) && /rice|grain|quinoa/.test(n)) return 'bowl'
  if (/fries|french fries|tots(?!ch)/.test(n)) return 'fries'
  if (/onion ring/.test(n)) return 'onion_rings'
  if (/pretzel(?!.*dog)/.test(n)) return 'pretzel'
  if (/popcorn(?!.*chicken|.*shrimp)/.test(n)) return 'popcorn'
  if (/edamame/.test(n)) return 'edamame'
  if (/hummus/.test(n)) return 'hummus'
  if (/egg roll|spring roll/.test(n)) return 'egg_roll'
  if (/dumpling|gyoza|xiao long bao|bao|steamed bun|wonton/.test(n)) return 'dumpling'
  if (/cupcake/.test(n)) return 'cupcake'
  if (/churro/.test(n)) return 'churro'
  if (/cookie/.test(n)) return 'cookie'
  if (/brownie/.test(n)) return 'brownie'
  if (/donut|doughnut/.test(n)) return 'donut'
  if (/cheesecake/.test(n)) return 'cheesecake'
  if (/cake/.test(n) && !/pancake|cake pop/.test(n)) return 'cake'
  if (/pie(?:\s|$)|cobbler|crisp(?:\s|$)/.test(n) && !/pizza pie/.test(n)) return 'pie'
  if (/sundae/.test(n)) return 'sundae'
  if (/ice cream|gelato/.test(n)) return 'ice_cream'
  if (/dole whip|soft serve/.test(n)) return 'frozen_treat'
  if (/pudding|mousse|panna cotta|creme brulee|flan|tres leches/.test(n)) return 'pudding'
  if (/tiramisu|souffl/.test(n)) return 'pudding'
  if (/milkshake|shake/.test(n)) return 'milkshake'
  if (/smoothie/.test(n)) return 'smoothie'
  if (/frappuccino|frappe/.test(n)) return 'frappuccino'
  if (/latte|cappuccino|mocha/.test(n)) return 'latte'
  if (/coffee|americano|espresso|cold brew/.test(n)) return 'coffee'
  if (/tea(?:\s|$)|chai/.test(n) && !/steak/.test(n)) return 'tea'
  if (/butterbeer/.test(n)) return 'butterbeer'
  if (/beer|ale|lager|ipa|stout|pilsner|draft|draught/.test(n) && !/ginger beer|root beer/.test(n)) return 'beer'
  if (/wine|sangria|prosecco|champagne|mimosa/.test(n) && !/wine sauce|wine reduction/.test(n)) return 'wine'
  if (/margarita|daiquiri|cocktail|martini|mojito|mai tai|pi[ñn]a colada|hurricane|lava flow|blue hawaii|punch/.test(n)) return 'cocktail'
  if (/soda|coca.cola|sprite|fanta|root beer|ginger beer|ginger ale/.test(n)) return 'soda'
  if (/lemonade|agua fresca|arnold palmer/.test(n)) return 'lemonade'
  if (/juice/.test(n) && !/sauce/.test(n)) return 'juice'
  if (/shave ice|shaved ice|snow cone/.test(n)) return 'shave_ice'
  if (/water(?!melon)/.test(n)) return 'water'
  if (/salad/.test(n)) return 'salad'
  if (/chicken|rotisserie/.test(n)) return 'chicken'
  if (/pork|kalua|carnitas|pulled/.test(n)) return 'pork'
  if (/beef|meatloaf|pot roast|brisket/.test(n)) return 'beef'
  if (/lamb/.test(n)) return 'lamb'
  if (/tofu|tempeh|impossible|beyond/.test(n)) return 'plant_protein'
  if (/bread|roll|biscuit|croissant|muffin|scone|toast/.test(n)) return 'bread'
  if (/pancake|waffle|french toast/.test(n)) return 'pancakes'
  if (/fruit|acai/.test(n)) return 'fruit'
  if (/rice/.test(n)) return 'rice'
  if (/corn/.test(n)) return 'corn'
  return 'unknown'
}

// Target nutrition profiles: { calories, carbs, fat, protein, sugar, fiber, sodium }
// Based on typical theme-park-sized portions from known chain data, USDA, and food science
interface NutritionTarget {
  calories: [number, number]  // [min, max]
  carbPct: [number, number]   // % of cal from carbs
  fatPct: [number, number]    // % of cal from fat
  protPct: [number, number]   // % of cal from protein
  sodiumRange: [number, number]
  sugarMax: number            // max sugar as % of carbs
  fiberRange: [number, number]
}

const TARGETS: Record<string, NutritionTarget> = {
  burger:          { calories: [550, 1100], carbPct: [25, 45], fatPct: [35, 55], protPct: [15, 30], sodiumRange: [700, 2200], sugarMax: 30, fiberRange: [1, 5] },
  pizza:           { calories: [280, 800], carbPct: [35, 55], fatPct: [25, 45], protPct: [12, 22], sodiumRange: [500, 1500], sugarMax: 25, fiberRange: [1, 4] },
  salad:           { calories: [150, 600], carbPct: [15, 45], fatPct: [30, 60], protPct: [10, 35], sodiumRange: [300, 1200], sugarMax: 40, fiberRange: [2, 8] },
  taco:            { calories: [180, 450], carbPct: [30, 50], fatPct: [25, 45], protPct: [15, 30], sodiumRange: [350, 900], sugarMax: 20, fiberRange: [1, 5] },
  burrito:         { calories: [500, 900], carbPct: [35, 55], fatPct: [25, 40], protPct: [15, 25], sodiumRange: [800, 2000], sugarMax: 15, fiberRange: [3, 10] },
  wrap:            { calories: [450, 800], carbPct: [30, 50], fatPct: [25, 45], protPct: [15, 30], sodiumRange: [600, 1600], sugarMax: 20, fiberRange: [2, 6] },
  sandwich:        { calories: [400, 850], carbPct: [30, 50], fatPct: [25, 45], protPct: [15, 30], sodiumRange: [600, 1800], sugarMax: 20, fiberRange: [2, 5] },
  hotdog:          { calories: [350, 650], carbPct: [30, 50], fatPct: [30, 50], protPct: [10, 20], sodiumRange: [700, 1500], sugarMax: 20, fiberRange: [1, 3] },
  corn_dog:        { calories: [350, 550], carbPct: [35, 50], fatPct: [30, 45], protPct: [10, 18], sodiumRange: [600, 1200], sugarMax: 15, fiberRange: [1, 3] },
  chicken_tenders: { calories: [450, 850], carbPct: [25, 40], fatPct: [35, 55], protPct: [18, 30], sodiumRange: [800, 2000], sugarMax: 10, fiberRange: [0, 3] },
  wings:           { calories: [500, 1000], carbPct: [5, 25], fatPct: [45, 65], protPct: [20, 40], sodiumRange: [1000, 2800], sugarMax: 25, fiberRange: [0, 2] },
  nachos:          { calories: [600, 1300], carbPct: [30, 50], fatPct: [35, 55], protPct: [8, 18], sodiumRange: [800, 2400], sugarMax: 15, fiberRange: [3, 10] },
  fries:           { calories: [300, 600], carbPct: [40, 60], fatPct: [30, 50], protPct: [4, 10], sodiumRange: [400, 1200], sugarMax: 5, fiberRange: [2, 6] },
  onion_rings:     { calories: [350, 700], carbPct: [40, 55], fatPct: [35, 50], protPct: [5, 12], sodiumRange: [400, 1200], sugarMax: 15, fiberRange: [1, 4] },
  steak:           { calories: [450, 1000], carbPct: [2, 15], fatPct: [35, 60], protPct: [25, 50], sodiumRange: [400, 1200], sugarMax: 10, fiberRange: [0, 3] },
  ribs:            { calories: [700, 1300], carbPct: [10, 30], fatPct: [40, 60], protPct: [20, 35], sodiumRange: [800, 2200], sugarMax: 30, fiberRange: [0, 3] },
  lobster:         { calories: [300, 700], carbPct: [2, 15], fatPct: [30, 55], protPct: [30, 55], sodiumRange: [500, 1400], sugarMax: 5, fiberRange: [0, 2] },
  crab:            { calories: [250, 600], carbPct: [2, 12], fatPct: [25, 50], protPct: [35, 60], sodiumRange: [600, 1500], sugarMax: 5, fiberRange: [0, 1] },
  salmon:          { calories: [350, 700], carbPct: [5, 25], fatPct: [30, 55], protPct: [25, 45], sodiumRange: [350, 1000], sugarMax: 15, fiberRange: [0, 4] },
  shrimp:          { calories: [250, 600], carbPct: [10, 35], fatPct: [25, 50], protPct: [25, 45], sodiumRange: [500, 1500], sugarMax: 10, fiberRange: [0, 3] },
  fish:            { calories: [300, 700], carbPct: [5, 25], fatPct: [25, 50], protPct: [25, 50], sodiumRange: [350, 1200], sugarMax: 10, fiberRange: [0, 3] },
  poke:            { calories: [400, 700], carbPct: [35, 55], fatPct: [15, 35], protPct: [20, 35], sodiumRange: [600, 1600], sugarMax: 20, fiberRange: [2, 6] },
  fish_and_chips:  { calories: [650, 1100], carbPct: [30, 50], fatPct: [35, 55], protPct: [15, 25], sodiumRange: [700, 1800], sugarMax: 10, fiberRange: [2, 5] },
  pasta:           { calories: [500, 1000], carbPct: [35, 55], fatPct: [25, 45], protPct: [12, 22], sodiumRange: [600, 1800], sugarMax: 15, fiberRange: [2, 6] },
  mac_cheese:      { calories: [500, 900], carbPct: [30, 50], fatPct: [35, 55], protPct: [12, 22], sodiumRange: [700, 1800], sugarMax: 10, fiberRange: [1, 4] },
  soup:            { calories: [180, 450], carbPct: [25, 50], fatPct: [20, 50], protPct: [10, 30], sodiumRange: [600, 1800], sugarMax: 20, fiberRange: [1, 5] },
  bowl:            { calories: [400, 750], carbPct: [35, 55], fatPct: [15, 35], protPct: [15, 30], sodiumRange: [500, 1500], sugarMax: 20, fiberRange: [3, 8] },
  turkey_leg:      { calories: [800, 1200], carbPct: [0, 5], fatPct: [40, 60], protPct: [35, 55], sodiumRange: [1000, 3000], sugarMax: 5, fiberRange: [0, 1] },
  chicken:         { calories: [350, 800], carbPct: [5, 30], fatPct: [25, 50], protPct: [25, 50], sodiumRange: [400, 1500], sugarMax: 15, fiberRange: [0, 4] },
  pork:            { calories: [350, 800], carbPct: [5, 30], fatPct: [30, 55], protPct: [20, 40], sodiumRange: [500, 1500], sugarMax: 15, fiberRange: [0, 3] },
  beef:            { calories: [400, 900], carbPct: [5, 25], fatPct: [35, 60], protPct: [20, 45], sodiumRange: [500, 1500], sugarMax: 10, fiberRange: [0, 3] },
  lamb:            { calories: [400, 900], carbPct: [3, 20], fatPct: [35, 60], protPct: [25, 45], sodiumRange: [400, 1200], sugarMax: 10, fiberRange: [0, 3] },
  quesadilla:      { calories: [400, 750], carbPct: [25, 40], fatPct: [35, 55], protPct: [15, 28], sodiumRange: [600, 1500], sugarMax: 10, fiberRange: [1, 4] },
  dumpling:        { calories: [200, 500], carbPct: [30, 50], fatPct: [20, 40], protPct: [15, 30], sodiumRange: [400, 1200], sugarMax: 10, fiberRange: [1, 3] },
  egg_roll:        { calories: [180, 400], carbPct: [30, 50], fatPct: [30, 50], protPct: [10, 22], sodiumRange: [300, 900], sugarMax: 15, fiberRange: [1, 3] },
  pretzel:         { calories: [350, 600], carbPct: [55, 75], fatPct: [10, 30], protPct: [8, 15], sodiumRange: [500, 1800], sugarMax: 15, fiberRange: [1, 3] },
  popcorn:         { calories: [350, 600], carbPct: [45, 65], fatPct: [25, 45], protPct: [5, 12], sodiumRange: [300, 1000], sugarMax: 10, fiberRange: [3, 10] },
  edamame:         { calories: [120, 200], carbPct: [20, 35], fatPct: [25, 40], protPct: [30, 45], sodiumRange: [300, 800], sugarMax: 15, fiberRange: [3, 8] },
  hummus:          { calories: [250, 500], carbPct: [25, 40], fatPct: [35, 55], protPct: [10, 20], sodiumRange: [400, 1000], sugarMax: 10, fiberRange: [3, 8] },
  bread:           { calories: [200, 450], carbPct: [50, 70], fatPct: [15, 35], protPct: [8, 15], sodiumRange: [200, 700], sugarMax: 30, fiberRange: [1, 4] },
  pancakes:        { calories: [400, 800], carbPct: [45, 65], fatPct: [20, 40], protPct: [8, 15], sodiumRange: [500, 1200], sugarMax: 50, fiberRange: [1, 3] },
  rice:            { calories: [200, 400], carbPct: [70, 90], fatPct: [2, 15], protPct: [5, 12], sodiumRange: [5, 600], sugarMax: 5, fiberRange: [0, 3] },
  corn:            { calories: [120, 300], carbPct: [50, 75], fatPct: [10, 35], protPct: [8, 15], sodiumRange: [200, 800], sugarMax: 30, fiberRange: [2, 5] },
  fruit:           { calories: [80, 250], carbPct: [80, 95], fatPct: [2, 10], protPct: [2, 8], sodiumRange: [0, 50], sugarMax: 90, fiberRange: [2, 8] },
  plant_protein:   { calories: [300, 700], carbPct: [20, 45], fatPct: [25, 50], protPct: [15, 35], sodiumRange: [500, 1500], sugarMax: 15, fiberRange: [3, 8] },
  cupcake:         { calories: [400, 750], carbPct: [45, 65], fatPct: [30, 45], protPct: [3, 8], sodiumRange: [200, 600], sugarMax: 75, fiberRange: [0, 2] },
  churro:          { calories: [250, 450], carbPct: [45, 65], fatPct: [25, 45], protPct: [3, 8], sodiumRange: [150, 500], sugarMax: 55, fiberRange: [0, 2] },
  cookie:          { calories: [250, 550], carbPct: [45, 65], fatPct: [30, 45], protPct: [3, 8], sodiumRange: [100, 500], sugarMax: 65, fiberRange: [0, 3] },
  brownie:         { calories: [350, 650], carbPct: [45, 60], fatPct: [30, 45], protPct: [4, 10], sodiumRange: [100, 500], sugarMax: 70, fiberRange: [1, 4] },
  donut:           { calories: [300, 550], carbPct: [40, 60], fatPct: [30, 50], protPct: [4, 10], sodiumRange: [200, 600], sugarMax: 60, fiberRange: [0, 2] },
  cheesecake:      { calories: [400, 700], carbPct: [25, 45], fatPct: [40, 60], protPct: [6, 14], sodiumRange: [200, 600], sugarMax: 70, fiberRange: [0, 2] },
  cake:            { calories: [350, 700], carbPct: [40, 60], fatPct: [30, 50], protPct: [3, 10], sodiumRange: [150, 600], sugarMax: 75, fiberRange: [0, 3] },
  pie:             { calories: [350, 650], carbPct: [40, 60], fatPct: [30, 50], protPct: [3, 10], sodiumRange: [150, 500], sugarMax: 70, fiberRange: [1, 4] },
  sundae:          { calories: [400, 800], carbPct: [45, 65], fatPct: [25, 45], protPct: [4, 10], sodiumRange: [100, 400], sugarMax: 80, fiberRange: [0, 3] },
  ice_cream:       { calories: [250, 550], carbPct: [35, 55], fatPct: [30, 50], protPct: [5, 12], sodiumRange: [50, 300], sugarMax: 80, fiberRange: [0, 3] },
  frozen_treat:    { calories: [200, 400], carbPct: [60, 90], fatPct: [0, 25], protPct: [0, 8], sodiumRange: [10, 150], sugarMax: 90, fiberRange: [0, 3] },
  pudding:         { calories: [300, 600], carbPct: [35, 55], fatPct: [30, 50], protPct: [5, 12], sodiumRange: [80, 400], sugarMax: 75, fiberRange: [0, 3] },
  funnel_cake:     { calories: [600, 1000], carbPct: [40, 55], fatPct: [35, 50], protPct: [4, 10], sodiumRange: [300, 800], sugarMax: 55, fiberRange: [1, 3] },
  shave_ice:       { calories: [120, 300], carbPct: [85, 100], fatPct: [0, 5], protPct: [0, 3], sodiumRange: [0, 30], sugarMax: 95, fiberRange: [0, 1] },
  milkshake:       { calories: [500, 900], carbPct: [40, 60], fatPct: [30, 50], protPct: [5, 12], sodiumRange: [200, 600], sugarMax: 80, fiberRange: [0, 3] },
  smoothie:        { calories: [250, 500], carbPct: [60, 85], fatPct: [5, 25], protPct: [5, 18], sodiumRange: [30, 300], sugarMax: 80, fiberRange: [2, 8] },
  frappuccino:     { calories: [300, 550], carbPct: [55, 75], fatPct: [15, 35], protPct: [4, 10], sodiumRange: [100, 400], sugarMax: 80, fiberRange: [0, 2] },
  latte:           { calories: [120, 350], carbPct: [30, 55], fatPct: [25, 50], protPct: [15, 30], sodiumRange: [100, 300], sugarMax: 70, fiberRange: [0, 1] },
  coffee:          { calories: [2, 50], carbPct: [0, 50], fatPct: [0, 50], protPct: [0, 30], sodiumRange: [0, 30], sugarMax: 90, fiberRange: [0, 0] },
  tea:             { calories: [0, 150], carbPct: [50, 100], fatPct: [0, 10], protPct: [0, 5], sodiumRange: [0, 30], sugarMax: 95, fiberRange: [0, 0] },
  beer:            { calories: [100, 250], carbPct: [30, 70], fatPct: [0, 5], protPct: [3, 15], sodiumRange: [5, 50], sugarMax: 20, fiberRange: [0, 1] },
  wine:            { calories: [100, 200], carbPct: [10, 40], fatPct: [0, 3], protPct: [0, 5], sodiumRange: [5, 30], sugarMax: 50, fiberRange: [0, 0] },
  cocktail:        { calories: [180, 450], carbPct: [40, 80], fatPct: [0, 15], protPct: [0, 5], sodiumRange: [5, 80], sugarMax: 90, fiberRange: [0, 1] },
  butterbeer:      { calories: [250, 450], carbPct: [60, 85], fatPct: [5, 25], protPct: [2, 8], sodiumRange: [50, 250], sugarMax: 85, fiberRange: [0, 1] },
  soda:            { calories: [0, 300], carbPct: [90, 100], fatPct: [0, 2], protPct: [0, 2], sodiumRange: [0, 80], sugarMax: 100, fiberRange: [0, 0] },
  lemonade:        { calories: [100, 300], carbPct: [85, 100], fatPct: [0, 3], protPct: [0, 3], sodiumRange: [0, 50], sugarMax: 95, fiberRange: [0, 1] },
  juice:           { calories: [80, 250], carbPct: [85, 100], fatPct: [0, 5], protPct: [0, 5], sodiumRange: [0, 40], sugarMax: 95, fiberRange: [0, 2] },
  water:           { calories: [0, 5], carbPct: [0, 0], fatPct: [0, 0], protPct: [0, 0], sodiumRange: [0, 10], sugarMax: 0, fiberRange: [0, 0] },
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

function midpoint(range: [number, number]): number {
  return Math.round((range[0] + range[1]) / 2)
}

// Generate corrected nutrition from a target profile
function generateFromTarget(target: NutritionTarget, currentCal: number | null): Record<string, number> {
  // Use midpoint of calorie range, or clamp current value to range
  let cal: number
  if (currentCal && currentCal >= target.calories[0] && currentCal <= target.calories[1]) {
    cal = currentCal  // current is plausible, keep it
  } else {
    cal = midpoint(target.calories)
  }

  const carbPct = (target.carbPct[0] + target.carbPct[1]) / 2 / 100
  const fatPct = (target.fatPct[0] + target.fatPct[1]) / 2 / 100
  const protPct = (target.protPct[0] + target.protPct[1]) / 2 / 100

  const carbs = Math.round((cal * carbPct) / 4)
  const fat = Math.round((cal * fatPct) / 9)
  const protein = Math.round((cal * protPct) / 4)
  const sodium = midpoint(target.sodiumRange)
  const sugar = Math.round(carbs * target.sugarMax / 200) // half of max
  const fiber = midpoint(target.fiberRange)
  const cholesterol = fat > 10 ? Math.round(fat * 1.5) : 0

  return { calories: cal, carbs, fat, protein, sugar, fiber, sodium, cholesterol }
}

async function main() {
  let fixed = 0
  let skipped = 0
  const batchUpdates: { id: string; update: Record<string, any> }[] = []

  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd) continue

    const name = item.name || ''
    const desc = item.description || ''
    const cal = nd.calories
    const carbs = nd.carbs
    const fat = nd.fat
    const protein = nd.protein
    const sugar = nd.sugar
    const fiber = nd.fiber
    const sodium = nd.sodium

    if (cal == null) continue

    const foodType = detectFoodType(name, desc)
    const target = TARGETS[foodType]

    let needsFix = false
    const update: Record<string, any> = {}

    // === FIX 1: Sugar > carbs (impossible) ===
    if (sugar != null && carbs != null && sugar > carbs) {
      update.sugar = Math.round(carbs * 0.6) // set sugar to 60% of carbs as estimate
      needsFix = true
    }

    // === FIX 2: Fiber > carbs (impossible) ===
    if (fiber != null && carbs != null && fiber > carbs) {
      update.fiber = Math.round(carbs * 0.1)
      needsFix = true
    }

    // === FIX 3: Extreme sodium (>4000mg) — likely USDA per-100g value ===
    if (sodium != null && sodium > 4000) {
      if (target) {
        update.sodium = midpoint(target.sodiumRange)
      } else {
        update.sodium = Math.round(sodium / 10) // assume it was per-100g, typical portion ~100-200g
      }
      needsFix = true
    }

    // === FIX 4: Calories way outside plausible range ===
    if (target) {
      const minCal = target.calories[0]
      const maxCal = target.calories[1]

      if (cal > maxCal * 1.5 || cal < minCal * 0.5) {
        // Recalculate everything from the target profile
        const corrected = generateFromTarget(target, null)
        Object.assign(update, corrected)
        needsFix = true
      } else if (cal > maxCal * 1.15) {
        // Slightly over — scale down proportionally
        const ratio = maxCal / cal
        update.calories = maxCal
        if (carbs != null) update.carbs = Math.round(carbs * ratio)
        if (fat != null) update.fat = Math.round(fat * ratio)
        if (protein != null) update.protein = Math.round(protein * ratio)
        if (sugar != null) update.sugar = Math.round(sugar * ratio)
        if (sodium != null && sodium < 4000) update.sodium = Math.round(sodium * ratio)
        needsFix = true
      } else if (cal < minCal * 0.7) {
        // Under range — scale up proportionally
        const ratio = minCal / cal
        update.calories = minCal
        if (carbs != null) update.carbs = Math.round(carbs * ratio)
        if (fat != null) update.fat = Math.round(fat * ratio)
        if (protein != null) update.protein = Math.round(protein * ratio)
        if (sugar != null) update.sugar = Math.round(sugar * ratio)
        if (sodium != null) update.sodium = Math.round(sodium * ratio)
        needsFix = true
      }
    }

    // === FIX 5: Caloric math mismatch (macros don't match calories) ===
    if (!needsFix && protein != null && carbs != null && fat != null && cal > 50) {
      const calculated = (protein * 4) + (carbs * 4) + (fat * 9)
      const pctDiff = Math.abs(calculated - cal) / cal

      if (pctDiff > 0.25 && Math.abs(calculated - cal) > 80) {
        // Recalculate calories from macros (trust macros over stated cal)
        // Unless it's a drink (alcohol gap is expected)
        if (!['beer', 'wine', 'cocktail', 'butterbeer'].includes(foodType)) {
          if (calculated > cal) {
            // Macros add up to MORE than stated cal — scale macros down
            const ratio = cal / calculated
            update.carbs = Math.round(carbs * ratio)
            update.fat = Math.round(fat * ratio)
            update.protein = Math.round(protein * ratio)
            if (sugar != null) update.sugar = Math.min(Math.round(sugar * ratio), update.carbs ?? carbs)
          } else {
            // Macros add up to LESS than stated cal — trust macros, fix cal
            update.calories = calculated
          }
          needsFix = true
        }
      }
    }

    // === FIX 6: Low protein for meat items ===
    if (!needsFix && target && protein != null && cal > 200) {
      const protPct = (protein * 4) / cal * 100
      const minProtPct = target.protPct[0]
      if (protPct < minProtPct * 0.5 && minProtPct > 10) {
        // Protein is way too low for this food type
        const targetProtPct = (target.protPct[0] + target.protPct[1]) / 2 / 100
        update.protein = Math.round((cal * targetProtPct) / 4)
        needsFix = true
      }
    }

    // === FIX 7: Low sodium for savory items ===
    if (!needsFix && target && sodium != null && cal > 300) {
      if (['entree', 'snack'].includes(item.category) && sodium < 100 && target.sodiumRange[0] > 200) {
        update.sodium = midpoint(target.sodiumRange)
        needsFix = true
      }
    }

    // === FIX 8: High sodium for desserts (unless salted) ===
    if (!needsFix && sodium != null && sodium > 800 && item.category === 'dessert') {
      const n = (name + ' ' + desc).toLowerCase()
      if (!/pretzel|salted|sea salt|bacon|caramel corn/.test(n)) {
        if (target) {
          update.sodium = midpoint(target.sodiumRange)
        } else {
          update.sodium = 300
        }
        needsFix = true
      }
    }

    if (needsFix) {
      // Validate post-fix: sugar ≤ carbs
      const finalCarbs = update.carbs ?? carbs
      if (update.sugar != null && finalCarbs != null && update.sugar > finalCarbs) {
        update.sugar = Math.round(finalCarbs * 0.5)
      }
      if ((sugar ?? 0) > (finalCarbs ?? 999) && update.sugar == null) {
        update.sugar = Math.round((finalCarbs ?? 0) * 0.5)
      }

      // Set confidence score to 35 for corrected items
      update.confidence_score = 35

      batchUpdates.push({ id: item.id, update })
    } else {
      skipped++
    }
  }

  console.log(`\nPrepared ${batchUpdates.length} fixes, ${skipped} items OK`)

  // Apply updates in batches
  let applied = 0
  let errors = 0
  for (let i = 0; i < batchUpdates.length; i++) {
    const { id, update } = batchUpdates[i]
    const { error } = await sb.from('nutritional_data').update(update).eq('menu_item_id', id)
    if (error) {
      console.error(`Error updating ${id}:`, error.message)
      errors++
    } else {
      applied++
    }
    if (applied % 100 === 0) console.log(`Applied ${applied}/${batchUpdates.length}...`)
    if (i % 20 === 0) await delay(100) // rate limit
  }

  console.log(`\nDone! Applied ${applied} fixes, ${errors} errors, ${skipped} items unchanged`)
}

main().catch(console.error)
