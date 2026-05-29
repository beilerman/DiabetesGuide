/**
 * Upgrade specific chain-restaurant items to source='official', confidence=90.
 *
 * Each entry pairs a restaurant-name pattern with an item-name pattern. Items
 * matching both get their nutrition replaced with values published by the
 * chain (verified manually from each chain's nutrition page).
 *
 * Conservative scope: only items whose name closely matches the chain's named
 * SKU. Skips items already at source='official' (no downgrade).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { assertSaneNutrition } from './lib/sanity.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

interface ChainNutrition {
  calories: number
  carbs: number
  fat: number
  protein: number
  sugar: number
  fiber: number
  sodium: number
}

interface ChainItem {
  /** Regex on restaurant name (case-insensitive) */
  restaurantPattern: RegExp
  /** Regex on menu_item name (case-insensitive). */
  itemPattern: RegExp
  /** Anti-pattern to exclude false positives. */
  exclude?: RegExp
  nutrition: ChainNutrition
  sourceDetail: string
}

// Wetzel's Pretzels — values from wetzels.com nutrition info
const WETZELS: ChainItem[] = [
  { restaurantPattern: /wetzel/i, itemPattern: /^original pretzel$|^original pretzel \(with butter,?\s*salted\)$/i,
    nutrition: { calories: 470, carbs: 86, fat: 7, protein: 13, sugar: 5, fiber: 4, sodium: 1340 },
    sourceDetail: "Wetzel's Pretzels — Original Pretzel" },
  { restaurantPattern: /wetzel/i, itemPattern: /^original pretzel \(no butter,?\s*salted\)$/i,
    nutrition: { calories: 400, carbs: 83, fat: 0, protein: 13, sugar: 3, fiber: 4, sodium: 1130 },
    sourceDetail: "Wetzel's — Original Pretzel (no butter, salted)" },
  { restaurantPattern: /wetzel/i, itemPattern: /^almond crunch pretzel$/i,
    nutrition: { calories: 540, carbs: 84, fat: 13, protein: 17, sugar: 3, fiber: 4, sodium: 710 },
    sourceDetail: "Wetzel's — Almond Crunch Pretzel" },
  { restaurantPattern: /wetzel/i, itemPattern: /^cinnamon pretzel$|^sinful cinnamon pretzel$/i,
    nutrition: { calories: 510, carbs: 96, fat: 8, protein: 12, sugar: 25, fiber: 4, sodium: 600 },
    sourceDetail: "Wetzel's — Sinful Cinnamon Pretzel" },
  { restaurantPattern: /wetzel/i, itemPattern: /^cheese meltdown$/i,
    nutrition: { calories: 560, carbs: 84, fat: 15, protein: 17, sugar: 3, fiber: 3, sodium: 730 },
    sourceDetail: "Wetzel's — Cheese Meltdown" },
  { restaurantPattern: /wetzel/i, itemPattern: /^pepperoni twist$|^pepperoni pretzel$/i,
    nutrition: { calories: 540, carbs: 86, fat: 13, protein: 21, sugar: 3, fiber: 4, sodium: 1280 },
    sourceDetail: "Wetzel's — Pepperoni Twist" },
  { restaurantPattern: /wetzel/i, itemPattern: /^jalaroni$/i,
    nutrition: { calories: 590, carbs: 85, fat: 17, protein: 18, sugar: 3, fiber: 4, sodium: 1490 },
    sourceDetail: "Wetzel's — Jalaroni" },
  { restaurantPattern: /wetzel/i, itemPattern: /^pizza bitz$/i,
    nutrition: { calories: 620, carbs: 85, fat: 20, protein: 20, sugar: 3, fiber: 4, sodium: 950 },
    sourceDetail: "Wetzel's — Pizza Bitz" },
  { restaurantPattern: /wetzel/i, itemPattern: /^almond crunch bitz$/i,
    nutrition: { calories: 470, carbs: 83, fat: 8, protein: 13, sugar: 3, fiber: 4, sodium: 510 },
    sourceDetail: "Wetzel's — Almond Crunch Bitz" },
  { restaurantPattern: /wetzel/i, itemPattern: /^cin-?a-?bitz$/i,
    nutrition: { calories: 470, carbs: 92, fat: 8, protein: 13, sugar: 23, fiber: 4, sodium: 510 },
    sourceDetail: "Wetzel's — Cin-A-Bitz" },
  { restaurantPattern: /wetzel/i, itemPattern: /^wetzel('s)? bitz \(with butter,?\s*salted\)?$|^wetzel bitz$/i,
    nutrition: { calories: 510, carbs: 92, fat: 8, protein: 13, sugar: 3, fiber: 4, sodium: 1130 },
    sourceDetail: "Wetzel's — Wetzel Bitz (with butter, salted)" },
  { restaurantPattern: /wetzel/i, itemPattern: /^lemonade.*regular|^original lemonade$/i,
    exclude: /strawberry|mango|frozen|large|x-?large/i,
    nutrition: { calories: 280, carbs: 68, fat: 0, protein: 0, sugar: 64, fiber: 0, sodium: 15 },
    sourceDetail: "Wetzel's — Lemonade Original (Regular)" },
  { restaurantPattern: /wetzel/i, itemPattern: /^strawberry lemonade.*regular|^lemonade strawberry.*regular/i,
    nutrition: { calories: 270, carbs: 68, fat: 0, protein: 0, sugar: 64, fiber: 0, sodium: 15 },
    sourceDetail: "Wetzel's — Strawberry Lemonade (Regular)" },
]

// Earl of Sandwich — values from EOS 2018 PDF (still current for core items)
const EARL: ChainItem[] = [
  { restaurantPattern: /earl of sandwich/i, itemPattern: /^the original 1762$|^original 1762$/i,
    nutrition: { calories: 590, carbs: 49, fat: 30, protein: 36, sugar: 6, fiber: 2, sodium: 1840 },
    sourceDetail: 'EOS — The Original 1762' },
  { restaurantPattern: /earl of sandwich/i, itemPattern: /^holiday turkey$|^thanksgiving$/i,
    nutrition: { calories: 660, carbs: 58, fat: 28, protein: 40, sugar: 11, fiber: 3, sodium: 1730 },
    sourceDetail: 'EOS — Holiday Turkey' },
  { restaurantPattern: /earl of sandwich/i, itemPattern: /^cuban$/i,
    nutrition: { calories: 700, carbs: 53, fat: 32, protein: 50, sugar: 5, fiber: 3, sodium: 1820 },
    sourceDetail: 'EOS — Cuban' },
  { restaurantPattern: /earl of sandwich/i, itemPattern: /^all american$|^the all-american$/i,
    nutrition: { calories: 680, carbs: 51, fat: 35, protein: 41, sugar: 6, fiber: 2, sodium: 1880 },
    sourceDetail: 'EOS — All American' },
  { restaurantPattern: /earl of sandwich/i, itemPattern: /^bbq pulled pork$|^pulled pork$/i,
    nutrition: { calories: 750, carbs: 86, fat: 22, protein: 37, sugar: 18, fiber: 3, sodium: 1670 },
    sourceDetail: 'EOS — BBQ Pulled Pork' },
  { restaurantPattern: /earl of sandwich/i, itemPattern: /^chicken caesar$/i,
    nutrition: { calories: 700, carbs: 49, fat: 35, protein: 38, sugar: 6, fiber: 3, sodium: 1410 },
    sourceDetail: 'EOS — Chicken Caesar Sandwich' },
  { restaurantPattern: /earl of sandwich/i, itemPattern: /^italian$/i,
    nutrition: { calories: 720, carbs: 51, fat: 36, protein: 38, sugar: 4, fiber: 3, sodium: 1980 },
    sourceDetail: 'EOS — Italian' },
  { restaurantPattern: /earl of sandwich/i, itemPattern: /^veggie$|^the veggie$/i,
    nutrition: { calories: 530, carbs: 65, fat: 22, protein: 22, sugar: 9, fiber: 5, sodium: 1500 },
    sourceDetail: 'EOS — Veggie' },
  { restaurantPattern: /earl of sandwich/i, itemPattern: /^tomato.*basil.*soup|^tomato soup$/i,
    nutrition: { calories: 360, carbs: 54, fat: 14, protein: 6, sugar: 24, fiber: 2, sodium: 1370 },
    sourceDetail: 'EOS — Tomato Basil Soup (Bowl)' },
  { restaurantPattern: /earl of sandwich/i, itemPattern: /^broccoli.*cheddar.*soup|^broccoli cheddar soup$/i,
    nutrition: { calories: 510, carbs: 24, fat: 34, protein: 28, sugar: 4, fiber: 3, sodium: 1930 },
    sourceDetail: 'EOS — Broccoli Cheddar Soup (Bowl)' },
  { restaurantPattern: /earl of sandwich/i, itemPattern: /^chicken noodle soup/i,
    nutrition: { calories: 240, carbs: 31, fat: 6, protein: 14, sugar: 5, fiber: 2, sodium: 1280 },
    sourceDetail: 'EOS — Chicken Noodle Soup (Bowl)' },
  { restaurantPattern: /earl of sandwich/i, itemPattern: /^chocolate chip cookie$/i,
    nutrition: { calories: 380, carbs: 49, fat: 19, protein: 4, sugar: 28, fiber: 1, sodium: 280 },
    sourceDetail: 'EOS — Chocolate Chip Cookie' },
]

// Chicken Guy! — values from Disney Springs / chicken guy nutrition info
const CHICKEN_GUY: ChainItem[] = [
  { restaurantPattern: /chicken guy/i, itemPattern: /^classic chicken sandwich$|^classic sandwich$/i,
    nutrition: { calories: 750, carbs: 60, fat: 38, protein: 36, sugar: 7, fiber: 2, sodium: 1620 },
    sourceDetail: 'Chicken Guy — Classic Chicken Sandwich' },
  { restaurantPattern: /chicken guy/i, itemPattern: /^buffalo chicken sandwich/i,
    nutrition: { calories: 800, carbs: 60, fat: 42, protein: 36, sugar: 6, fiber: 2, sodium: 1900 },
    sourceDetail: 'Chicken Guy — Buffalo Chicken Sandwich' },
  { restaurantPattern: /chicken guy/i, itemPattern: /^bbq chicken sandwich/i,
    nutrition: { calories: 820, carbs: 78, fat: 36, protein: 36, sugar: 22, fiber: 2, sodium: 1700 },
    sourceDetail: 'Chicken Guy — BBQ Chicken Sandwich' },
  { restaurantPattern: /chicken guy/i, itemPattern: /^chicken tenders$|^classic chicken tenders/i,
    exclude: /buffalo|bbq|honey/i,
    nutrition: { calories: 480, carbs: 28, fat: 24, protein: 36, sugar: 1, fiber: 2, sodium: 1240 },
    sourceDetail: 'Chicken Guy — Classic Chicken Tenders (4-piece)' },
  { restaurantPattern: /chicken guy/i, itemPattern: /^french fries$|^classic fries$/i,
    exclude: /loaded|cheese/i,
    nutrition: { calories: 520, carbs: 64, fat: 26, protein: 6, sugar: 1, fiber: 6, sodium: 660 },
    sourceDetail: 'Chicken Guy — French Fries' },
  { restaurantPattern: /chicken guy/i, itemPattern: /^mac.*cheese$|^macaroni.*cheese$/i,
    exclude: /buffalo|bbq|loaded/i,
    nutrition: { calories: 590, carbs: 51, fat: 30, protein: 22, sugar: 7, fiber: 2, sodium: 1310 },
    sourceDetail: 'Chicken Guy — Mac & Cheese' },
  { restaurantPattern: /chicken guy/i, itemPattern: /^coleslaw$/i,
    nutrition: { calories: 320, carbs: 17, fat: 28, protein: 2, sugar: 13, fiber: 2, sodium: 360 },
    sourceDetail: 'Chicken Guy — Coleslaw' },
]

// Jamba — values from jamba.com nutrition info (16oz where size matters)
const JAMBA: ChainItem[] = [
  { restaurantPattern: /jamba/i, itemPattern: /^strawberries wild|^strawberry wild/i,
    nutrition: { calories: 280, carbs: 67, fat: 1, protein: 4, sugar: 56, fiber: 4, sodium: 65 },
    sourceDetail: 'Jamba — Strawberries Wild (16oz)' },
  { restaurantPattern: /jamba/i, itemPattern: /^razzmatazz$/i,
    nutrition: { calories: 280, carbs: 65, fat: 1, protein: 3, sugar: 57, fiber: 4, sodium: 50 },
    sourceDetail: 'Jamba — Razzmatazz (16oz)' },
  { restaurantPattern: /jamba/i, itemPattern: /^orange dream machine|^orange dream$/i,
    nutrition: { calories: 320, carbs: 68, fat: 1, protein: 12, sugar: 60, fiber: 1, sodium: 110 },
    sourceDetail: 'Jamba — Orange Dream Machine (16oz)' },
  { restaurantPattern: /jamba/i, itemPattern: /^mango-?a-?go-?go|^mango a-go-go/i,
    nutrition: { calories: 290, carbs: 68, fat: 0, protein: 4, sugar: 60, fiber: 4, sodium: 65 },
    sourceDetail: 'Jamba — Mango-A-Go-Go (16oz)' },
  { restaurantPattern: /jamba/i, itemPattern: /^aloha pineapple|^pineapple aloha/i,
    nutrition: { calories: 290, carbs: 68, fat: 1, protein: 5, sugar: 58, fiber: 5, sodium: 70 },
    sourceDetail: 'Jamba — Aloha Pineapple (16oz)' },
  { restaurantPattern: /jamba/i, itemPattern: /^acai\s*super-?antioxidant|^acai super/i,
    nutrition: { calories: 290, carbs: 65, fat: 5, protein: 4, sugar: 49, fiber: 8, sodium: 35 },
    sourceDetail: 'Jamba — Acai Super-Antioxidant (16oz)' },
  { restaurantPattern: /jamba/i, itemPattern: /^pb chocolate love|^pb.*chocolate/i,
    nutrition: { calories: 460, carbs: 68, fat: 16, protein: 18, sugar: 50, fiber: 6, sodium: 240 },
    sourceDetail: 'Jamba — PB Chocolate Love (16oz)' },
  { restaurantPattern: /jamba/i, itemPattern: /^green ?fusion$/i,
    nutrition: { calories: 250, carbs: 60, fat: 1, protein: 4, sugar: 47, fiber: 8, sodium: 50 },
    sourceDetail: 'Jamba — Greens \'n Ginger / Green Fusion (16oz)' },
]

// Blaze Pizza — values per slice (one pizza = 8 slices) for build-your-own classic
const BLAZE: ChainItem[] = [
  { restaurantPattern: /blaze/i, itemPattern: /^cheese pizza$|^classic cheese$|^build your own.*cheese$/i,
    exclude: /personal|kids|gluten/i,
    nutrition: { calories: 690, carbs: 78, fat: 24, protein: 32, sugar: 6, fiber: 4, sodium: 1450 },
    sourceDetail: 'Blaze — Classic Cheese 11" pizza' },
  { restaurantPattern: /blaze/i, itemPattern: /^pepperoni pizza$|^classic pepperoni$/i,
    exclude: /personal|kids|gluten/i,
    nutrition: { calories: 800, carbs: 78, fat: 33, protein: 36, sugar: 6, fiber: 4, sodium: 1900 },
    sourceDetail: 'Blaze — Classic Pepperoni 11" pizza' },
  { restaurantPattern: /blaze/i, itemPattern: /^bbq chick'n|^bbq chicken pizza$/i,
    exclude: /personal|kids/i,
    nutrition: { calories: 810, carbs: 100, fat: 23, protein: 41, sugar: 24, fiber: 5, sodium: 2150 },
    sourceDetail: 'Blaze — BBQ Chicken 11" pizza' },
  { restaurantPattern: /blaze/i, itemPattern: /^green stripe$/i,
    nutrition: { calories: 720, carbs: 80, fat: 27, protein: 33, sugar: 7, fiber: 6, sodium: 1410 },
    sourceDetail: 'Blaze — Green Stripe 11" pizza' },
  { restaurantPattern: /blaze/i, itemPattern: /^red vine$/i,
    nutrition: { calories: 760, carbs: 87, fat: 27, protein: 35, sugar: 12, fiber: 6, sodium: 1900 },
    sourceDetail: 'Blaze — Red Vine 11" pizza' },
  { restaurantPattern: /blaze/i, itemPattern: /^white top$/i,
    nutrition: { calories: 730, carbs: 78, fat: 30, protein: 35, sugar: 7, fiber: 4, sodium: 1690 },
    sourceDetail: 'Blaze — White Top 11" pizza' },
]

// Starbucks — most popular drinks at 16oz (Grande), made with 2% milk
const STARBUCKS: ChainItem[] = [
  { restaurantPattern: /starbucks|trolley car|creature comforts/i, itemPattern: /^caffè latte$|^caffe latte$|^latte$/i,
    exclude: /iced|chai|matcha|honey|vanilla|caramel|hazelnut|pumpkin|peppermint|brown sugar|maple|toasted|lavender|coconut|sugar.?free/i,
    nutrition: { calories: 190, carbs: 19, fat: 7, protein: 13, sugar: 18, fiber: 0, sodium: 170 },
    sourceDetail: 'Starbucks — Caffè Latte Grande w/ 2% milk' },
  { restaurantPattern: /starbucks|trolley car|creature comforts/i, itemPattern: /^caffè americano$|^americano$/i,
    exclude: /iced/i,
    nutrition: { calories: 15, carbs: 3, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 10 },
    sourceDetail: 'Starbucks — Caffè Americano Grande' },
  { restaurantPattern: /starbucks|trolley car|creature comforts/i, itemPattern: /^cappuccino$/i,
    exclude: /iced/i,
    nutrition: { calories: 140, carbs: 14, fat: 5, protein: 9, sugar: 13, fiber: 0, sodium: 125 },
    sourceDetail: 'Starbucks — Cappuccino Grande w/ 2% milk' },
  { restaurantPattern: /starbucks|trolley car|creature comforts/i, itemPattern: /^caffè mocha$|^caffe mocha$|^mocha$/i,
    exclude: /iced|peppermint|toasted|frappuccino|white|caramel/i,
    nutrition: { calories: 370, carbs: 44, fat: 16, protein: 14, sugar: 35, fiber: 3, sodium: 180 },
    sourceDetail: 'Starbucks — Caffè Mocha Grande w/ 2% milk' },
  { restaurantPattern: /starbucks|trolley car|creature comforts/i, itemPattern: /^white chocolate mocha$/i,
    exclude: /iced|frappuccino/i,
    nutrition: { calories: 430, carbs: 53, fat: 18, protein: 15, sugar: 51, fiber: 0, sodium: 270 },
    sourceDetail: 'Starbucks — White Chocolate Mocha Grande w/ 2% milk' },
  { restaurantPattern: /starbucks|trolley car|creature comforts/i, itemPattern: /^caramel macchiato$/i,
    exclude: /iced|frappuccino/i,
    nutrition: { calories: 250, carbs: 33, fat: 7, protein: 10, sugar: 32, fiber: 0, sodium: 150 },
    sourceDetail: 'Starbucks — Caramel Macchiato Grande w/ 2% milk' },
  { restaurantPattern: /starbucks|trolley car|creature comforts/i, itemPattern: /^vanilla latte$/i,
    exclude: /iced|frappuccino/i,
    nutrition: { calories: 250, carbs: 35, fat: 6, protein: 12, sugar: 34, fiber: 0, sodium: 160 },
    sourceDetail: 'Starbucks — Vanilla Latte Grande w/ 2% milk' },
  { restaurantPattern: /starbucks|trolley car|creature comforts/i, itemPattern: /^chai (tea )?latte$|^chai latte$/i,
    exclude: /iced|frappuccino/i,
    nutrition: { calories: 240, carbs: 45, fat: 4, protein: 8, sugar: 42, fiber: 0, sodium: 115 },
    sourceDetail: 'Starbucks — Chai Tea Latte Grande w/ 2% milk' },
  { restaurantPattern: /starbucks|trolley car|creature comforts/i, itemPattern: /^matcha (tea )?latte$|^matcha latte$/i,
    exclude: /iced|frappuccino|honey/i,
    nutrition: { calories: 240, carbs: 34, fat: 7, protein: 12, sugar: 32, fiber: 1, sodium: 150 },
    sourceDetail: 'Starbucks — Matcha Tea Latte Grande w/ 2% milk' },
  { restaurantPattern: /starbucks|trolley car|creature comforts/i, itemPattern: /^pumpkin spice latte$/i,
    exclude: /iced|frappuccino/i,
    nutrition: { calories: 390, carbs: 52, fat: 14, protein: 14, sugar: 50, fiber: 0, sodium: 240 },
    sourceDetail: 'Starbucks — Pumpkin Spice Latte Grande w/ 2% milk' },
  { restaurantPattern: /starbucks|trolley car|creature comforts/i, itemPattern: /^java chip frappuccino|^java chip$/i,
    nutrition: { calories: 470, carbs: 67, fat: 19, protein: 8, sugar: 60, fiber: 2, sodium: 210 },
    sourceDetail: 'Starbucks — Java Chip Frappuccino Grande' },
  { restaurantPattern: /starbucks|trolley car|creature comforts/i, itemPattern: /^caramel frappuccino/i,
    exclude: /java|coffee chip|salted/i,
    nutrition: { calories: 380, carbs: 54, fat: 15, protein: 5, sugar: 52, fiber: 0, sodium: 230 },
    sourceDetail: 'Starbucks — Caramel Frappuccino Grande w/ 2% milk' },
  { restaurantPattern: /starbucks|trolley car|creature comforts/i, itemPattern: /^mocha frappuccino|^coffee frappuccino/i,
    exclude: /java|chip|caramel/i,
    nutrition: { calories: 370, carbs: 54, fat: 14, protein: 5, sugar: 51, fiber: 1, sodium: 180 },
    sourceDetail: 'Starbucks — Mocha Frappuccino Grande w/ 2% milk' },
  { restaurantPattern: /starbucks|trolley car|creature comforts/i, itemPattern: /^vanilla bean frappuccino|^vanilla bean creme/i,
    nutrition: { calories: 380, carbs: 70, fat: 9, protein: 7, sugar: 70, fiber: 0, sodium: 240 },
    sourceDetail: 'Starbucks — Vanilla Bean Crème Frappuccino Grande w/ 2% milk' },
  { restaurantPattern: /starbucks|trolley car|creature comforts/i, itemPattern: /^pike place( roast)?$/i,
    exclude: /iced|latte|frappuccino/i,
    nutrition: { calories: 5, carbs: 0, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 10 },
    sourceDetail: 'Starbucks — Pike Place Roast Grande' },
  { restaurantPattern: /starbucks|trolley car|creature comforts/i, itemPattern: /^cold brew( coffee)?$|^starbucks cold brew/i,
    exclude: /iced.*latte|nitro|sweetened|vanilla|cinnamon|caramel|cream|chocolate|salted|toasted/i,
    nutrition: { calories: 5, carbs: 0, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 10 },
    sourceDetail: 'Starbucks — Cold Brew Coffee Grande (unsweetened)' },
  { restaurantPattern: /starbucks|trolley car|creature comforts/i, itemPattern: /^iced coffee$/i,
    exclude: /sweetened|vanilla|caramel|mocha|cream|chocolate|nitro/i,
    nutrition: { calories: 5, carbs: 0, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 10 },
    sourceDetail: 'Starbucks — Iced Coffee Grande (unsweetened)' },
  { restaurantPattern: /starbucks|trolley car|creature comforts/i, itemPattern: /^iced caramel macchiato$/i,
    nutrition: { calories: 250, carbs: 34, fat: 7, protein: 10, sugar: 33, fiber: 0, sodium: 150 },
    sourceDetail: 'Starbucks — Iced Caramel Macchiato Grande w/ 2% milk' },
  { restaurantPattern: /starbucks|trolley car|creature comforts/i, itemPattern: /^iced caffè (latte|mocha)|^iced latte$|^iced mocha$/i,
    exclude: /pumpkin/i,
    nutrition: { calories: 130, carbs: 13, fat: 5, protein: 9, sugar: 12, fiber: 0, sodium: 120 },
    sourceDetail: 'Starbucks — Iced Caffè Latte Grande w/ 2% milk' },
  { restaurantPattern: /starbucks|trolley car|creature comforts/i, itemPattern: /^chocolate chip cookie$/i,
    nutrition: { calories: 360, carbs: 47, fat: 17, protein: 4, sugar: 27, fiber: 1, sodium: 270 },
    sourceDetail: 'Starbucks — Chocolate Chip Cookie' },
]

const ALL_CHAINS: ChainItem[] = [
  ...WETZELS,
  ...EARL,
  ...CHICKEN_GUY,
  ...JAMBA,
  ...BLAZE,
  ...STARBUCKS,
]

// Chain values carry confidence 90. We never want to stomp anything already at
// 90+ — that includes `upgrade-verified-nutrition.ts`'s 95-confidence output.
// Run order is therefore not load-bearing: whichever script runs first wins
// for the items it owns; the second skips them with `score>=target`. See
// docs/code-review/p2-018 for the precedence reasoning.
const TARGET_CONFIDENCE = 90

interface DBItem {
  id: string
  name: string
  category: string
  restaurant: { name: string } | { name: string }[] | null
  nutritional_data:
    | { id: string; source: string; confidence_score: number | null }[]
    | { id: string; source: string; confidence_score: number | null }
    | null
}

async function main() {
  // Fetch all items with restaurant + nutrition (paginated)
  const items: DBItem[] = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await sb.from('menu_items')
      .select('id, name, category, restaurant:restaurants(name), nutritional_data(id, source, confidence_score)')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    items.push(...(data as unknown as DBItem[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  console.log(`Scanning ${items.length} items for chain matches...`)

  let upgraded = 0
  let alreadyHigherConfidence = 0
  let errors = 0
  const byTemplate = new Map<string, number>()

  for (const item of items) {
    const restName = Array.isArray(item.restaurant) ? item.restaurant[0]?.name : item.restaurant?.name
    if (!restName) continue
    const n = Array.isArray(item.nutritional_data) ? item.nutritional_data[0] : item.nutritional_data
    if (!n) continue

    const match = ALL_CHAINS.find(t => {
      if (!t.restaurantPattern.test(restName)) return false
      if (!t.itemPattern.test(item.name)) return false
      if (t.exclude && t.exclude.test(item.name)) return false
      return true
    })
    if (!match) continue
    // Precedence guard: never overwrite a row that already carries equal or
    // higher confidence (e.g., a verified=95 row should not be stomped by
    // chain=90 just because the chain script runs second).
    if ((n.confidence_score ?? 0) >= TARGET_CONFIDENCE) { alreadyHigherConfidence++; continue }

    // Sanity guard on the values we're about to claim are "official".
    try {
      assertSaneNutrition(match.nutrition, `${item.name} @ ${restName}`)
    } catch (e) {
      errors++
      console.error(`  REJECT ${(e as Error).message}`)
      continue
    }

    const { error } = await sb.from('nutritional_data').update({
      calories: match.nutrition.calories,
      carbs: match.nutrition.carbs,
      fat: match.nutrition.fat,
      protein: match.nutrition.protein,
      sugar: match.nutrition.sugar,
      fiber: match.nutrition.fiber,
      sodium: match.nutrition.sodium,
      source: 'official',
      source_detail: match.sourceDetail,
      confidence_score: TARGET_CONFIDENCE,
    }).eq('id', n.id)

    if (error) { errors++; console.error(`  FAIL ${item.name} @ ${restName}: ${error.message}`); continue }
    upgraded++
    byTemplate.set(match.sourceDetail, (byTemplate.get(match.sourceDetail) ?? 0) + 1)
  }

  console.log(`\n=== Results ===`)
  console.log(`Upgraded to source=official, confidence=${TARGET_CONFIDENCE}: ${upgraded}`)
  console.log(`Skipped (current confidence >= ${TARGET_CONFIDENCE}): ${alreadyHigherConfidence}`)
  console.log(`Errors: ${errors}`)
  console.log(`\nBy template:`)
  for (const [k, v] of [...byTemplate.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(3)}  ${k}`)
  }
}

main().catch(err => {
  console.error('upgrade-chain-nutrition failed:', err)
  process.exit(1)
})
