/**
 * Estimate nutrition for common items based on name keywords.
 * Fallback for items without descriptions that can't use AI estimation.
 *
 * Uses USDA standard portions with theme park multipliers applied.
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

// Nutrition templates for common items (already scaled for theme park portions)
interface NutritionTemplate {
  calories: number
  carbs: number
  fat: number
  protein: number
  sugar: number
  fiber: number
  sodium: number
}

const TEMPLATES: Record<string, NutritionTemplate> = {
  // Snacks
  chips: { calories: 300, carbs: 30, fat: 18, protein: 4, sugar: 1, fiber: 3, sodium: 450 },
  popcorn: { calories: 450, carbs: 55, fat: 25, protein: 5, sugar: 2, fiber: 8, sodium: 800 },
  pretzel: { calories: 480, carbs: 95, fat: 5, protein: 12, sugar: 5, fiber: 3, sodium: 1200 },
  'mickey pretzel': { calories: 480, carbs: 95, fat: 5, protein: 12, sugar: 5, fiber: 3, sodium: 1200 },
  'turkey leg': { calories: 1100, carbs: 0, fat: 55, protein: 140, sugar: 0, fiber: 0, sodium: 2200 },
  nachos: { calories: 850, carbs: 75, fat: 50, protein: 20, sugar: 3, fiber: 6, sodium: 1500 },

  // Sides
  'french fries': { calories: 500, carbs: 65, fat: 25, protein: 6, sugar: 1, fiber: 5, sodium: 400 },
  fries: { calories: 500, carbs: 65, fat: 25, protein: 6, sugar: 1, fiber: 5, sodium: 400 },
  rice: { calories: 250, carbs: 55, fat: 1, protein: 5, sugar: 0, fiber: 1, sodium: 200 },
  'green beans': { calories: 45, carbs: 10, fat: 0, protein: 2, sugar: 4, fiber: 4, sodium: 150 },
  corn: { calories: 150, carbs: 35, fat: 2, protein: 5, sugar: 5, fiber: 3, sodium: 300 },
  'corn on the cob': { calories: 180, carbs: 40, fat: 3, protein: 5, sugar: 6, fiber: 4, sodium: 350 },
  coleslaw: { calories: 200, carbs: 15, fat: 15, protein: 2, sugar: 10, fiber: 2, sodium: 300 },

  // Desserts
  'ice cream': { calories: 350, carbs: 40, fat: 18, protein: 5, sugar: 35, fiber: 0, sodium: 120 },
  'soft serve': { calories: 280, carbs: 45, fat: 8, protein: 6, sugar: 35, fiber: 0, sodium: 150 },
  cookie: { calories: 250, carbs: 35, fat: 12, protein: 3, sugar: 20, fiber: 1, sodium: 200 },
  brownie: { calories: 400, carbs: 55, fat: 18, protein: 5, sugar: 40, fiber: 2, sodium: 180 },
  'chocolate chip cookie': { calories: 280, carbs: 38, fat: 14, protein: 3, sugar: 22, fiber: 1, sodium: 220 },
  cupcake: { calories: 450, carbs: 60, fat: 22, protein: 4, sugar: 45, fiber: 1, sodium: 250 },
  churro: { calories: 280, carbs: 45, fat: 10, protein: 4, sugar: 15, fiber: 1, sodium: 200 },

  // Beverages
  lemonade: { calories: 200, carbs: 52, fat: 0, protein: 0, sugar: 50, fiber: 0, sodium: 10 },
  'apple juice': { calories: 120, carbs: 30, fat: 0, protein: 0, sugar: 28, fiber: 0, sodium: 10 },
  milk: { calories: 150, carbs: 12, fat: 8, protein: 8, sugar: 12, fiber: 0, sodium: 110 },
  'lowfat milk': { calories: 100, carbs: 12, fat: 2, protein: 8, sugar: 12, fiber: 0, sodium: 110 },
  'chocolate milk': { calories: 220, carbs: 35, fat: 5, protein: 8, sugar: 30, fiber: 1, sodium: 150 },
  milkshake: { calories: 700, carbs: 95, fat: 28, protein: 12, sugar: 85, fiber: 1, sodium: 350 },
  smoothie: { calories: 350, carbs: 70, fat: 4, protein: 6, sugar: 55, fiber: 4, sodium: 100 },
  'coke float': { calories: 450, carbs: 75, fat: 12, protein: 4, sugar: 70, fiber: 0, sodium: 120 },
  'root beer float': { calories: 450, carbs: 75, fat: 12, protein: 4, sugar: 70, fiber: 0, sodium: 120 },

  // Alcohol
  beer: { calories: 180, carbs: 15, fat: 0, protein: 2, sugar: 1, fiber: 0, sodium: 20 },
  'draft beer': { calories: 200, carbs: 17, fat: 0, protein: 2, sugar: 1, fiber: 0, sodium: 20 },
  'beer flight': { calories: 300, carbs: 25, fat: 0, protein: 3, sugar: 2, fiber: 0, sodium: 30 },
  wine: { calories: 150, carbs: 5, fat: 0, protein: 0, sugar: 1, fiber: 0, sodium: 10 },
  cocktail: { calories: 250, carbs: 25, fat: 0, protein: 0, sugar: 20, fiber: 0, sodium: 20 },
  margarita: { calories: 300, carbs: 30, fat: 0, protein: 0, sugar: 25, fiber: 0, sodium: 500 },

  // Entrees - generic fallbacks
  burger: { calories: 850, carbs: 45, fat: 50, protein: 40, sugar: 8, fiber: 3, sodium: 1200 },
  sandwich: { calories: 650, carbs: 50, fat: 30, protein: 30, sugar: 6, fiber: 3, sodium: 1000 },
  pizza: { calories: 350, carbs: 40, fat: 15, protein: 15, sugar: 5, fiber: 2, sodium: 700 },
  'chicken strips': { calories: 650, carbs: 40, fat: 35, protein: 35, sugar: 2, fiber: 2, sodium: 1200 },
  'fish and chips': { calories: 900, carbs: 75, fat: 50, protein: 35, sugar: 3, fiber: 5, sodium: 1400 },
  'grilled chicken': { calories: 350, carbs: 5, fat: 12, protein: 50, sugar: 1, fiber: 0, sodium: 800 },
  'fruit salad': { calories: 150, carbs: 35, fat: 1, protein: 2, sugar: 30, fiber: 4, sodium: 20 },
  hummus: { calories: 200, carbs: 20, fat: 12, protein: 6, sugar: 2, fiber: 4, sodium: 400 },
  pita: { calories: 300, carbs: 55, fat: 3, protein: 10, sugar: 2, fiber: 3, sodium: 500 },
  udon: { calories: 450, carbs: 85, fat: 3, protein: 15, sugar: 3, fiber: 3, sodium: 1200 },
  ramen: { calories: 500, carbs: 70, fat: 15, protein: 20, sugar: 3, fiber: 3, sodium: 1800 },

  // More alcohol
  tequila: { calories: 100, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0 },
  mezcal: { calories: 100, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0 },
  'hard cider': { calories: 200, carbs: 22, fat: 0, protein: 0, sugar: 18, fiber: 0, sodium: 10 },
  'cold brew': { calories: 10, carbs: 2, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 5 },
  'nitro cold brew': { calories: 10, carbs: 2, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 5 },
  'fountain beverage': { calories: 200, carbs: 55, fat: 0, protein: 0, sugar: 54, fiber: 0, sodium: 50 },
  'fountain drink': { calories: 200, carbs: 55, fat: 0, protein: 0, sugar: 54, fiber: 0, sodium: 50 },

  // German/European
  'spätzle': { calories: 350, carbs: 50, fat: 12, protein: 10, sugar: 2, fiber: 2, sodium: 400 },
  spaetzle: { calories: 350, carbs: 50, fat: 12, protein: 10, sugar: 2, fiber: 2, sodium: 400 },
  bratwurst: { calories: 400, carbs: 5, fat: 30, protein: 18, sugar: 1, fiber: 0, sodium: 900 },
  schnitzel: { calories: 600, carbs: 30, fat: 35, protein: 40, sugar: 2, fiber: 2, sodium: 800 },

  // More desserts
  'pastry': { calories: 350, carbs: 45, fat: 18, protein: 5, sugar: 25, fiber: 1, sodium: 300 },
  'bread pudding': { calories: 500, carbs: 65, fat: 22, protein: 8, sugar: 40, fiber: 2, sodium: 400 },

  // Sauces/dips (small portions)
  'cheese sauce': { calories: 100, carbs: 5, fat: 8, protein: 3, sugar: 1, fiber: 0, sodium: 350 },
  salsa: { calories: 30, carbs: 6, fat: 0, protein: 1, sugar: 3, fiber: 1, sodium: 300 },
  guacamole: { calories: 120, carbs: 8, fat: 10, protein: 1, sugar: 1, fiber: 4, sodium: 200 },

  // Breakfast items
  'scrambled eggs': { calories: 200, carbs: 2, fat: 15, protein: 14, sugar: 1, fiber: 0, sodium: 300 },
  bacon: { calories: 180, carbs: 0, fat: 15, protein: 12, sugar: 0, fiber: 0, sodium: 600 },
  sausage: { calories: 250, carbs: 2, fat: 22, protein: 12, sugar: 1, fiber: 0, sodium: 700 },
  waffle: { calories: 350, carbs: 50, fat: 14, protein: 8, sugar: 12, fiber: 2, sodium: 500 },
  pancake: { calories: 300, carbs: 45, fat: 10, protein: 7, sugar: 10, fiber: 2, sodium: 450 },
  'cinnamon roll': { calories: 500, carbs: 70, fat: 22, protein: 6, sugar: 35, fiber: 2, sodium: 500 },
  'french toast': { calories: 450, carbs: 55, fat: 20, protein: 12, sugar: 20, fiber: 2, sodium: 600 },
  oatmeal: { calories: 200, carbs: 40, fat: 4, protein: 6, sugar: 8, fiber: 5, sodium: 150 },

  // More desserts
  donut: { calories: 300, carbs: 40, fat: 15, protein: 4, sugar: 20, fiber: 1, sodium: 350 },
  muffin: { calories: 400, carbs: 55, fat: 18, protein: 5, sugar: 30, fiber: 2, sodium: 400 },
  'apple fritter': { calories: 450, carbs: 60, fat: 22, protein: 5, sugar: 30, fiber: 2, sodium: 400 },
  cake: { calories: 400, carbs: 55, fat: 18, protein: 4, sugar: 40, fiber: 1, sodium: 300 },
  pie: { calories: 350, carbs: 50, fat: 16, protein: 3, sugar: 25, fiber: 2, sodium: 300 },
  sundae: { calories: 600, carbs: 80, fat: 25, protein: 8, sugar: 65, fiber: 2, sodium: 200 },

  // More beverages
  'hot chocolate': { calories: 350, carbs: 50, fat: 12, protein: 10, sugar: 40, fiber: 2, sodium: 200 },
  'frozen drink': { calories: 350, carbs: 70, fat: 5, protein: 2, sugar: 60, fiber: 0, sodium: 50 },
  powerade: { calories: 80, carbs: 21, fat: 0, protein: 0, sugar: 21, fiber: 0, sodium: 150 },
  gatorade: { calories: 80, carbs: 21, fat: 0, protein: 0, sugar: 21, fiber: 0, sodium: 150 },
  'cafe latte': { calories: 200, carbs: 18, fat: 8, protein: 10, sugar: 15, fiber: 0, sodium: 150 },
  'chai latte': { calories: 250, carbs: 40, fat: 5, protein: 8, sugar: 35, fiber: 0, sodium: 150 },
  'iced latte': { calories: 180, carbs: 16, fat: 7, protein: 9, sugar: 14, fiber: 0, sodium: 130 },
  soda: { calories: 200, carbs: 55, fat: 0, protein: 0, sugar: 54, fiber: 0, sodium: 50 },
  'coca-cola': { calories: 200, carbs: 55, fat: 0, protein: 0, sugar: 54, fiber: 0, sodium: 50 },
  sprite: { calories: 200, carbs: 55, fat: 0, protein: 0, sugar: 54, fiber: 0, sodium: 50 },
  'diet coke': { calories: 0, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 40 },
  'diet soda': { calories: 0, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 40 },

  // More European specialties
  'kronenbourg': { calories: 180, carbs: 15, fat: 0, protein: 2, sugar: 1, fiber: 0, sodium: 20 },
  lager: { calories: 180, carbs: 15, fat: 0, protein: 2, sugar: 1, fiber: 0, sodium: 20 },
  ipa: { calories: 200, carbs: 15, fat: 0, protein: 2, sugar: 1, fiber: 0, sodium: 20 },

  // Sides continued
  'potato casserole': { calories: 350, carbs: 40, fat: 18, protein: 8, sugar: 3, fiber: 3, sodium: 600 },
  potatoes: { calories: 250, carbs: 55, fat: 4, protein: 5, sugar: 2, fiber: 4, sodium: 200 },
  mashed: { calories: 250, carbs: 35, fat: 10, protein: 4, sugar: 2, fiber: 3, sodium: 400 },
  bread: { calories: 200, carbs: 35, fat: 4, protein: 6, sugar: 3, fiber: 2, sodium: 350 },

  // More bakery items
  croissant: { calories: 350, carbs: 40, fat: 18, protein: 7, sugar: 6, fiber: 2, sodium: 400 },
  'cheese danish': { calories: 400, carbs: 50, fat: 20, protein: 6, sugar: 20, fiber: 1, sodium: 350 },
  danish: { calories: 350, carbs: 45, fat: 18, protein: 5, sugar: 18, fiber: 1, sodium: 300 },
  blondie: { calories: 350, carbs: 50, fat: 15, protein: 4, sugar: 30, fiber: 1, sodium: 200 },
  loaf: { calories: 400, carbs: 55, fat: 18, protein: 5, sugar: 25, fiber: 2, sodium: 350 },
  scone: { calories: 400, carbs: 50, fat: 20, protein: 6, sugar: 15, fiber: 2, sodium: 400 },
  'cinnamon twist': { calories: 280, carbs: 40, fat: 12, protein: 4, sugar: 15, fiber: 1, sodium: 300 },

  // More coffee drinks
  mocha: { calories: 350, carbs: 45, fat: 14, protein: 10, sugar: 35, fiber: 2, sodium: 180 },
  macchiato: { calories: 250, carbs: 35, fat: 8, protein: 8, sugar: 30, fiber: 0, sodium: 150 },
  'caramel macchiato': { calories: 300, carbs: 42, fat: 9, protein: 9, sugar: 38, fiber: 0, sodium: 160 },
  'pink drink': { calories: 200, carbs: 35, fat: 4, protein: 2, sugar: 30, fiber: 0, sodium: 75 },
  frappuccino: { calories: 400, carbs: 60, fat: 15, protein: 6, sugar: 55, fiber: 0, sodium: 200 },

  // More entrees
  cheeseburger: { calories: 900, carbs: 45, fat: 55, protein: 45, sugar: 8, fiber: 3, sodium: 1400 },
  hotdog: { calories: 400, carbs: 35, fat: 25, protein: 12, sugar: 5, fiber: 2, sodium: 1000 },
  'hot dog': { calories: 400, carbs: 35, fat: 25, protein: 12, sugar: 5, fiber: 2, sodium: 1000 },
  tacos: { calories: 450, carbs: 40, fat: 25, protein: 20, sugar: 4, fiber: 4, sodium: 800 },
  burrito: { calories: 700, carbs: 70, fat: 30, protein: 25, sugar: 5, fiber: 8, sodium: 1200 },
  quesadilla: { calories: 550, carbs: 45, fat: 30, protein: 25, sugar: 3, fiber: 3, sodium: 1000 },
  salad: { calories: 300, carbs: 20, fat: 18, protein: 12, sugar: 5, fiber: 5, sodium: 500 },
  soup: { calories: 200, carbs: 25, fat: 8, protein: 8, sugar: 5, fiber: 3, sodium: 800 },
  wings: { calories: 600, carbs: 10, fat: 40, protein: 45, sugar: 2, fiber: 0, sodium: 1500 },

  // More alcohol/tropical drinks
  daiquiri: { calories: 300, carbs: 35, fat: 0, protein: 0, sugar: 30, fiber: 0, sodium: 10 },
  'pina colada': { calories: 500, carbs: 60, fat: 15, protein: 2, sugar: 55, fiber: 1, sodium: 50 },
  sangria: { calories: 200, carbs: 25, fat: 0, protein: 0, sugar: 20, fiber: 0, sodium: 10 },
  port: { calories: 180, carbs: 20, fat: 0, protein: 0, sugar: 18, fiber: 0, sodium: 5 },

  // Misc
  mandarin: { calories: 50, carbs: 12, fat: 0, protein: 1, sugar: 10, fiber: 2, sodium: 0 },
  'mixed fruit': { calories: 100, carbs: 25, fat: 0, protein: 1, sugar: 20, fiber: 3, sodium: 10 },
  'hot cocoa': { calories: 350, carbs: 50, fat: 12, protein: 10, sugar: 40, fiber: 2, sodium: 200 },

  // More beverages
  'orange juice': { calories: 120, carbs: 28, fat: 0, protein: 2, sugar: 22, fiber: 0, sodium: 5 },
  'cranberry juice': { calories: 140, carbs: 35, fat: 0, protein: 0, sugar: 30, fiber: 0, sodium: 10 },
  'pog juice': { calories: 150, carbs: 38, fat: 0, protein: 1, sugar: 35, fiber: 0, sodium: 10 },
  'boba': { calories: 350, carbs: 60, fat: 5, protein: 3, sugar: 45, fiber: 0, sodium: 50 },

  // More sides
  'onion rings': { calories: 450, carbs: 55, fat: 25, protein: 6, sugar: 5, fiber: 3, sodium: 800 },
  'mac and cheese': { calories: 450, carbs: 45, fat: 22, protein: 18, sugar: 5, fiber: 2, sodium: 900 },
  tots: { calories: 350, carbs: 40, fat: 20, protein: 4, sugar: 1, fiber: 3, sodium: 600 },
  'fried rice': { calories: 400, carbs: 55, fat: 15, protein: 12, sugar: 3, fiber: 2, sodium: 800 },
  'rice bowl': { calories: 550, carbs: 65, fat: 18, protein: 25, sugar: 5, fiber: 3, sodium: 900 },
  broccoli: { calories: 55, carbs: 10, fat: 1, protein: 4, sugar: 2, fiber: 4, sodium: 50 },
  vegetables: { calories: 80, carbs: 15, fat: 2, protein: 4, sugar: 5, fiber: 5, sodium: 100 },

  // More snacks
  'corn dog': { calories: 350, carbs: 35, fat: 18, protein: 10, sugar: 8, fiber: 2, sodium: 700 },
  'loaded pretzel': { calories: 650, carbs: 75, fat: 30, protein: 18, sugar: 8, fiber: 4, sodium: 1500 },
  dip: { calories: 150, carbs: 10, fat: 12, protein: 3, sugar: 2, fiber: 1, sodium: 400 },
  'queso dip': { calories: 180, carbs: 8, fat: 14, protein: 6, sugar: 2, fiber: 0, sodium: 500 },
  'candy': { calories: 200, carbs: 45, fat: 5, protein: 1, sugar: 40, fiber: 0, sodium: 50 },
  'granola bar': { calories: 150, carbs: 25, fat: 6, protein: 3, sugar: 12, fiber: 2, sodium: 100 },

  // More desserts
  pudding: { calories: 200, carbs: 35, fat: 5, protein: 4, sugar: 25, fiber: 0, sodium: 200 },
  'crumb cake': { calories: 400, carbs: 55, fat: 18, protein: 4, sugar: 30, fiber: 1, sodium: 300 },
  parfait: { calories: 350, carbs: 50, fat: 12, protein: 8, sugar: 35, fiber: 3, sodium: 150 },
  macaron: { calories: 150, carbs: 20, fat: 7, protein: 2, sugar: 18, fiber: 0, sodium: 20 },

  // Entrees
  shrimp: { calories: 250, carbs: 5, fat: 12, protein: 30, sugar: 1, fiber: 0, sodium: 600 },
  'curry': { calories: 500, carbs: 50, fat: 20, protein: 25, sugar: 8, fiber: 4, sodium: 1000 },

  // Generic alcohol
  'draft': { calories: 180, carbs: 15, fat: 0, protein: 2, sugar: 1, fiber: 0, sodium: 20 },
  'heineken': { calories: 150, carbs: 12, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 15 },
}

// Patterns to match (order matters - more specific first)
const PATTERNS: [RegExp, string][] = [
  [/mickey pretzel/i, 'mickey pretzel'],
  [/turkey leg/i, 'turkey leg'],
  [/corn on the cob/i, 'corn on the cob'],
  [/chocolate chip cookie/i, 'chocolate chip cookie'],
  [/fish and chips/i, 'fish and chips'],
  [/chicken (strips?|tenders?)/i, 'chicken strips'],
  [/root beer float/i, 'root beer float'],
  [/coke float|coca.?cola float/i, 'coke float'],
  [/milkshake|milk shake/i, 'milkshake'],
  [/soft.?serve/i, 'soft serve'],
  [/lowfat milk|low.?fat milk|skim milk/i, 'lowfat milk'],
  [/chocolate milk/i, 'chocolate milk'],
  [/apple juice/i, 'apple juice'],
  [/draft beer/i, 'draft beer'],
  [/beer flight/i, 'beer flight'],
  [/^french fries$/i, 'french fries'],
  [/\bfries\b/i, 'fries'],
  [/green beans?/i, 'green beans'],
  [/\brice\b/i, 'rice'],
  [/\bcorn\b/i, 'corn'],
  [/coleslaw/i, 'coleslaw'],
  [/\bpretzel\b/i, 'pretzel'],
  [/popcorn/i, 'popcorn'],
  [/nachos/i, 'nachos'],
  [/\bchips\b/i, 'chips'],
  [/ice cream|gelato/i, 'ice cream'],
  [/brownie/i, 'brownie'],
  [/\bcookie\b/i, 'cookie'],
  [/cupcake/i, 'cupcake'],
  [/churro/i, 'churro'],
  [/lemonade/i, 'lemonade'],
  [/\bmilk\b/i, 'milk'],
  [/smoothie/i, 'smoothie'],
  [/cocktail/i, 'cocktail'],
  [/margarita/i, 'margarita'],
  [/\bwine\b/i, 'wine'],
  [/\bbeer\b/i, 'beer'],
  [/\bburger\b/i, 'burger'],
  [/sandwich/i, 'sandwich'],
  [/pizza/i, 'pizza'],
  [/grilled chicken/i, 'grilled chicken'],
  [/fruit salad/i, 'fruit salad'],
  [/fresh fruit/i, 'fruit salad'],
  [/hummus/i, 'hummus'],
  [/\bpita\b/i, 'pita'],
  [/\budon\b/i, 'udon'],
  [/\bramen\b/i, 'ramen'],
  [/tequila|mezcal|bacanora/i, 'tequila'],
  [/hard cider/i, 'hard cider'],
  [/nitro cold brew/i, 'nitro cold brew'],
  [/cold brew/i, 'cold brew'],
  [/fountain (beverage|drink)/i, 'fountain beverage'],
  [/spätzle|spaetzle/i, 'spätzle'],
  [/bratwurst/i, 'bratwurst'],
  [/schnitzel/i, 'schnitzel'],
  [/pastry|pastries/i, 'pastry'],
  [/bread pudding/i, 'bread pudding'],
  [/cheese sauce/i, 'cheese sauce'],
  [/\bsalsa\b/i, 'salsa'],
  [/guacamole/i, 'guacamole'],
  // Breakfast
  [/scrambled eggs?/i, 'scrambled eggs'],
  [/\bbacon\b/i, 'bacon'],
  [/\bsausage\b/i, 'sausage'],
  [/waffle/i, 'waffle'],
  [/pancake/i, 'pancake'],
  [/cinnamon roll/i, 'cinnamon roll'],
  [/french toast/i, 'french toast'],
  [/oatmeal/i, 'oatmeal'],
  // More desserts
  [/donut|doughnut/i, 'donut'],
  [/muffin/i, 'muffin'],
  [/apple fritter/i, 'apple fritter'],
  [/\bcake\b/i, 'cake'],
  [/\bpie\b/i, 'pie'],
  [/sundae/i, 'sundae'],
  // More beverages
  [/hot chocolate/i, 'hot chocolate'],
  [/frozen drink/i, 'frozen drink'],
  [/powerade/i, 'powerade'],
  [/gatorade/i, 'gatorade'],
  [/cafe latte|caffe latte/i, 'cafe latte'],
  [/chai latte/i, 'chai latte'],
  [/iced latte/i, 'iced latte'],
  [/diet coke|diet coca/i, 'diet coke'],
  [/diet soda|diet pepsi/i, 'diet soda'],
  [/coca.?cola|coke\b/i, 'coca-cola'],
  [/\bsprite\b/i, 'sprite'],
  [/\bsoda\b/i, 'soda'],
  // European
  [/kronenbourg/i, 'kronenbourg'],
  [/\blager\b/i, 'lager'],
  [/\bipa\b/i, 'ipa'],
  // Sides
  [/potato casserole/i, 'potato casserole'],
  [/mashed potato/i, 'mashed'],
  [/potatoes?/i, 'potatoes'],
  [/\bbread\b/i, 'bread'],
  // More bakery
  [/croissant/i, 'croissant'],
  [/cheese danish/i, 'cheese danish'],
  [/\bdanish\b/i, 'danish'],
  [/blondie/i, 'blondie'],
  [/\bloaf\b/i, 'loaf'],
  [/scone/i, 'scone'],
  [/cinnamon twist/i, 'cinnamon twist'],
  // More coffee
  [/caramel macchiato/i, 'caramel macchiato'],
  [/macchiato/i, 'macchiato'],
  [/mocha/i, 'mocha'],
  [/pink drink/i, 'pink drink'],
  [/frappuccino|frap/i, 'frappuccino'],
  // More entrees
  [/cheeseburger/i, 'cheeseburger'],
  [/hot ?dog/i, 'hot dog'],
  [/\btaco/i, 'tacos'],
  [/burrito/i, 'burrito'],
  [/quesadilla/i, 'quesadilla'],
  [/\bsalad\b/i, 'salad'],
  [/\bsoup\b/i, 'soup'],
  [/\bwings?\b/i, 'wings'],
  // More drinks
  [/daiquiri/i, 'daiquiri'],
  [/pina colada/i, 'pina colada'],
  [/sangria/i, 'sangria'],
  [/\bport\b/i, 'port'],
  // Misc
  [/mandarin|cuties/i, 'mandarin'],
  [/mixed fruit/i, 'mixed fruit'],
  [/hot cocoa/i, 'hot cocoa'],
  // More beverages
  [/orange juice/i, 'orange juice'],
  [/cranberry juice/i, 'cranberry juice'],
  [/pog juice|passion.*guava/i, 'pog juice'],
  [/boba/i, 'boba'],
  // More sides
  [/onion rings?/i, 'onion rings'],
  [/mac(aroni)?.*cheese|mac.?n.?cheese/i, 'mac and cheese'],
  [/potato tots?|tater tots?/i, 'tots'],
  [/fried rice/i, 'fried rice'],
  [/rice bowl/i, 'rice bowl'],
  [/broccoli/i, 'broccoli'],
  [/vegetables?|veggies/i, 'vegetables'],
  // More snacks
  [/corn ?dog/i, 'corn dog'],
  [/loaded pretzel/i, 'loaded pretzel'],
  [/queso/i, 'queso dip'],
  [/\bdip\b/i, 'dip'],
  [/candy/i, 'candy'],
  [/granola bar/i, 'granola bar'],
  // More desserts
  [/pudding/i, 'pudding'],
  [/crumb cake/i, 'crumb cake'],
  [/parfait/i, 'parfait'],
  [/macaron/i, 'macaron'],
  // Entrees
  [/\bshrimp\b/i, 'shrimp'],
  [/curry/i, 'curry'],
  // Generic alcohol
  [/seasonal draft|draft$/i, 'draft'],
  [/heineken/i, 'heineken'],
]

function matchTemplate(name: string): NutritionTemplate | null {
  const n = name.toLowerCase()
  for (const [pattern, key] of PATTERNS) {
    if (pattern.test(n)) {
      return TEMPLATES[key] || null
    }
  }
  return null
}

async function main() {
  console.log('Fetching items with null calories and no description...')

  // Fetch items with null calories
  let allItems: any[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase.from('nutritional_data')
      .select('id, menu_item_id, calories, menu_item:menu_items(name, category, description)')
      .is('calories', null)
      .range(offset, offset + 999)

    if (error) {
      console.error('Error:', error)
      break
    }
    if (!data?.length) break
    allItems = allItems.concat(data)
    if (data.length < 1000) break
    offset += 1000
  }

  console.log(`Found ${allItems.length} items with null calories`)

  // Filter to items without descriptions (items with descriptions should use AI)
  const noDesc = allItems.filter(item => {
    const mi = Array.isArray(item.menu_item) ? item.menu_item[0] : item.menu_item
    return !mi?.description || mi.description.trim().length === 0
  })

  console.log(`Items without descriptions: ${noDesc.length}`)

  // Match patterns
  let matched = 0
  let updated = 0
  const unmatched: string[] = []

  for (const item of noDesc) {
    const mi = Array.isArray(item.menu_item) ? item.menu_item[0] : item.menu_item
    const name = mi?.name || ''

    const template = matchTemplate(name)
    if (template) {
      matched++

      const { error } = await supabase
        .from('nutritional_data')
        .update({
          ...template,
          source: 'crowdsourced',
          confidence_score: 30, // Lower than AI estimates (35)
        })
        .eq('id', item.id)

      if (error) {
        console.error(`Failed to update ${name}:`, error)
      } else {
        updated++
      }
    } else {
      // Skip zero-cal items (water, coffee, tea)
      const skip = ['water', 'coffee', 'tea', 'espresso', 'americano', 'cappuccino', 'spirits']
      if (!skip.some(s => name.toLowerCase().includes(s))) {
        unmatched.push(name)
      }
    }
  }

  console.log('')
  console.log('=== Keyword Estimation Complete ===')
  console.log(`Matched patterns: ${matched}`)
  console.log(`Updated in DB: ${updated}`)
  console.log(`Unmatched (non-beverage): ${unmatched.length}`)

  if (unmatched.length > 0 && unmatched.length <= 50) {
    console.log('')
    console.log('Unmatched items (need manual entry or AI):')
    unmatched.forEach(n => console.log(`  - ${n}`))
  } else if (unmatched.length > 50) {
    console.log('')
    console.log('Sample unmatched items:')
    unmatched.slice(0, 30).forEach(n => console.log(`  - ${n}`))
    console.log(`  ... and ${unmatched.length - 30} more`)
  }
}

main()
