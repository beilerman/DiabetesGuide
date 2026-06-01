/**
 * Extended keyword-based nutrition estimation for remaining items
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const envVars: Record<string, string> = {}
envContent.split('\n').forEach(line => {
  const trimmed = line.trim()
  if (trimmed && !trimmed.startsWith('#')) {
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) envVars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
  }
})

const supabase = createClient(envVars['SUPABASE_URL']!, envVars['SUPABASE_SERVICE_ROLE_KEY']!)

// Nutrition templates
const TEMPLATES: Record<string, { calories: number; carbs: number; fat: number; protein: number; sugar: number; fiber: number; sodium: number }> = {
  // Zero calorie
  zero: { calories: 0, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0 },

  // Beverages
  brewed_coffee: { calories: 5, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 5 },
  brewed_tea: { calories: 2, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0 },
  sweet_tea: { calories: 90, carbs: 23, fat: 0, protein: 0, sugar: 22, fiber: 0, sodium: 10 },
  iced_coffee: { calories: 80, carbs: 15, fat: 2, protein: 1, sugar: 14, fiber: 0, sodium: 15 },
  cold_brew: { calories: 5, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 5 },
  flavored_cold_brew: { calories: 120, carbs: 20, fat: 3, protein: 2, sugar: 18, fiber: 0, sodium: 30 },
  espresso_drink: { calories: 150, carbs: 18, fat: 6, protein: 8, sugar: 15, fiber: 0, sodium: 100 },
  juice: { calories: 120, carbs: 29, fat: 0, protein: 1, sugar: 26, fiber: 0, sodium: 10 },
  juice_box: { calories: 60, carbs: 15, fat: 0, protein: 0, sugar: 14, fiber: 0, sodium: 5 },
  flavored_milk: { calories: 190, carbs: 28, fat: 5, protein: 8, sugar: 26, fiber: 0, sodium: 150 },
  coconut_water: { calories: 45, carbs: 9, fat: 0, protein: 0, sugar: 6, fiber: 0, sodium: 250 },
  vitamin_water: { calories: 50, carbs: 13, fat: 0, protein: 0, sugar: 12, fiber: 0, sodium: 0 },
  refresher: { calories: 90, carbs: 20, fat: 0, protein: 0, sugar: 18, fiber: 0, sodium: 15 },
  boba_tea: { calories: 350, carbs: 65, fat: 5, protein: 3, sugar: 50, fiber: 0, sodium: 40 },
  agua_fresca: { calories: 80, carbs: 20, fat: 0, protein: 0, sugar: 18, fiber: 0, sodium: 10 },
  frozen_drink: { calories: 250, carbs: 55, fat: 0, protein: 0, sugar: 50, fiber: 0, sodium: 20 },
  slushie: { calories: 200, carbs: 50, fat: 0, protein: 0, sugar: 48, fiber: 0, sodium: 15 },
  fruit_punch: { calories: 110, carbs: 28, fat: 0, protein: 0, sugar: 26, fiber: 0, sodium: 30 },

  // Alcohol
  beer: { calories: 150, carbs: 13, fat: 0, protein: 2, sugar: 0, fiber: 0, sodium: 14 },
  craft_beer: { calories: 200, carbs: 18, fat: 0, protein: 2, sugar: 2, fiber: 0, sodium: 20 },
  cider: { calories: 180, carbs: 22, fat: 0, protein: 0, sugar: 18, fiber: 0, sodium: 10 },
  wine_glass: { calories: 125, carbs: 4, fat: 0, protein: 0, sugar: 1, fiber: 0, sodium: 5 },
  wine_bottle: { calories: 625, carbs: 20, fat: 0, protein: 0, sugar: 5, fiber: 0, sodium: 25 },
  sparkling_wine: { calories: 90, carbs: 3, fat: 0, protein: 0, sugar: 2, fiber: 0, sodium: 5 },
  champagne: { calories: 85, carbs: 2, fat: 0, protein: 0, sugar: 1, fiber: 0, sodium: 5 },
  sangria: { calories: 180, carbs: 22, fat: 0, protein: 0, sugar: 18, fiber: 0, sodium: 10 },
  cocktail: { calories: 200, carbs: 20, fat: 0, protein: 0, sugar: 16, fiber: 0, sodium: 15 },
  martini: { calories: 180, carbs: 4, fat: 0, protein: 0, sugar: 2, fiber: 0, sodium: 5 },
  margarita: { calories: 280, carbs: 36, fat: 0, protein: 0, sugar: 32, fiber: 0, sodium: 580 },
  mojito: { calories: 220, carbs: 24, fat: 0, protein: 0, sugar: 20, fiber: 0, sodium: 10 },
  bloody_mary: { calories: 200, carbs: 12, fat: 0, protein: 2, sugar: 8, fiber: 1, sodium: 800 },
  old_fashioned: { calories: 180, carbs: 8, fat: 0, protein: 0, sugar: 6, fiber: 0, sodium: 5 },
  whiskey: { calories: 100, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0 },
  sake: { calories: 130, carbs: 5, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 2 },
  hard_seltzer: { calories: 100, carbs: 2, fat: 0, protein: 0, sugar: 1, fiber: 0, sodium: 10 },
  liqueur: { calories: 150, carbs: 18, fat: 0, protein: 0, sugar: 16, fiber: 0, sodium: 5 },
  spritz: { calories: 130, carbs: 10, fat: 0, protein: 0, sugar: 8, fiber: 0, sodium: 10 },
  negroni: { calories: 180, carbs: 12, fat: 0, protein: 0, sugar: 10, fiber: 0, sodium: 5 },
  flight: { calories: 300, carbs: 25, fat: 0, protein: 2, sugar: 10, fiber: 0, sodium: 30 },

  // Fruits
  fruit_cup: { calories: 80, carbs: 20, fat: 0, protein: 1, sugar: 16, fiber: 2, sodium: 5 },
  fruit_whole: { calories: 95, carbs: 25, fat: 0, protein: 1, sugar: 19, fiber: 4, sodium: 2 },
  fruit_medley: { calories: 100, carbs: 25, fat: 0, protein: 1, sugar: 20, fiber: 3, sodium: 5 },
  berries: { calories: 60, carbs: 14, fat: 0, protein: 1, sugar: 10, fiber: 4, sodium: 1 },
  melon: { calories: 50, carbs: 12, fat: 0, protein: 1, sugar: 10, fiber: 1, sodium: 25 },
  pineapple: { calories: 80, carbs: 21, fat: 0, protein: 1, sugar: 16, fiber: 2, sodium: 2 },
  grapes: { calories: 100, carbs: 27, fat: 0, protein: 1, sugar: 23, fiber: 1, sodium: 3 },
  clementine: { calories: 35, carbs: 9, fat: 0, protein: 1, sugar: 7, fiber: 1, sodium: 1 },
  applesauce: { calories: 100, carbs: 27, fat: 0, protein: 0, sugar: 24, fiber: 1, sodium: 5 },
  fruit_bar: { calories: 80, carbs: 18, fat: 0, protein: 0, sugar: 14, fiber: 1, sodium: 5 },

  // Breakfast
  oatmeal: { calories: 300, carbs: 55, fat: 6, protein: 10, sugar: 12, fiber: 6, sodium: 150 },
  yogurt_parfait: { calories: 300, carbs: 50, fat: 8, protein: 12, sugar: 35, fiber: 3, sodium: 120 },
  yogurt: { calories: 150, carbs: 20, fat: 4, protein: 12, sugar: 15, fiber: 0, sodium: 80 },
  granola: { calories: 200, carbs: 30, fat: 8, protein: 5, sugar: 12, fiber: 3, sodium: 50 },
  cereal_milk: { calories: 200, carbs: 40, fat: 3, protein: 6, sugar: 15, fiber: 2, sodium: 200 },
  bagel_cream_cheese: { calories: 400, carbs: 55, fat: 15, protein: 12, sugar: 8, fiber: 2, sodium: 550 },
  avocado_toast: { calories: 350, carbs: 35, fat: 20, protein: 8, sugar: 3, fiber: 8, sodium: 400 },
  hash: { calories: 450, carbs: 30, fat: 28, protein: 22, sugar: 3, fiber: 3, sodium: 800 },
  omelet: { calories: 400, carbs: 5, fat: 28, protein: 30, sugar: 2, fiber: 1, sodium: 700 },
  eggs_two: { calories: 180, carbs: 2, fat: 12, protein: 14, sugar: 1, fiber: 0, sodium: 350 },
  hard_boiled_eggs: { calories: 140, carbs: 1, fat: 10, protein: 12, sugar: 0, fiber: 0, sodium: 250 },
  frittata: { calories: 350, carbs: 8, fat: 25, protein: 25, sugar: 3, fiber: 2, sodium: 600 },
  croissant: { calories: 280, carbs: 32, fat: 15, protein: 6, sugar: 6, fiber: 2, sodium: 320 },
  danish: { calories: 350, carbs: 45, fat: 17, protein: 5, sugar: 22, fiber: 1, sodium: 280 },
  scone: { calories: 400, carbs: 50, fat: 20, protein: 6, sugar: 18, fiber: 2, sodium: 450 },
  tart: { calories: 320, carbs: 40, fat: 16, protein: 4, sugar: 22, fiber: 2, sodium: 180 },
  biscotti: { calories: 120, carbs: 18, fat: 4, protein: 2, sugar: 8, fiber: 1, sodium: 60 },
  tots: { calories: 250, carbs: 32, fat: 12, protein: 3, sugar: 0, fiber: 3, sodium: 500 },

  // Appetizers
  oysters: { calories: 120, carbs: 6, fat: 4, protein: 12, sugar: 0, fiber: 0, sodium: 400 },
  cheese_board: { calories: 600, carbs: 20, fat: 45, protein: 25, sugar: 5, fiber: 2, sodium: 1200 },
  charcuterie: { calories: 700, carbs: 25, fat: 50, protein: 35, sugar: 8, fiber: 3, sodium: 2000 },
  edamame: { calories: 180, carbs: 14, fat: 8, protein: 16, sugar: 3, fiber: 8, sodium: 400 },
  bruschetta: { calories: 250, carbs: 30, fat: 12, protein: 6, sugar: 4, fiber: 2, sodium: 450 },
  caprese: { calories: 280, carbs: 8, fat: 22, protein: 14, sugar: 5, fiber: 1, sodium: 500 },
  empanada: { calories: 280, carbs: 25, fat: 16, protein: 10, sugar: 3, fiber: 2, sodium: 450 },
  deviled_eggs: { calories: 180, carbs: 2, fat: 14, protein: 10, sugar: 1, fiber: 0, sodium: 350 },
  olives: { calories: 100, carbs: 4, fat: 10, protein: 1, sugar: 0, fiber: 2, sodium: 600 },
  hummus: { calories: 200, carbs: 20, fat: 10, protein: 6, sugar: 2, fiber: 4, sodium: 400 },
  calamari: { calories: 350, carbs: 25, fat: 18, protein: 20, sugar: 2, fiber: 1, sodium: 800 },
  crab_claws: { calories: 200, carbs: 2, fat: 4, protein: 38, sugar: 0, fiber: 0, sodium: 600 },
  meatballs: { calories: 300, carbs: 12, fat: 18, protein: 22, sugar: 5, fiber: 1, sodium: 700 },
  wings: { calories: 500, carbs: 5, fat: 35, protein: 40, sugar: 2, fiber: 0, sodium: 1200 },
  potstickers: { calories: 280, carbs: 30, fat: 12, protein: 12, sugar: 3, fiber: 2, sodium: 600 },
  spring_rolls: { calories: 200, carbs: 25, fat: 8, protein: 6, sugar: 3, fiber: 2, sodium: 450 },
  brussels_sprouts: { calories: 180, carbs: 15, fat: 12, protein: 5, sugar: 4, fiber: 4, sodium: 350 },
  fried_cheese: { calories: 350, carbs: 20, fat: 24, protein: 15, sugar: 2, fiber: 1, sodium: 700 },
  bao_bun: { calories: 280, carbs: 35, fat: 10, protein: 12, sugar: 6, fiber: 1, sodium: 500 },

  // Asian
  ramen: { calories: 600, carbs: 70, fat: 22, protein: 25, sugar: 5, fiber: 4, sodium: 1800 },
  lo_mein: { calories: 550, carbs: 65, fat: 20, protein: 20, sugar: 8, fiber: 4, sodium: 1400 },
  teriyaki: { calories: 450, carbs: 40, fat: 12, protein: 40, sugar: 18, fiber: 2, sodium: 1200 },
  sushi_roll: { calories: 350, carbs: 45, fat: 12, protein: 15, sugar: 8, fiber: 3, sodium: 800 },
  poke: { calories: 400, carbs: 35, fat: 15, protein: 30, sugar: 6, fiber: 3, sodium: 900 },

  // Italian
  cannoli: { calories: 280, carbs: 30, fat: 16, protein: 6, sugar: 18, fiber: 1, sodium: 120 },
  tiramisu: { calories: 450, carbs: 45, fat: 25, protein: 8, sugar: 30, fiber: 1, sodium: 150 },
  biscotti_item: { calories: 120, carbs: 18, fat: 4, protein: 2, sugar: 8, fiber: 1, sodium: 60 },
  focaccia: { calories: 250, carbs: 35, fat: 10, protein: 6, sugar: 2, fiber: 2, sodium: 450 },
  rigatoni: { calories: 650, carbs: 80, fat: 24, protein: 22, sugar: 8, fiber: 4, sodium: 1100 },

  // Spanish
  patatas_bravas: { calories: 350, carbs: 40, fat: 18, protein: 5, sugar: 3, fiber: 4, sodium: 600 },
  gambas: { calories: 280, carbs: 5, fat: 20, protein: 22, sugar: 1, fiber: 0, sodium: 700 },
  tortilla_espanola: { calories: 250, carbs: 18, fat: 15, protein: 12, sugar: 2, fiber: 2, sodium: 400 },
  croquetas: { calories: 200, carbs: 18, fat: 10, protein: 8, sugar: 2, fiber: 1, sodium: 350 },
  ham_serrano: { calories: 150, carbs: 0, fat: 8, protein: 18, sugar: 0, fiber: 0, sodium: 1000 },

  // Desserts
  pie_slice: { calories: 400, carbs: 55, fat: 18, protein: 4, sugar: 30, fiber: 2, sodium: 300 },
  cobbler: { calories: 350, carbs: 55, fat: 12, protein: 4, sugar: 35, fiber: 3, sodium: 200 },
  flan: { calories: 280, carbs: 40, fat: 10, protein: 6, sugar: 35, fiber: 0, sodium: 120 },
  meringue: { calories: 100, carbs: 25, fat: 0, protein: 2, sugar: 24, fiber: 0, sodium: 20 },
  fruit_tart: { calories: 320, carbs: 42, fat: 15, protein: 4, sugar: 24, fiber: 2, sodium: 180 },
  sorbet: { calories: 150, carbs: 38, fat: 0, protein: 0, sugar: 32, fiber: 1, sodium: 10 },
  sherbet: { calories: 180, carbs: 40, fat: 2, protein: 1, sugar: 35, fiber: 0, sodium: 40 },
  gelato_sorbetto: { calories: 200, carbs: 35, fat: 6, protein: 3, sugar: 28, fiber: 0, sodium: 50 },
  marshmallow_bar: { calories: 180, carbs: 32, fat: 5, protein: 2, sugar: 20, fiber: 0, sodium: 80 },
  peanut_brittle: { calories: 200, carbs: 30, fat: 8, protein: 4, sugar: 22, fiber: 1, sodium: 150 },

  // Sides
  potato_wedges: { calories: 300, carbs: 40, fat: 14, protein: 4, sugar: 1, fiber: 4, sodium: 500 },
  gratin: { calories: 350, carbs: 30, fat: 22, protein: 10, sugar: 3, fiber: 2, sodium: 600 },
  roasted_veg: { calories: 150, carbs: 20, fat: 7, protein: 4, sugar: 8, fiber: 5, sodium: 300 },
  beets: { calories: 80, carbs: 18, fat: 0, protein: 2, sugar: 14, fiber: 3, sodium: 130 },
  peas: { calories: 100, carbs: 18, fat: 0, protein: 7, sugar: 8, fiber: 6, sodium: 200 },
  zucchini: { calories: 80, carbs: 8, fat: 4, protein: 2, sugar: 4, fiber: 2, sodium: 200 },
  cauliflower: { calories: 120, carbs: 12, fat: 7, protein: 4, sugar: 4, fiber: 4, sodium: 300 },

  // Snacks
  snack_mix: { calories: 180, carbs: 22, fat: 9, protein: 5, sugar: 4, fiber: 2, sodium: 300 },
  glazed_nuts: { calories: 250, carbs: 22, fat: 16, protein: 6, sugar: 16, fiber: 3, sodium: 100 },
  pickle: { calories: 15, carbs: 3, fat: 0, protein: 0, sugar: 1, fiber: 1, sodium: 800 },
  carrots_celery: { calories: 50, carbs: 12, fat: 0, protein: 1, sugar: 6, fiber: 3, sodium: 100 },
  fruit_snack: { calories: 80, carbs: 20, fat: 0, protein: 0, sugar: 12, fiber: 0, sodium: 10 },
  energy_drink: { calories: 110, carbs: 28, fat: 0, protein: 0, sugar: 27, fiber: 0, sodium: 180 },

  // Proteins
  salmon: { calories: 400, carbs: 5, fat: 22, protein: 45, sugar: 2, fiber: 0, sodium: 600 },
  grilled_fish: { calories: 300, carbs: 2, fat: 12, protein: 45, sugar: 0, fiber: 0, sodium: 500 },
  steak_large: { calories: 700, carbs: 0, fat: 45, protein: 70, sugar: 0, fiber: 0, sodium: 600 },
  half_chicken: { calories: 550, carbs: 5, fat: 30, protein: 65, sugar: 2, fiber: 0, sodium: 800 },
  brisket: { calories: 500, carbs: 5, fat: 30, protein: 50, sugar: 3, fiber: 0, sodium: 900 },

  // Misc
  grilled_cheese: { calories: 450, carbs: 35, fat: 28, protein: 18, sugar: 4, fiber: 2, sodium: 900 },
  protein_box: { calories: 400, carbs: 35, fat: 18, protein: 25, sugar: 12, fiber: 4, sodium: 800 },
  cheese_fruit_box: { calories: 350, carbs: 40, fat: 16, protein: 12, sugar: 25, fiber: 3, sodium: 500 },
  tofu_bowl: { calories: 450, carbs: 50, fat: 18, protein: 22, sugar: 8, fiber: 6, sodium: 800 },
  caesar_salad: { calories: 400, carbs: 20, fat: 32, protein: 15, sugar: 4, fiber: 4, sodium: 800 },
}

// Pattern matching
const PATTERNS: [RegExp, string][] = [
  // Zero calorie
  [/^(bottled\s*)?water$|^niagara|^san\s*benedetto\s*water|^premium\s*sparkling\s*water|^small\s*bottled\s*water/i, 'zero'],

  // Beverages - coffee
  [/brewed\s*coffee|freshly\s*brewed.*coffee|joffrey.*coffee|cafe\s*femenino|drip.*coffee|coffee\s*of\s*the\s*day/i, 'brewed_coffee'],
  [/iced\s*coffee|cold\s*brew(?!\s*(cinnamon|salted|flavored))/i, 'cold_brew'],
  [/(cinnamon|salted|caramel|specialty|ube|matcha)\s*cold\s*brew/i, 'flavored_cold_brew'],
  [/espresso\s*(con\s*panna|shot|crème|martini)|flat\s*white|caffe\s*(americano|misto)/i, 'espresso_drink'],
  [/peanut\s*butter.*coffee/i, 'flavored_cold_brew'],
  [/african\s*coffee|bailey.*coffee|irish.*coffee|coffee.*amarula/i, 'cocktail'],

  // Beverages - tea
  [/brewed\s*tea|hot\s*tea|twinings?|bewley|full[- ]leaf.*tea|loose[- ]leaf.*tea|^tea$/i, 'brewed_tea'],
  [/sweet\s*tea(?!.*vodka)|peach\s*(iced\s*)?tea|mango\s*(iced\s*)?tea|iced\s*tea\s*(lemon|peach)?/i, 'sweet_tea'],
  [/boba\s*tea|popping\s*boba/i, 'boba_tea'],

  // Beverages - juice/other
  [/^juice$|^juice\s*box|^kid.*juice|simply\s*juice|fresh.*squeezed.*juice/i, 'juice'],
  [/passion.*fruit.*juice|pog\s*juice/i, 'juice'],
  [/refresher|pink\s*drink|violet\s*drink|blue\s*boost/i, 'refresher'],
  [/agua\s*fresca|watermelon.*fresca/i, 'agua_fresca'],
  [/coconut\s*water/i, 'coconut_water'],
  [/vitamin\s*water/i, 'vitamin_water'],
  [/flavored\s*milk|strawberry.*milk|fruity\s*pebbles.*milk/i, 'flavored_milk'],
  [/^milk$|^cereal.*milk/i, 'cereal_milk'],
  [/fruit\s*punch|arendelle.*punch|polite\s*punch|tiki\s*punch/i, 'fruit_punch'],
  [/frozen\s*(beverage|drink|slushy|orangeade|mango|strawberry)|slushie|icee|blue\s*raspberry.*slushy/i, 'frozen_drink'],
  [/monster\s*energy|nos$|energy\s*drink/i, 'energy_drink'],

  // Alcohol - beer
  [/bud\s*light|corona|modelo|sapporo|craft.*beer|specialty\s*beer|samuel\s*adams|seasonal\s*beer/i, 'beer'],
  [/ipa|hefeweizen|stout|porter|ale(?!\s*ginger)|unibroue|schöfferhofer/i, 'craft_beer'],
  [/cider|angry\s*orchard|magners/i, 'cider'],
  [/white\s*claw|hard\s*seltzer|truly.*seltzer/i, 'hard_seltzer'],

  // Alcohol - wine
  [/wines?\s*by\s*the\s*glass|glass\s*of\s*wine|red\s*wines?|white\s*wines?|^wines?$|pinot|chardonnay|cabernet|merlot|malbec|riesling|sauvignon/i, 'wine_glass'],
  [/wines?\s*by\s*the\s*bottle/i, 'wine_bottle'],
  [/champagne|veuve|chandon|sparkling\s*wine|prosecco|brut/i, 'sparkling_wine'],
  [/sangria|white\s*peach\s*sangria|red\s*sangria|breakfast\s*sangria/i, 'sangria'],
  [/sake|hot.*sake|cold.*sake|joto|nigori|daiginjo|junmai/i, 'sake'],

  // Alcohol - cocktails
  [/margarita|frozen\s*margarita/i, 'margarita'],
  [/mojito|dragon\s*fruit\s*mojito|crystal.*mojito/i, 'mojito'],
  [/bloody\s*mary|caliente.*bloody|stk.*bloody|veg.*bloody|boathouse.*bloody/i, 'bloody_mary'],
  [/old\s*fashioned|frozen\s*old\s*fashioned|not\s*your\s*daddy/i, 'old_fashioned'],
  [/martini|espresso\s*martini|pear\s*martini|top\s*pick\s*martini/i, 'martini'],
  [/negroni/i, 'negroni'],
  [/spritz|aperol/i, 'spritz'],
  [/cosmopolitan/i, 'cocktail'],
  [/manhattan/i, 'cocktail'],
  [/whiskey|bourbon|knob\s*creek/i, 'whiskey'],
  [/jägermeister|liqueur/i, 'liqueur'],
  [/flight(?!\s*of)|beer\s*flight|wine\s*flight|tequila\s*flight|mocktail\s*flight|cold\s*brew\s*flight|dole\s*whip\s*flight|aviator.*flight|florida\s*flight/i, 'flight'],
  [/cocktail|shakin.*jamaican|tiki\s*torch|beach\s*bum|blue\s*lagoon|island\s*treasure|endless\s*vacation|fever\s*tree|rum\s*gunner|cucumber.*stiletto|hibiscus.*sparkler|mango.*kick|guava.*kiss|citrus.*smash|watermelon.*smash|watermelon.*chiller|spiced\s*watermelon|orange\s*crush|strawberry\s*freeze/i, 'cocktail'],

  // Fruits
  [/^fruit$|^whole\s*fruit|^fresh\s*fruit|seasonal\s*fruit|fruit\s*medley|fruit\s*cluster/i, 'fruit_whole'],
  [/fruit\s*cup|pineapple\s*cup/i, 'fruit_cup'],
  [/^strawberries$|^berries$|berry\s*sorbet/i, 'berries'],
  [/^pineapple$|stuffed\s*pineapple/i, 'pineapple'],
  [/^clementine|^orange$/i, 'clementine'],
  [/^grapes$/i, 'grapes'],
  [/applesauce/i, 'applesauce'],
  [/outshine|fruit\s*bar|mango\s*fruit\s*bar|strawberry\s*fruit\s*bar/i, 'fruit_bar'],
  [/fruit\s*snack|gogurt/i, 'fruit_snack'],

  // Breakfast
  [/oatmeal|steel\s*cut\s*oat/i, 'oatmeal'],
  [/yogurt\s*parfait|breakfast\s*parfait|granola\s*parfait/i, 'yogurt_parfait'],
  [/^yogurt$/i, 'yogurt'],
  [/bagel.*cream\s*cheese|smoked\s*salmon\s*bagel|bantam\s*bagel/i, 'bagel_cream_cheese'],
  [/^bagels?$/i, 'bagel_cream_cheese'],
  [/avocado\s*toast|crunch\s*toast/i, 'avocado_toast'],
  [/hash(?!\s*brown)|brisket\s*hash|pot\s*roast\s*hash|corned\s*beef\s*hash/i, 'hash'],
  [/^omelet|omelet\s*station|egg\s*white\s*omelet/i, 'omelet'],
  [/^two\s*eggs|eggs\s*your\s*way|^eggs$/i, 'eggs_two'],
  [/hard\s*boiled\s*egg/i, 'hard_boiled_eggs'],
  [/frittata/i, 'frittata'],
  [/^croissant$/i, 'croissant'],
  [/^danish$/i, 'danish'],
  [/^scones?$/i, 'scone'],
  [/^tarts?$/i, 'tart'],
  [/biscotti/i, 'biscotti'],
  [/breakfast\s*cereals?|cereal\s*with\s*milk/i, 'cereal_milk'],
  [/breakfast\s*tots|sweet\s*potato\s*tots|potato\s*tots/i, 'tots'],
  [/hash\s*brown\s*bites/i, 'tots'],

  // Appetizers
  [/oyster/i, 'oysters'],
  [/cheese\s*board|artisanal\s*cheese|cheese\s*&\s*meat|big\s*board/i, 'cheese_board'],
  [/charcuterie/i, 'charcuterie'],
  [/edamame/i, 'edamame'],
  [/caprese/i, 'caprese'],
  [/empanada/i, 'empanada'],
  [/deviled\s*egg/i, 'deviled_eggs'],
  [/warm.*olives|spiced\s*olives/i, 'olives'],
  [/calamari/i, 'calamari'],
  [/crab\s*claw|stone\s*crab/i, 'crab_claws'],
  [/meatball/i, 'meatballs'],
  [/wings?(?!\s*delight)/i, 'wings'],
  [/pot\s*sticker|gyoza/i, 'potstickers'],
  [/spring\s*roll|egg\s*roll/i, 'spring_rolls'],
  [/brussels\s*sprout|crispy\s*brussels/i, 'brussels_sprouts'],
  [/fried\s*cheese|cheese\s*bites.*marinara/i, 'fried_cheese'],
  [/bao\s*bun|pork\s*bun|chicken\s*bun/i, 'bao_bun'],
  [/fried\s*green\s*tomato/i, 'fried_cheese'],
  [/vegetable\s*pakora/i, 'spring_rolls'],
  [/peruvian\s*potato\s*croquette/i, 'croquetas'],

  // Asian
  [/ramen/i, 'ramen'],
  [/lo\s*mein/i, 'lo_mein'],
  [/teriyaki/i, 'teriyaki'],
  [/sushi|california\s*crunch|super\s*tuna|crouching\s*dragon|ahi\s*tuna/i, 'sushi_roll'],
  [/poke|yesake/i, 'poke'],
  [/karaage/i, 'wings'],

  // Italian
  [/cannoli/i, 'cannoli'],
  [/tiramisu/i, 'tiramisu'],
  [/focaccia/i, 'focaccia'],
  [/rigatoni|bolognese/i, 'rigatoni'],

  // Spanish
  [/patatas\s*bravas/i, 'patatas_bravas'],
  [/gambas/i, 'gambas'],
  [/tortilla\s*de\s*patatas|tortilla\s*espanola/i, 'tortilla_espanola'],
  [/croquetas/i, 'croquetas'],
  [/jamon\s*serrano|prosciutto/i, 'ham_serrano'],

  // Desserts
  [/key\s*lime\s*pie|hand\s*pie|simple\s*pie/i, 'pie_slice'],
  [/cobbler/i, 'cobbler'],
  [/flan/i, 'flan'],
  [/meringue/i, 'meringue'],
  [/fruit\s*tart/i, 'fruit_tart'],
  [/sorbet/i, 'sorbet'],
  [/sherbet|sherbert/i, 'sherbet'],
  [/sorbetto/i, 'gelato_sorbetto'],
  [/marshmallow.*bar/i, 'marshmallow_bar'],
  [/peanut\s*brittle/i, 'peanut_brittle'],
  [/bakery\s*sink/i, 'gelato_sorbetto'],

  // Sides
  [/potato\s*(wedges?|barrels?)/i, 'potato_wedges'],
  [/gratin|potato\s*gratin/i, 'gratin'],
  [/roasted\s*beet/i, 'beets'],
  [/crushed.*peas/i, 'peas'],
  [/sauteed\s*zucchini/i, 'zucchini'],
  [/^cauliflower$|bbq\s*cauliflower/i, 'cauliflower'],
  [/garden\s*vegetables/i, 'roasted_veg'],

  // Snacks
  [/cinnamon[- ]glazed\s*(nuts|pecans)|glazed\s*pecans/i, 'glazed_nuts'],
  [/trail\s*mix|fruit.*nut.*mix/i, 'snack_mix'],
  [/^pickle$|pickle[- ]in[- ]a[- ]pouch/i, 'pickle'],
  [/carrot.*celery|celery.*carrot|dipper\s*pack/i, 'carrots_celery'],
  [/bug[- ]shaped\s*graham/i, 'fruit_snack'],

  // Proteins
  [/salmon|cedar\s*plank|salmone/i, 'salmon'],
  [/grilled\s*(seasonal\s*)?fish|sustainable\s*fish|mero/i, 'grilled_fish'],
  [/dry[- ]aged|porterhouse|delmonico|a5\s*strip|bone[- ]in\s*strip/i, 'steak_large'],
  [/half\s*chicken/i, 'half_chicken'],
  [/brisket|usda\s*prime\s*brisket/i, 'brisket'],
  [/goofy.*salmon/i, 'salmon'],

  // Misc
  [/grilled\s*cheese(?!\s*delight)|gorilla.*cheese/i, 'grilled_cheese'],
  [/protein\s*box|bistro\s*box|pb\s*&?\s*j\s*box|egg.*cheese.*box|smoked\s*turkey.*box/i, 'protein_box'],
  [/cheese.*fruit.*box|fruit.*cheese.*box/i, 'cheese_fruit_box'],
  [/tofu.*bowl|power\s*bowl|bee\s*eazy\s*bowl/i, 'tofu_bowl'],
  [/caesar(?!\s*salad)/i, 'caesar_salad'],
  [/baby\s*gem\s*caesar|insalata/i, 'caesar_salad'],
  [/chicken\s*bites/i, 'wings'],
  [/sliced\s*apples/i, 'fruit_whole'],
  [/gluten\s*free\s*snacks/i, 'snack_mix'],
  [/topo\s*chico/i, 'zero'],
  [/large\s*candy/i, 'marshmallow_bar'],
  [/dole\s*whip\s*froscato|friezling|frozcato/i, 'cocktail'],
  [/around\s*the\s*world\s*tray/i, 'cheese_board'],
  [/dessert\s*cups|dessert\s*knots/i, 'danish'],
  [/gourmet\s*bitz|pizza\s*bitz/i, 'fried_cheese'],
  [/lil\s*brg/i, 'meatballs'],
  [/slider\s*trio/i, 'meatballs'],
  [/three\s*little\s*pigs/i, 'charcuterie'],
  [/medjoul\s*date/i, 'cheese_fruit_box'],
  [/landjager/i, 'ham_serrano'],
  [/grilled\s*country\s*ham/i, 'ham_serrano'],
  [/smoked\s*turkey\s*breast/i, 'half_chicken'],
]

async function fetchAll(table: string, select: string): Promise<any[]> {
  const all: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999)
    if (error) break
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

async function main() {
  console.log('Fetching items with null calories...\n')

  const nutrition = await fetchAll('nutritional_data', 'id, menu_item_id, calories')
  const menuItems = await fetchAll('menu_items', 'id, name, description, category')

  const menuMap = new Map(menuItems.map(m => [m.id, m]))
  const nullItems = nutrition.filter(n => n.calories === null)

  console.log(`Items with null calories: ${nullItems.length}`)

  let updated = 0
  let skipped = 0
  const unmatched: string[] = []

  for (const n of nullItems) {
    const item = menuMap.get(n.menu_item_id)
    if (!item) continue

    const name = (item.name || '').trim()
    const text = `${name} ${item.description || ''}`.toLowerCase()

    let matched = false
    for (const [pattern, templateKey] of PATTERNS) {
      if (pattern.test(text)) {
        const template = TEMPLATES[templateKey]
        if (template) {
          const { error } = await supabase.from('nutritional_data')
            .update({
              ...template,
              source: 'crowdsourced',
              confidence_score: 30
            })
            .eq('id', n.id)

          if (!error) {
            updated++
            matched = true
          }
          break
        }
      }
    }

    if (!matched) {
      if (!unmatched.includes(name)) unmatched.push(name)
      skipped++
    }
  }

  console.log(`\nUpdated: ${updated}`)
  console.log(`Skipped (no pattern): ${skipped}`)
  console.log(`Unique unmatched: ${unmatched.length}`)

  if (unmatched.length > 0 && unmatched.length <= 50) {
    console.log('\nUnmatched items:')
    unmatched.forEach(n => console.log(`  - ${n}`))
  }

  // Final stats
  const { data: stats } = await supabase.from('nutritional_data').select('calories')
  let withCal = 0, nullCal = 0
  for (const s of stats || []) {
    if (s.calories !== null && s.calories > 0) withCal++
    else nullCal++
  }

  console.log(`\n=== Final Coverage ===`)
  console.log(`With calories > 0: ${withCal} (${(withCal / (withCal + nullCal) * 100).toFixed(1)}%)`)
  console.log(`Null/zero: ${nullCal}`)
}

main()
