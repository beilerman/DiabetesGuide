/**
 * Import Universal's Epic Universe from scraped data.
 *
 * Usage:
 *   npx tsx scripts/import-epic-universe.ts [--dry-run]
 *
 * - Creates "Universal's Epic Universe" park record if missing
 * - Maps restaurants to their themed world/land
 * - Creates menu items with keyword-based nutrition estimation
 * - Strips HTML tags from descriptions
 * - Logs all additions to audit/additions/universals_epic_universe_additions.csv
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const supabase = createClient(url, key)
const DRY_RUN = process.argv.includes('--dry-run')

// ---- World/Land assignments for Epic Universe's 5 themed worlds ----
const RESTAURANT_LANDS: Record<string, string> = {
  // Celestial Park (hub area)
  'Atlantic': 'Celestial Park',
  'Bar Zenith': 'Celestial Park',
  'Celestiki': 'Celestial Park',
  'Comet Dogs': 'Celestial Park',
  'Frosty Moon': 'Celestial Park',
  'Meteor Astropub': 'Celestial Park',
  'Pizza Moon': 'Celestial Park',
  'Star Sui Bao': 'Celestial Park',

  // Ministry of Magic — The Wizarding World of Harry Potter (1920s Paris)
  "Cafe L'Air de la Sirene": 'Ministry of Magic',
  'Le Gobelet Noir': 'Ministry of Magic',
  'Bar Moonshine': 'Ministry of Magic',
  'The Plastered Owl': 'Ministry of Magic',

  // Isle of Berk — How to Train Your Dragon
  'Mead Hall': 'Isle of Berk',
  'Spit Fyre Grill': 'Isle of Berk',
  "Hooligan's Grog and Gruel": 'Isle of Berk',

  // Super Nintendo World
  'Toadstool Cafe': 'Super Nintendo World',
  'The Bubbly Barrel': 'Super Nintendo World',
  "Yoshi's Snack Island": 'Super Nintendo World',
  'Turbo Boost Treats': 'Super Nintendo World',

  // Dark Universe — Universal Monsters
  'Das Stakehaus': 'Dark Universe',
  'The Burning Blade Tavern': 'Dark Universe',
  'The Oak and Star Tavern': 'Dark Universe',
  "De Lacey's": 'Dark Universe',
}

// ---- Nutrition estimation (same patterns as phase3-import.ts) ----
interface NutritionEstimate {
  calories: number; carbs: number; fat: number; protein: number
  sugar: number; fiber: number; sodium: number
}

const FOOD_PROFILES: { pattern: RegExp; est: NutritionEstimate }[] = [
  // Entrees
  { pattern: /filet mignon|tenderloin steak/i, est: { calories: 650, carbs: 25, fat: 32, protein: 55, sugar: 3, fiber: 2, sodium: 800 } },
  { pattern: /angus.*burger|seared.*burger/i, est: { calories: 900, carbs: 50, fat: 50, protein: 45, sugar: 8, fiber: 3, sodium: 1400 } },
  { pattern: /short rib|braised beef|beef bourguignon/i, est: { calories: 700, carbs: 30, fat: 35, protein: 45, sugar: 5, fiber: 3, sodium: 900 } },
  { pattern: /pork chop|roasted pork/i, est: { calories: 650, carbs: 25, fat: 30, protein: 48, sugar: 8, fiber: 2, sodium: 850 } },
  { pattern: /fried chicken|crispy chicken/i, est: { calories: 600, carbs: 35, fat: 30, protein: 35, sugar: 3, fiber: 2, sodium: 1100 } },
  { pattern: /chicken sandwich/i, est: { calories: 650, carbs: 45, fat: 30, protein: 35, sugar: 5, fiber: 2, sodium: 1200 } },
  { pattern: /chicken tender|chicken strip|chicken thumb/i, est: { calories: 500, carbs: 30, fat: 25, protein: 30, sugar: 2, fiber: 1, sodium: 900 } },
  { pattern: /pulled pork|barbecue pork/i, est: { calories: 550, carbs: 40, fat: 22, protein: 35, sugar: 12, fiber: 2, sodium: 1000 } },
  { pattern: /hot dog|corn dog/i, est: { calories: 450, carbs: 35, fat: 25, protein: 15, sugar: 5, fiber: 2, sodium: 1000 } },
  { pattern: /turkey leg/i, est: { calories: 1100, carbs: 0, fat: 55, protein: 85, sugar: 0, fiber: 0, sodium: 2200 } },
  { pattern: /salmon|halibut|sea bass|branzino/i, est: { calories: 500, carbs: 20, fat: 22, protein: 40, sugar: 3, fiber: 2, sodium: 700 } },
  { pattern: /lobster|stone crab|crab cake|seafood/i, est: { calories: 500, carbs: 25, fat: 20, protein: 38, sugar: 3, fiber: 2, sodium: 900 } },
  { pattern: /shrimp/i, est: { calories: 400, carbs: 25, fat: 18, protein: 30, sugar: 3, fiber: 1, sodium: 800 } },
  { pattern: /ribs|rib rack|pork rib/i, est: { calories: 700, carbs: 20, fat: 40, protein: 55, sugar: 12, fiber: 1, sodium: 1100 } },
  { pattern: /steak bowl|rice bowl|noodle bowl/i, est: { calories: 600, carbs: 55, fat: 20, protein: 35, sugar: 6, fiber: 3, sodium: 1000 } },
  { pattern: /mac.*cheese|macaroni/i, est: { calories: 600, carbs: 55, fat: 30, protein: 22, sugar: 5, fiber: 2, sodium: 900 } },
  { pattern: /waffle.*chicken|chicken.*waffle/i, est: { calories: 850, carbs: 65, fat: 40, protein: 40, sugar: 15, fiber: 3, sodium: 1400 } },
  { pattern: /philly cheesesteak/i, est: { calories: 750, carbs: 50, fat: 35, protein: 40, sugar: 5, fiber: 3, sodium: 1400 } },
  { pattern: /sandwich/i, est: { calories: 600, carbs: 45, fat: 28, protein: 30, sugar: 5, fiber: 3, sodium: 1100 } },
  { pattern: /pasta|spaghetti|penne|fettuccine|tortellini/i, est: { calories: 700, carbs: 65, fat: 28, protein: 28, sugar: 6, fiber: 3, sodium: 1000 } },
  { pattern: /pizza/i, est: { calories: 850, carbs: 78, fat: 32, protein: 32, sugar: 5, fiber: 3, sodium: 1400 } },
  { pattern: /mushroom soup|cream.*soup|knödel soup|broth/i, est: { calories: 250, carbs: 25, fat: 12, protein: 8, sugar: 5, fiber: 2, sodium: 900 } },
  { pattern: /salad/i, est: { calories: 350, carbs: 20, fat: 18, protein: 15, sugar: 8, fiber: 4, sodium: 500 } },
  { pattern: /quiche/i, est: { calories: 450, carbs: 30, fat: 28, protein: 18, sugar: 4, fiber: 1, sodium: 700 } },
  { pattern: /tteokbokki|rice cake/i, est: { calories: 350, carbs: 45, fat: 8, protein: 12, sugar: 5, fiber: 2, sodium: 700 } },
  { pattern: /calzone/i, est: { calories: 700, carbs: 70, fat: 28, protein: 30, sugar: 5, fiber: 3, sodium: 1200 } },
  { pattern: /pretzel/i, est: { calories: 480, carbs: 70, fat: 12, protein: 12, sugar: 5, fiber: 2, sodium: 1200 } },
  { pattern: /nachos/i, est: { calories: 700, carbs: 60, fat: 38, protein: 22, sugar: 5, fiber: 5, sodium: 1300 } },
  { pattern: /burger/i, est: { calories: 850, carbs: 50, fat: 45, protein: 42, sugar: 7, fiber: 3, sodium: 1300 } },

  // Sides
  { pattern: /mashed potato/i, est: { calories: 200, carbs: 30, fat: 8, protein: 4, sugar: 2, fiber: 2, sodium: 400 } },
  { pattern: /steamed rice/i, est: { calories: 200, carbs: 45, fat: 1, protein: 4, sugar: 0, fiber: 1, sodium: 10 } },
  { pattern: /fried rice/i, est: { calories: 550, carbs: 65, fat: 18, protein: 20, sugar: 3, fiber: 2, sodium: 1000 } },
  { pattern: /fries|french fry/i, est: { calories: 400, carbs: 50, fat: 20, protein: 5, sugar: 2, fiber: 4, sodium: 700 } },
  { pattern: /tater tots/i, est: { calories: 500, carbs: 45, fat: 30, protein: 12, sugar: 3, fiber: 3, sodium: 900 } },
  { pattern: /sweet potato/i, est: { calories: 350, carbs: 45, fat: 16, protein: 4, sugar: 8, fiber: 5, sodium: 500 } },
  { pattern: /seasonal vegetable|roasted vegetable/i, est: { calories: 100, carbs: 15, fat: 4, protein: 3, sugar: 5, fiber: 4, sodium: 200 } },
  { pattern: /garlic bread|garlic butter/i, est: { calories: 280, carbs: 30, fat: 14, protein: 5, sugar: 2, fiber: 1, sodium: 450 } },
  { pattern: /coleslaw/i, est: { calories: 150, carbs: 12, fat: 10, protein: 2, sugar: 8, fiber: 2, sodium: 250 } },
  { pattern: /baked beans/i, est: { calories: 250, carbs: 40, fat: 4, protein: 10, sugar: 15, fiber: 7, sodium: 600 } },
  { pattern: /corn.*(cob|butter)/i, est: { calories: 170, carbs: 30, fat: 6, protein: 5, sugar: 5, fiber: 3, sodium: 300 } },

  // Snacks / small plates
  { pattern: /garlic stake|garlic pretzel/i, est: { calories: 350, carbs: 45, fat: 14, protein: 8, sugar: 3, fiber: 2, sodium: 800 } },
  { pattern: /skewer|satay/i, est: { calories: 350, carbs: 15, fat: 18, protein: 28, sugar: 5, fiber: 1, sodium: 700 } },
  { pattern: /egg roll|spring roll/i, est: { calories: 350, carbs: 30, fat: 18, protein: 12, sugar: 3, fiber: 2, sodium: 600 } },
  { pattern: /dumpling|gyoza|pot.?sticker/i, est: { calories: 280, carbs: 25, fat: 12, protein: 15, sugar: 2, fiber: 1, sodium: 650 } },
  { pattern: /wings/i, est: { calories: 600, carbs: 15, fat: 40, protein: 45, sugar: 8, fiber: 1, sodium: 1200 } },
  { pattern: /sliders/i, est: { calories: 500, carbs: 35, fat: 25, protein: 28, sugar: 5, fiber: 2, sodium: 900 } },
  { pattern: /onion ring/i, est: { calories: 450, carbs: 45, fat: 25, protein: 6, sugar: 5, fiber: 3, sodium: 700 } },
  { pattern: /calamari/i, est: { calories: 400, carbs: 30, fat: 22, protein: 18, sugar: 2, fiber: 1, sodium: 700 } },
  { pattern: /charcuterie|cheese.?board|cheese plate/i, est: { calories: 500, carbs: 20, fat: 38, protein: 22, sugar: 5, fiber: 2, sodium: 1000 } },
  { pattern: /loaded fries|cheddar.*fries/i, est: { calories: 650, carbs: 55, fat: 35, protein: 18, sugar: 3, fiber: 4, sodium: 1100 } },

  // Breakfast
  { pattern: /eggs.*fries|traditional.*breakfast|two eggs/i, est: { calories: 700, carbs: 45, fat: 40, protein: 30, sugar: 4, fiber: 3, sodium: 1100 } },
  { pattern: /french toast|pain perdu/i, est: { calories: 550, carbs: 60, fat: 22, protein: 12, sugar: 25, fiber: 2, sodium: 500 } },
  { pattern: /pancake/i, est: { calories: 500, carbs: 65, fat: 18, protein: 10, sugar: 20, fiber: 2, sodium: 700 } },
  { pattern: /waffle/i, est: { calories: 550, carbs: 65, fat: 22, protein: 10, sugar: 15, fiber: 2, sodium: 600 } },
  { pattern: /omelette|omelet/i, est: { calories: 450, carbs: 10, fat: 32, protein: 28, sugar: 3, fiber: 1, sodium: 800 } },
  { pattern: /breakfast.*burrito|burrito/i, est: { calories: 600, carbs: 55, fat: 28, protein: 25, sugar: 4, fiber: 4, sodium: 1100 } },
  { pattern: /avocado toast/i, est: { calories: 400, carbs: 35, fat: 22, protein: 10, sugar: 4, fiber: 6, sodium: 500 } },
  { pattern: /bagel/i, est: { calories: 400, carbs: 50, fat: 12, protein: 15, sugar: 5, fiber: 2, sodium: 600 } },

  // Desserts
  { pattern: /ice cream.*cone|double.*scoop|single scoop/i, est: { calories: 350, carbs: 42, fat: 16, protein: 6, sugar: 35, fiber: 1, sodium: 120 } },
  { pattern: /soft.?serve|dole whip/i, est: { calories: 200, carbs: 40, fat: 3, protein: 2, sugar: 30, fiber: 0, sodium: 50 } },
  { pattern: /sundae/i, est: { calories: 500, carbs: 60, fat: 25, protein: 7, sugar: 50, fiber: 1, sodium: 200 } },
  { pattern: /milkshake|shake/i, est: { calories: 550, carbs: 70, fat: 22, protein: 10, sugar: 60, fiber: 1, sodium: 250 } },
  { pattern: /churro/i, est: { calories: 300, carbs: 40, fat: 14, protein: 3, sugar: 18, fiber: 1, sodium: 250 } },
  { pattern: /doughnut|donut/i, est: { calories: 350, carbs: 42, fat: 18, protein: 4, sugar: 22, fiber: 1, sodium: 300 } },
  { pattern: /cheesecake/i, est: { calories: 450, carbs: 40, fat: 28, protein: 8, sugar: 30, fiber: 1, sodium: 300 } },
  { pattern: /creme brulee|crème brûlée/i, est: { calories: 400, carbs: 45, fat: 22, protein: 5, sugar: 35, fiber: 1, sodium: 150 } },
  { pattern: /tiramisu/i, est: { calories: 450, carbs: 42, fat: 25, protein: 6, sugar: 28, fiber: 1, sodium: 150 } },
  { pattern: /cupcake/i, est: { calories: 450, carbs: 55, fat: 22, protein: 5, sugar: 40, fiber: 1, sodium: 300 } },
  { pattern: /brownie/i, est: { calories: 400, carbs: 50, fat: 20, protein: 5, sugar: 35, fiber: 2, sodium: 200 } },
  { pattern: /cookie/i, est: { calories: 350, carbs: 48, fat: 16, protein: 4, sugar: 28, fiber: 1, sodium: 250 } },
  { pattern: /waffle.*dessert|liege waffle/i, est: { calories: 500, carbs: 60, fat: 22, protein: 8, sugar: 30, fiber: 2, sodium: 350 } },
  { pattern: /pie|tart/i, est: { calories: 400, carbs: 50, fat: 18, protein: 5, sugar: 30, fiber: 2, sodium: 250 } },
  { pattern: /gelato|sorbet/i, est: { calories: 250, carbs: 35, fat: 10, protein: 4, sugar: 28, fiber: 0, sodium: 50 } },
  { pattern: /chocolate.*cake|layer cake/i, est: { calories: 500, carbs: 60, fat: 25, protein: 6, sugar: 45, fiber: 2, sodium: 300 } },
  { pattern: /crepe/i, est: { calories: 400, carbs: 50, fat: 18, protein: 6, sugar: 28, fiber: 2, sodium: 150 } },
  { pattern: /bread pudding/i, est: { calories: 500, carbs: 60, fat: 22, protein: 8, sugar: 40, fiber: 1, sodium: 350 } },
  { pattern: /macaron(?!i)/i, est: { calories: 200, carbs: 28, fat: 8, protein: 3, sugar: 22, fiber: 0, sodium: 50 } },
  { pattern: /chocolate/i, est: { calories: 300, carbs: 35, fat: 16, protein: 4, sugar: 28, fiber: 2, sodium: 100 } },

  // Beverages (non-alcoholic)
  { pattern: /bottled water|dasani|water$/i, est: { calories: 0, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0 } },
  { pattern: /pumpkin juice/i, est: { calories: 150, carbs: 38, fat: 0, protein: 0, sugar: 36, fiber: 0, sodium: 15 } },
  { pattern: /butterbeer|frozen.*butterbeer/i, est: { calories: 350, carbs: 85, fat: 5, protein: 1, sugar: 80, fiber: 0, sodium: 30 } },
  { pattern: /dk crush|tropical.*float|banana.*float/i, est: { calories: 280, carbs: 55, fat: 5, protein: 2, sugar: 50, fiber: 0, sodium: 50 } },
  { pattern: /float/i, est: { calories: 350, carbs: 55, fat: 8, protein: 3, sugar: 50, fiber: 0, sodium: 60 } },
  { pattern: /lemonade/i, est: { calories: 200, carbs: 50, fat: 0, protein: 0, sugar: 48, fiber: 0, sodium: 20 } },
  { pattern: /iced tea|sweet tea/i, est: { calories: 120, carbs: 30, fat: 0, protein: 0, sugar: 29, fiber: 0, sodium: 15 } },
  { pattern: /brewed coffee|drip coffee|black coffee/i, est: { calories: 5, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 5 } },
  { pattern: /cold brew|iced coffee/i, est: { calories: 150, carbs: 25, fat: 3, protein: 2, sugar: 20, fiber: 0, sodium: 30 } },
  { pattern: /hot chocolate/i, est: { calories: 250, carbs: 35, fat: 8, protein: 4, sugar: 28, fiber: 2, sodium: 150 } },
  { pattern: /fountain drink|soda|cola/i, est: { calories: 240, carbs: 65, fat: 0, protein: 0, sugar: 65, fiber: 0, sodium: 50 } },
  { pattern: /juice/i, est: { calories: 150, carbs: 36, fat: 0, protein: 1, sugar: 34, fiber: 0, sodium: 15 } },
  { pattern: /smoothie/i, est: { calories: 280, carbs: 55, fat: 3, protein: 5, sugar: 45, fiber: 3, sodium: 80 } },
  { pattern: /milkshake|milk shake/i, est: { calories: 550, carbs: 70, fat: 22, protein: 10, sugar: 60, fiber: 1, sodium: 250 } },

  // Alcoholic beverages
  { pattern: /bud light/i, est: { calories: 110, carbs: 7, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 10 } },
  { pattern: /hard seltzer/i, est: { calories: 100, carbs: 2, fat: 0, protein: 0, sugar: 2, fiber: 0, sodium: 10 } },
  { pattern: /sauvignon blanc|chardonnay|pinot grigio|white wine/i, est: { calories: 120, carbs: 4, fat: 0, protein: 0, sugar: 2, fiber: 0, sodium: 5 } },
  { pattern: /cabernet|merlot|pinot noir|red wine/i, est: { calories: 125, carbs: 4, fat: 0, protein: 0, sugar: 1, fiber: 0, sodium: 5 } },
  { pattern: /sparkling wine|champagne|prosecco/i, est: { calories: 120, carbs: 4, fat: 0, protein: 0, sugar: 2, fiber: 0, sodium: 5 } },
  { pattern: /mead/i, est: { calories: 250, carbs: 25, fat: 0, protein: 0, sugar: 22, fiber: 0, sodium: 10 } },
  { pattern: /beer|ale|lager|stout|ipa/i, est: { calories: 200, carbs: 18, fat: 0, protein: 2, sugar: 3, fiber: 0, sodium: 15 } },
  { pattern: /grog/i, est: { calories: 180, carbs: 5, fat: 0, protein: 0, sugar: 4, fiber: 0, sodium: 5 } },
  { pattern: /margarita|cosmo|mojito|daiquiri/i, est: { calories: 250, carbs: 25, fat: 0, protein: 0, sugar: 22, fiber: 0, sodium: 10 } },
  { pattern: /highball|punch|cocktail|spritz/i, est: { calories: 220, carbs: 20, fat: 0, protein: 0, sugar: 18, fiber: 0, sodium: 10 } },
  { pattern: /vodka|gin.*tonic|rum.*coke|whiskey|bourbon/i, est: { calories: 200, carbs: 15, fat: 0, protein: 0, sugar: 12, fiber: 0, sodium: 5 } },
  { pattern: /wine.*flight/i, est: { calories: 360, carbs: 12, fat: 0, protein: 0, sugar: 5, fiber: 0, sodium: 15 } },
]

function estimateNutrition(name: string, description: string, category: string): NutritionEstimate {
  const combined = `${name} ${description}`
  for (const profile of FOOD_PROFILES) {
    if (profile.pattern.test(name)) return profile.est
  }
  for (const profile of FOOD_PROFILES) {
    if (profile.pattern.test(combined)) return profile.est
  }
  switch (category) {
    case 'entree': return { calories: 600, carbs: 40, fat: 25, protein: 30, sugar: 5, fiber: 3, sodium: 900 }
    case 'dessert': return { calories: 400, carbs: 50, fat: 18, protein: 4, sugar: 35, fiber: 1, sodium: 200 }
    case 'snack': return { calories: 300, carbs: 35, fat: 14, protein: 8, sugar: 10, fiber: 2, sodium: 500 }
    case 'beverage': return { calories: 200, carbs: 45, fat: 1, protein: 1, sugar: 40, fiber: 0, sodium: 30 }
    case 'side': return { calories: 250, carbs: 25, fat: 12, protein: 8, sugar: 4, fiber: 3, sodium: 500 }
    default: return { calories: 400, carbs: 35, fat: 18, protein: 15, sugar: 8, fiber: 2, sodium: 600 }
  }
}

function stripHtml(html: string): string {
  if (!html) return ''
  return html
    .replace(/<[^>]+>/g, '')         // remove all tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&reg;/gi, '®')
    .replace(/&trade;/gi, '™')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferCategory(name: string, rawCategory?: string): string {
  if (rawCategory === 'beverage') return 'beverage'
  if (rawCategory === 'snack') return 'snack'
  const n = name.toLowerCase()
  // Alcoholic — use word boundaries for short patterns to avoid false positives
  // (e.g. /ale/ would match "galette", /tea/ would match "steak", /cola/ would match "chocolat")
  if (/beer\b|wine\b|cocktail|mead\b|grog\b|spirits|highball|punch\b|spritz|margarita|cosmo\b|vodka|gin\b|rum\b|whiskey|bourbon|\bale\b|lager|\bipa\b|stout|seltzer|bubbly|cider|aperol|campari|vermouth|schnapps|moonshine|\bbrew\b|draft\b|tipple|bièraubeurre|butterbeer|pumpkin juice|gigglewater/i.test(n)) return 'beverage'
  // Known beer/hard beverage brands not caught by generic patterns
  if (/modelo|stella artois|corona\b|heineken|dos equis|bud(weiser)?\b|miller\b|coors\b|fat tire|blue moon|sierra nevada|angry orchard|white claw|truly\b|crook(ed can)?|newcastle|sam adams|goose island|daisyroot|dragon'?s milk|kronenbourg|guinness|carlsberg|delirium|schöfferhofer|hefeweizen|michelob|brooklyn brew|barrel of monks|orange blossom pilsner|ommegang|nütrl|high noon\b/i.test(n)) return 'beverage'
  // Fine wine by variety name (not caught by "wine\b")
  if (/riesling|moscato|malbec|chardonnay|sauvignon blanc|pinot noir|pinot grigio|viognier|grüner|gruner|garnacha|grenacha|chianti|amarone|montepulciano|valpolicella|beaune|rosé\b|rouge\b|blanc\b|port\b|pommeau|glühwein|gluhwein|gewürz|champagne\b|cider\b|prosecco\b/i.test(n)) return 'beverage'
  // More fine wines by brand name phrases
  if (/château|domaine\b|vietti|bolla|ruffino|antinori|allegrini|feudo|umani|laurenz|ferreira|beni di|poggio anima|stemmari|isole e|santa julia|rodney strong|matchbook|daou|breca|joseph drouhin|descendientes|a to z wine/i.test(n)) return 'beverage'
  // Non-alcoholic brand beverages
  if (/monster.*energy|monster.*ultra|monster.*zero|powerade|gatorade|perrier\b|pellegrino|evian\b/i.test(n)) return 'beverage'
  // Mocktails, souvenir cups, drink vessels
  if (/mocktail|freestyle.*sipper|souvenir.*sipper|sipper\b.*cup|freestyle.*cup/i.test(n)) return 'beverage'
  // French/European tea names
  if (/\bthé\b|\bhot beverages?\b/i.test(n)) return 'beverage'
  // Non-alcoholic — use word boundaries on short ambiguous words
  if (/soda\b|\bcola\b|juice\b|lemonade|\btea\b|coffee|water\b|milk\b|shake\b|smoothie|float\b|slush|latte|cappuccino|espresso|americano|frappuccino|beverage|dirigible plum|gillywater/i.test(n)) return 'beverage'
  // Pastries / bakery items — these are snacks, not entrees
  if (/croissant|pain au|baguette(?! \w+.*sandwich)|brioche.*bun|brioche.*roll/i.test(n)) return 'snack'
  if (/cake|pie\b|tart\b|brownie|cookie|cupcake|churro|donut|doughnut|ice cream|gelato|sorbet|soft.?serve|sundae|parfait|pudding|crème brûlée|creme brulee|tiramisu|macaron\b|candy|fudge|truffle|mousse|cheesecake/i.test(n)) return 'dessert'
  if (/crepe.*sweet|crêpe.*banana|crêpe.*citron|petite crêpe/i.test(n)) return 'dessert'
  // Ice cream shop toppings/flavors (for Frosty Moon and similar shops)
  if (/sprinkle|marshmallow|oreo.*crumble|vanilla\b|vegan vanilla|strawberry yum/i.test(n)) return 'dessert'
  // Fruit items
  if (/\bfruit bowl\b|^mango$|^apple melon$|^banana$/i.test(n)) return 'snack'
  if (/\bside\b|fries\b|tots\b|slaw\b|\bbeans\b|\bsalad\b|steamed rice|seasonal.*veg|\bvegetables?\b|garlic.*knot|coleslaw|corn on the|extra day/i.test(n)) return 'side'
  if (/pretzel|popcorn|nachos|snack|bite\b|nibble|chips\b|cracker|wings\b/i.test(n)) return 'snack'
  return 'entree'
}

function inferVegetarian(name: string, desc: string): boolean {
  const text = `${name} ${desc}`.toLowerCase()
  if (/\bveg(an|etarian)\b|plant.based|impossible|beyond meat|tofu|tempeh|jackfruit/i.test(text)) return true
  if (/chicken|beef|pork|salmon|shrimp|lobster|crab|fish|turkey|duck|lamb|veal|meat|steak|burger(?! impossible)|wings|ribs|sausage|prosciutto|bacon|pepperoni|chorizo|anchov/i.test(text)) return false
  return false
}

function inferFried(name: string, desc: string): boolean {
  return /\bfri(ed|es)\b|crispy|tempura|battered|deep.fry|croquette|corn dog|schnitzel/i.test(`${name} ${desc}`)
}

// Skip placeholder items
const SKIP_PATTERNS = [
  /details coming soon/i,
  /menu coming soon/i,
  /tba\b/i,
  /^n\/a$/i,
]

async function main() {
  console.log(`Epic Universe Import — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`)

  // Load scraped data
  const scraped = JSON.parse(readFileSync(resolve(__dirname, '../data/scraped/universal-2026-02-04.json'), 'utf-8'))
  const allRests: any[] = scraped.restaurants
  const euRests = allRests.filter(r => r.parkName === 'Universal Epic Universe')

  console.log(`Found ${euRests.length} Epic Universe restaurants in scraped data\n`)

  // Prepare additions log
  const additionsDir = resolve(__dirname, '../audit/additions')
  if (!existsSync(additionsDir)) mkdirSync(additionsDir, { recursive: true })

  const csvRows: string[] = [
    'action,park_name,restaurant_name,land,item_name,category,calories,carbs,fat,protein,sugar,fiber,sodium,confidence_score'
  ]

  // 1. Find or create the park
  let parkId: string
  const { data: existingPark } = await supabase
    .from('parks')
    .select('id')
    .eq('name', "Universal's Epic Universe")
    .single()

  if (existingPark) {
    parkId = existingPark.id
    console.log("✓ Park 'Universal's Epic Universe' already exists")
  } else {
    if (DRY_RUN) {
      console.log("+ Would create park 'Universal's Epic Universe'")
      parkId = 'dry-run-park-id'
    } else {
      const { data: newPark, error } = await supabase
        .from('parks')
        .insert({
          name: "Universal's Epic Universe",
          location: 'Universal Orlando Resort',
        })
        .select('id')
        .single()
      if (error) {
        console.error('Park insert error:', error.message)
        process.exit(1)
      }
      parkId = newPark.id
      console.log("+ Created park 'Universal's Epic Universe' →", parkId)
    }
  }

  let totalNewRestaurants = 0
  let totalNewItems = 0
  let totalSkipped = 0

  for (const r of euRests) {
    const restName: string = r.restaurantName
    const land = RESTAURANT_LANDS[restName] || 'Celestial Park' // default to hub
    const items: any[] = r.items || []

    if (!DRY_RUN || true) {
      console.log(`\n${restName} [${land}] — ${items.length} scraped items`)
    }

    // Find or create restaurant
    let restId: string
    const { data: existingRest } = await supabase
      .from('restaurants')
      .select('id')
      .eq('park_id', parkId)
      .eq('name', restName)
      .single()

    if (existingRest) {
      restId = existingRest.id
      console.log(`  ✓ Restaurant exists`)
    } else {
      if (DRY_RUN) {
        console.log(`  + Would create restaurant: ${restName}`)
        restId = 'dry-run-rest-id'
        totalNewRestaurants++
      } else {
        const { data: newRest, error } = await supabase
          .from('restaurants')
          .insert({ park_id: parkId, name: restName, land })
          .select('id')
          .single()
        if (error) {
          console.error(`  Restaurant insert error for ${restName}:`, error.message)
          continue
        }
        restId = newRest.id
        totalNewRestaurants++
        console.log(`  + Created restaurant`)
      }

      csvRows.push(['new_restaurant', "Universal's Epic Universe", restName, land, '', '', '', '', '', '', '', '', '', ''].join(','))
    }

    // Get existing items
    let existingItemNames = new Set<string>()
    if (!DRY_RUN && existingRest) {
      const { data: existing } = await supabase
        .from('menu_items')
        .select('name')
        .eq('restaurant_id', restId)
      existingItemNames = new Set((existing ?? []).map(i => i.name.toLowerCase()))
    }

    // Track names added this batch to handle scraper duplicates
    const addedThisBatch = new Set<string>()

    let restNew = 0, restSkipped = 0
    for (const item of items) {
      const name: string = stripHtml(item.itemName || '')
      const description: string = stripHtml(item.description || '')
      const rawCategory: string = item.category || ''

      // Skip placeholders
      if (!name || SKIP_PATTERNS.some(p => p.test(name))) {
        totalSkipped++
        restSkipped++
        continue
      }

      if (existingItemNames.has(name.toLowerCase()) || addedThisBatch.has(name.toLowerCase())) {
        totalSkipped++
        restSkipped++
        continue
      }

      const category = inferCategory(name, rawCategory)
      const est = estimateNutrition(name, description, category)
      const isVeg = inferVegetarian(name, description)
      const isFried = inferFried(name, description)

      addedThisBatch.add(name.toLowerCase())

      if (DRY_RUN) {
        console.log(`    + ${name} [${category}] — ${est.calories} cal, ${est.carbs}g carbs`)
        totalNewItems++
        restNew++
      } else {
        const { data: menuRow, error: menuErr } = await supabase
          .from('menu_items')
          .insert({
            restaurant_id: restId,
            name,
            description: description || null,
            category,
            price: item.price || null,
            is_fried: isFried,
            is_vegetarian: isVeg,
          })
          .select('id')
          .single()

        if (menuErr) {
          console.error(`    Menu item error for ${name}:`, menuErr.message)
          continue
        }

        const { error: nutErr } = await supabase
          .from('nutritional_data')
          .insert({
            menu_item_id: menuRow.id,
            calories: est.calories,
            carbs: est.carbs,
            fat: est.fat,
            protein: est.protein,
            sugar: est.sugar,
            fiber: est.fiber,
            sodium: est.sodium,
            source: 'crowdsourced',
            confidence_score: 30,
          })

        if (nutErr) {
          console.error(`    Nutrition error for ${name}:`, nutErr.message)
        }

        totalNewItems++
        restNew++
        console.log(`    + ${name} [${category}] — ${est.calories} cal`)
      }

      const csvSafe = (s: string) => `"${String(s).replace(/"/g, '""')}"`
      csvRows.push([
        'new_item',
        csvSafe("Universal's Epic Universe"),
        csvSafe(restName),
        csvSafe(land),
        csvSafe(name),
        category,
        est.calories, est.carbs, est.fat, est.protein,
        est.sugar, est.fiber, est.sodium,
        30,
      ].join(','))
    }

    console.log(`  → ${restNew} new, ${restSkipped} skipped`)
  }

  // Write additions log
  const csvPath = resolve(additionsDir, 'universals_epic_universe_additions.csv')
  if (!DRY_RUN) {
    writeFileSync(csvPath, csvRows.join('\n'), 'utf-8')
    console.log(`\nAdditions log: ${csvPath}`)
  }

  console.log(`\n=== Summary ===`)
  console.log(`New restaurants: ${totalNewRestaurants}`)
  console.log(`New items: ${totalNewItems}`)
  console.log(`Skipped: ${totalSkipped}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN — no changes made' : 'LIVE — all changes applied'}`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
