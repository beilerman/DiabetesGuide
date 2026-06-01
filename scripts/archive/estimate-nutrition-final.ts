/**
 * Final pass to estimate remaining items
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

// Simple templates
const TEMPLATES: Record<string, any> = {
  zero: { calories: 0, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0 },
  cocktail: { calories: 200, carbs: 20, fat: 0, protein: 0, sugar: 16, fiber: 0, sodium: 15 },
  wine: { calories: 125, carbs: 4, fat: 0, protein: 0, sugar: 1, fiber: 0, sodium: 5 },
  coffee: { calories: 5, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 5 },
  juice: { calories: 120, carbs: 29, fat: 0, protein: 1, sugar: 26, fiber: 0, sodium: 10 },
  milk: { calories: 150, carbs: 12, fat: 8, protein: 8, sugar: 12, fiber: 0, sodium: 120 },
  seltzer: { calories: 100, carbs: 2, fat: 0, protein: 0, sugar: 1, fiber: 0, sodium: 10 },
  frozen_drink: { calories: 250, carbs: 55, fat: 0, protein: 0, sugar: 50, fiber: 0, sodium: 20 },
  tea: { calories: 2, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0 },
  pizza: { calories: 300, carbs: 35, fat: 12, protein: 12, sugar: 4, fiber: 2, sodium: 600 },
  sandwich: { calories: 500, carbs: 45, fat: 22, protein: 25, sugar: 6, fiber: 3, sodium: 1100 },
  mac_cheese: { calories: 500, carbs: 45, fat: 28, protein: 18, sugar: 6, fiber: 2, sodium: 900 },
  grits: { calories: 200, carbs: 30, fat: 8, protein: 5, sugar: 2, fiber: 2, sodium: 400 },
  scone: { calories: 400, carbs: 50, fat: 20, protein: 6, sugar: 18, fiber: 2, sodium: 450 },
  danish: { calories: 350, carbs: 45, fat: 17, protein: 5, sugar: 22, fiber: 1, sodium: 280 },
  croissant: { calories: 280, carbs: 32, fat: 15, protein: 6, sugar: 6, fiber: 2, sodium: 320 },
  tart: { calories: 320, carbs: 40, fat: 16, protein: 4, sugar: 22, fiber: 2, sodium: 180 },
  oat_bar: { calories: 200, carbs: 30, fat: 8, protein: 4, sugar: 14, fiber: 3, sodium: 100 },
  eggs: { calories: 180, carbs: 2, fat: 12, protein: 14, sugar: 1, fiber: 0, sodium: 350 },
  yogurt: { calories: 150, carbs: 20, fat: 4, protein: 12, sugar: 15, fiber: 0, sodium: 80 },
  fruit: { calories: 80, carbs: 20, fat: 0, protein: 1, sugar: 16, fiber: 2, sodium: 5 },
  cheese_plate: { calories: 400, carbs: 10, fat: 30, protein: 20, sugar: 3, fiber: 0, sodium: 800 },
  ham: { calories: 150, carbs: 2, fat: 8, protein: 18, sugar: 1, fiber: 0, sodium: 800 },
  chicken_tenders: { calories: 450, carbs: 25, fat: 25, protein: 30, sugar: 1, fiber: 1, sodium: 900 },
  fritter: { calories: 300, carbs: 30, fat: 16, protein: 10, sugar: 5, fiber: 1, sodium: 500 },
  salad: { calories: 350, carbs: 20, fat: 25, protein: 15, sugar: 8, fiber: 5, sodium: 600 },
  sauce: { calories: 50, carbs: 5, fat: 3, protein: 1, sugar: 2, fiber: 0, sodium: 200 },
  topping: { calories: 100, carbs: 8, fat: 6, protein: 3, sugar: 2, fiber: 0, sodium: 150 },
  dessert_bar: { calories: 250, carbs: 35, fat: 12, protein: 3, sugar: 22, fiber: 1, sodium: 120 },
  novelty: { calories: 0, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0 }, // non-food
  generic_beverage: { calories: 100, carbs: 25, fat: 0, protein: 0, sugar: 22, fiber: 0, sodium: 15 },
}

const PATTERNS: [RegExp, string][] = [
  // Non-food items
  [/novelty|straw|glow\s*cube|souvenir/i, 'novelty'],
  [/add[- ]?on|topping|dipping\s*sauce|signature\s*butter|floater/i, 'topping'],

  // Beverages
  [/50th\s*anniversary.*coffee|specialty\s*coffee/i, 'coffee'],
  [/italian\s*mineral\s*water|san\s*benedetto/i, 'zero'],
  [/^juice$|minute\s*maid/i, 'juice'],
  [/juice.*vodka/i, 'cocktail'],
  [/^milk$/i, 'milk'],
  [/teddy.*tea|earl\s*grey/i, 'tea'],
  [/truly.*seltzer|hard.*seltzer/i, 'seltzer'],
  [/frozen.*matcha|frozen.*granita|frose/i, 'frozen_drink'],
  [/assorted.*beverage|bottle.*can|bottled\s*beverage/i, 'generic_beverage'],

  // Cocktails with creative names
  [/black\s*jack|art\s*lover|bullfighter|cantaloupe|blush.*bubbly|freaujolais|forbidden\s*fruit|french\s*love|gardener.*fix|get\s*him|gillywater|green\s*stripe|iced\s*golden|immunilea|it'?s\s*a\s*gimlet|jiminy\s*cricket|ligurian|loch\s*down|mars\s*attack|moonshine|more\s*cacao|no,?\s*but|proud\s*mary|purple\s*reign|raisin.*daisies|rendezvous|scrap\s*paper|seasonal\s*mocktail|smokin.*honey|south\s*florida|sunset\s*haven|sweet\s*berry|fernet|white\s*christmas|written\s*in\s*winter|chak\s*shuka/i, 'cocktail'],

  // Wines
  [/^wines?$|chateau\s*miraval|on\s*tap.*sabine|on\s*tap.*vezzi/i, 'wine'],

  // Pizza
  [/4\s*cheese|sicilian.*cheese|funghi|spicy\s*pepperoni|italian\s*margherita|big\s*roman/i, 'pizza'],

  // Sandwiches
  [/ham\s*and\s*swiss|turkey\s*and\s*swiss|cuban|full\s*montagu|funky\s*chicken|grilled\s*cheeeee|italian.*ham.*salami/i, 'sandwich'],

  // Mac & cheese
  [/macaroni.*cheese|baked\s*mac/i, 'mac_cheese'],

  // Breakfast
  [/bradley.*grits/i, 'grits'],
  [/^bagels?$/i, 'danish'],
  [/^scones?$/i, 'scone'],
  [/^danish$/i, 'danish'],
  [/^croissant$/i, 'croissant'],
  [/^tarts?$/i, 'tart'],
  [/oat\s*bar|cherry\s*oat|strawberry\s*oat/i, 'oat_bar'],
  [/^eggs$/i, 'eggs'],
  [/^yogurt$/i, 'yogurt'],

  // Fruits
  [/^strawberries$|^pineapple$|^orange$/i, 'fruit'],
  [/fruit.*cheese|cheese.*fruit/i, 'cheese_plate'],
  [/lime.*frosted.*coconut|kakamora.*coconut/i, 'dessert_bar'],

  // Meats
  [/parma\s*cotto|lil.*brg/i, 'ham'],
  [/ham\s*fritter/i, 'fritter'],
  [/chicken\s*fritter|crispy.*tenders/i, 'chicken_tenders'],

  // Salads
  [/misticanza|veg\s*out|veggie/i, 'salad'],
  [/mozzarella.*tomato/i, 'cheese_plate'],

  // Cheese/dips
  [/melted\s*cheese|cheese.*dipping/i, 'sauce'],

  // Other
  [/^pickle$/i, 'topping'],
  [/seasonal\s*side/i, 'fruit'],
  [/snickerdoodle/i, 'danish'],
  [/poncho\s*adult/i, 'novelty'],
  [/trappings.*vanity/i, 'cocktail'],
  [/2026.*donut|blueberry.*pop.*tart/i, 'danish'],
  [/shrimp\s*topping/i, 'topping'],
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
  const nutrition = await fetchAll('nutritional_data', 'id, menu_item_id, calories')
  const menuItems = await fetchAll('menu_items', 'id, name, description')
  const menuMap = new Map(menuItems.map(m => [m.id, m]))

  const nullItems = nutrition.filter(n => n.calories === null)
  console.log(`Items with null calories: ${nullItems.length}\n`)

  let updated = 0
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
            .update({ ...template, source: 'crowdsourced', confidence_score: 25 })
            .eq('id', n.id)
          if (!error) {
            updated++
            matched = true
            console.log(`✓ ${name.slice(0, 50)} -> ${templateKey}`)
          }
          break
        }
      }
    }

    if (!matched && !unmatched.includes(name)) {
      unmatched.push(name)
    }
  }

  console.log(`\nUpdated: ${updated}`)
  console.log(`Still unmatched: ${unmatched.length}`)

  if (unmatched.length > 0) {
    console.log('\nRemaining unmatched:')
    unmatched.forEach(n => console.log(`  - ${n}`))
  }

  // Final stats
  const { data: stats } = await supabase.from('nutritional_data').select('calories')
  let withCal = 0, nullCal = 0
  for (const s of stats || []) {
    if (s.calories !== null && s.calories > 0) withCal++
    else nullCal++
  }
  console.log(`\n=== Final: ${withCal} with cal (${(withCal/(withCal+nullCal)*100).toFixed(1)}%), ${nullCal} null ===`)
}

main()
