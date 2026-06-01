/**
 * Smart nutrition estimation that:
 * 1. Sets zero calories for water/plain coffee/tea items
 * 2. Uses keyword matching for common items
 * 3. Falls back to AI for complex items
 */

import { createClient } from '@supabase/supabase-js'
import Groq from 'groq-sdk'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local
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

const url = envVars['SUPABASE_URL'] || process.env.SUPABASE_URL!
const key = envVars['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY!
const groqKey = envVars['GROQ_API_KEY'] || process.env.GROQ_API_KEY

const supabase = createClient(url, key)
const groq = groqKey ? new Groq({ apiKey: groqKey }) : null

// Zero-calorie patterns - these get 0 across the board
const ZERO_CALORIE_PATTERNS = [
  /^bottled\s*water/i,
  /^water$/i,
  /^premium\s*(bottled\s*)?water/i,
  /^sparkling\s*water/i,
  /^mineral\s*water/i,
  /^spring\s*water/i,
  /^perrier/i,
  /^evian/i,
  /^smartwater/i,
  /^dasani/i,
  /^aquafina/i,
  /h2o.*water/i,
  /courtesy.*water/i,
  /^small\s*water/i,
  /^black\s*coffee$/i,
  /^brewed\s*coffee$/i,
  /^coffee$/i,
  /^hot\s*coffee$/i,
  /^decaf\s*coffee$/i,
  /^espresso$/i,
  /^double\s*espresso$/i,
  /^americano$/i,
  /^black\s*tea$/i,
  /^hot\s*tea$/i,
  /^iced\s*tea\s*\(unsweetened\)/i,
  /^unsweetened\s*tea/i,
  /^green\s*tea$/i,
  /^herbal\s*tea$/i,
  /diet\s+(coke|pepsi|soda|sprite)/i,
  /coke\s*zero/i,
  /zero\s*sugar/i,
  /sugar[- ]?free/i,
]

// Keyword-based nutrition templates
const NUTRITION_TEMPLATES: Record<string, { calories: number; carbs: number; fat: number; protein: number; sugar: number; fiber: number; sodium: number }> = {
  // Beverages with calories
  'regular_soda': { calories: 140, carbs: 39, fat: 0, protein: 0, sugar: 39, fiber: 0, sodium: 45 },
  'lemonade': { calories: 120, carbs: 31, fat: 0, protein: 0, sugar: 28, fiber: 0, sodium: 10 },
  'orange_juice': { calories: 110, carbs: 26, fat: 0, protein: 2, sugar: 22, fiber: 0, sodium: 0 },
  'apple_juice': { calories: 120, carbs: 29, fat: 0, protein: 0, sugar: 24, fiber: 0, sodium: 10 },
  'milk_2pct': { calories: 120, carbs: 12, fat: 5, protein: 8, sugar: 12, fiber: 0, sodium: 120 },
  'chocolate_milk': { calories: 190, carbs: 26, fat: 5, protein: 8, sugar: 24, fiber: 1, sodium: 150 },
  'smoothie': { calories: 280, carbs: 55, fat: 4, protein: 6, sugar: 45, fiber: 3, sodium: 60 },
  'milkshake': { calories: 550, carbs: 75, fat: 22, protein: 12, sugar: 65, fiber: 1, sodium: 250 },
  'latte': { calories: 190, carbs: 18, fat: 7, protein: 13, sugar: 17, fiber: 0, sodium: 170 },
  'cappuccino': { calories: 120, carbs: 10, fat: 4, protein: 8, sugar: 10, fiber: 0, sodium: 100 },
  'mocha': { calories: 290, carbs: 35, fat: 11, protein: 13, sugar: 30, fiber: 2, sodium: 150 },
  'frappuccino': { calories: 380, carbs: 55, fat: 15, protein: 5, sugar: 50, fiber: 0, sodium: 220 },
  'hot_chocolate': { calories: 320, carbs: 45, fat: 12, protein: 10, sugar: 40, fiber: 2, sodium: 200 },
  'beer': { calories: 150, carbs: 13, fat: 0, protein: 2, sugar: 0, fiber: 0, sodium: 14 },
  'light_beer': { calories: 100, carbs: 5, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 10 },
  'wine': { calories: 125, carbs: 4, fat: 0, protein: 0, sugar: 1, fiber: 0, sodium: 5 },
  'cocktail': { calories: 200, carbs: 15, fat: 0, protein: 0, sugar: 12, fiber: 0, sodium: 10 },
  'margarita': { calories: 280, carbs: 36, fat: 0, protein: 0, sugar: 32, fiber: 0, sodium: 580 },
  'mimosa': { calories: 120, carbs: 12, fat: 0, protein: 0, sugar: 10, fiber: 0, sodium: 5 },

  // Snacks
  'chips': { calories: 160, carbs: 15, fat: 10, protein: 2, sugar: 0, fiber: 1, sodium: 170 },
  'popcorn': { calories: 400, carbs: 48, fat: 24, protein: 5, sugar: 0, fiber: 8, sodium: 600 },
  'pretzel': { calories: 480, carbs: 100, fat: 4, protein: 12, sugar: 4, fiber: 4, sodium: 1200 },
  'churro': { calories: 280, carbs: 35, fat: 14, protein: 3, sugar: 12, fiber: 1, sodium: 200 },
  'cookie': { calories: 200, carbs: 28, fat: 9, protein: 2, sugar: 16, fiber: 1, sodium: 120 },
  'brownie': { calories: 350, carbs: 45, fat: 18, protein: 4, sugar: 30, fiber: 2, sodium: 150 },
  'muffin': { calories: 380, carbs: 55, fat: 15, protein: 6, sugar: 28, fiber: 2, sodium: 350 },
  'donut': { calories: 280, carbs: 35, fat: 15, protein: 4, sugar: 15, fiber: 1, sodium: 300 },
  'cupcake': { calories: 350, carbs: 50, fat: 15, protein: 3, sugar: 35, fiber: 1, sodium: 280 },
  'cake_slice': { calories: 400, carbs: 55, fat: 18, protein: 5, sugar: 40, fiber: 1, sodium: 350 },
  'ice_cream_scoop': { calories: 200, carbs: 24, fat: 11, protein: 3, sugar: 21, fiber: 0, sodium: 60 },
  'ice_cream_sundae': { calories: 500, carbs: 65, fat: 24, protein: 8, sugar: 55, fiber: 1, sodium: 180 },

  // Entrees
  'burger': { calories: 650, carbs: 45, fat: 35, protein: 30, sugar: 8, fiber: 2, sodium: 1000 },
  'cheeseburger': { calories: 750, carbs: 45, fat: 42, protein: 35, sugar: 8, fiber: 2, sodium: 1200 },
  'hot_dog': { calories: 350, carbs: 35, fat: 18, protein: 12, sugar: 5, fiber: 1, sodium: 900 },
  'pizza_slice': { calories: 300, carbs: 35, fat: 12, protein: 12, sugar: 4, fiber: 2, sodium: 600 },
  'sandwich': { calories: 500, carbs: 45, fat: 22, protein: 25, sugar: 6, fiber: 3, sodium: 1100 },
  'wrap': { calories: 550, carbs: 50, fat: 25, protein: 28, sugar: 4, fiber: 4, sodium: 1200 },
  'taco': { calories: 200, carbs: 20, fat: 10, protein: 10, sugar: 2, fiber: 2, sodium: 400 },
  'burrito': { calories: 700, carbs: 75, fat: 28, protein: 30, sugar: 4, fiber: 8, sodium: 1400 },
  'quesadilla': { calories: 550, carbs: 40, fat: 32, protein: 25, sugar: 3, fiber: 3, sodium: 1100 },
  'nachos': { calories: 600, carbs: 55, fat: 35, protein: 18, sugar: 4, fiber: 6, sodium: 1200 },
  'chicken_tenders': { calories: 450, carbs: 25, fat: 25, protein: 30, sugar: 1, fiber: 1, sodium: 900 },
  'chicken_sandwich': { calories: 550, carbs: 45, fat: 26, protein: 32, sugar: 6, fiber: 2, sodium: 1100 },
  'grilled_chicken': { calories: 300, carbs: 2, fat: 12, protein: 45, sugar: 0, fiber: 0, sodium: 600 },
  'fish_and_chips': { calories: 800, carbs: 70, fat: 42, protein: 35, sugar: 3, fiber: 4, sodium: 1000 },
  'fried_shrimp': { calories: 400, carbs: 30, fat: 22, protein: 20, sugar: 2, fiber: 1, sodium: 800 },
  'steak': { calories: 450, carbs: 0, fat: 25, protein: 55, sugar: 0, fiber: 0, sodium: 500 },
  'ribs': { calories: 700, carbs: 15, fat: 45, protein: 55, sugar: 12, fiber: 0, sodium: 900 },
  'pulled_pork': { calories: 400, carbs: 20, fat: 22, protein: 35, sugar: 15, fiber: 1, sodium: 800 },
  'bbq_platter': { calories: 1100, carbs: 60, fat: 55, protein: 80, sugar: 25, fiber: 4, sodium: 1800 },
  'pasta': { calories: 650, carbs: 85, fat: 22, protein: 20, sugar: 8, fiber: 4, sodium: 900 },
  'mac_and_cheese': { calories: 500, carbs: 45, fat: 28, protein: 18, sugar: 6, fiber: 2, sodium: 900 },
  'salad': { calories: 350, carbs: 20, fat: 25, protein: 15, sugar: 8, fiber: 5, sodium: 600 },
  'soup': { calories: 250, carbs: 25, fat: 12, protein: 10, sugar: 6, fiber: 3, sodium: 900 },

  // Sides
  'fries': { calories: 400, carbs: 50, fat: 20, protein: 5, sugar: 0, fiber: 4, sodium: 350 },
  'onion_rings': { calories: 450, carbs: 55, fat: 24, protein: 6, sugar: 6, fiber: 3, sodium: 600 },
  'mashed_potatoes': { calories: 200, carbs: 30, fat: 8, protein: 4, sugar: 2, fiber: 3, sodium: 400 },
  'baked_beans': { calories: 180, carbs: 32, fat: 2, protein: 8, sugar: 12, fiber: 6, sodium: 500 },
  'coleslaw': { calories: 150, carbs: 12, fat: 12, protein: 1, sugar: 8, fiber: 2, sodium: 200 },
  'corn': { calories: 120, carbs: 25, fat: 2, protein: 4, sugar: 5, fiber: 3, sodium: 15 },
  'rice': { calories: 200, carbs: 45, fat: 0, protein: 4, sugar: 0, fiber: 1, sodium: 5 },
  'bread': { calories: 150, carbs: 28, fat: 2, protein: 5, sugar: 3, fiber: 2, sodium: 250 },

  // Breakfast
  'pancakes': { calories: 450, carbs: 65, fat: 15, protein: 10, sugar: 15, fiber: 2, sodium: 700 },
  'waffles': { calories: 400, carbs: 55, fat: 16, protein: 8, sugar: 12, fiber: 2, sodium: 600 },
  'french_toast': { calories: 450, carbs: 50, fat: 20, protein: 12, sugar: 20, fiber: 2, sodium: 500 },
  'eggs': { calories: 180, carbs: 2, fat: 12, protein: 14, sugar: 1, fiber: 0, sodium: 350 },
  'bacon': { calories: 180, carbs: 0, fat: 14, protein: 12, sugar: 0, fiber: 0, sodium: 600 },
  'sausage': { calories: 250, carbs: 2, fat: 22, protein: 12, sugar: 1, fiber: 0, sodium: 500 },
  'breakfast_sandwich': { calories: 450, carbs: 35, fat: 25, protein: 22, sugar: 4, fiber: 2, sodium: 900 },

  // Fruits
  'fruit_cup': { calories: 80, carbs: 20, fat: 0, protein: 1, sugar: 16, fiber: 2, sodium: 5 },
  'apple': { calories: 95, carbs: 25, fat: 0, protein: 0, sugar: 19, fiber: 4, sodium: 2 },
  'banana': { calories: 105, carbs: 27, fat: 0, protein: 1, sugar: 14, fiber: 3, sodium: 1 },
  'grapes': { calories: 100, carbs: 27, fat: 0, protein: 1, sugar: 23, fiber: 1, sodium: 3 },
}

// Pattern to template mapping
const TEMPLATE_PATTERNS: [RegExp, string][] = [
  // Beverages
  [/soda|cola|sprite|fanta|root beer|dr pepper|pepsi|coke(?!\s*zero)/i, 'regular_soda'],
  [/lemonade/i, 'lemonade'],
  [/orange\s*juice/i, 'orange_juice'],
  [/apple\s*juice/i, 'apple_juice'],
  [/2%\s*milk|lowfat\s*milk/i, 'milk_2pct'],
  [/chocolate\s*milk/i, 'chocolate_milk'],
  [/smoothie/i, 'smoothie'],
  [/shake|milkshake/i, 'milkshake'],
  [/latte/i, 'latte'],
  [/cappuccino/i, 'cappuccino'],
  [/mocha/i, 'mocha'],
  [/frappuccino|frappe/i, 'frappuccino'],
  [/hot\s*(chocolate|cocoa)/i, 'hot_chocolate'],
  [/\b(beer|ale|lager|stout|porter|ipa|pilsner)\b/i, 'beer'],
  [/light\s*(beer|lager)/i, 'light_beer'],
  [/\bwine\b/i, 'wine'],
  [/cocktail|mixed\s*drink/i, 'cocktail'],
  [/margarita/i, 'margarita'],
  [/mimosa|bellini/i, 'mimosa'],

  // Snacks
  [/\bchips?\b/i, 'chips'],
  [/popcorn/i, 'popcorn'],
  [/pretzel/i, 'pretzel'],
  [/churro/i, 'churro'],
  [/cookie/i, 'cookie'],
  [/brownie/i, 'brownie'],
  [/muffin/i, 'muffin'],
  [/donut|doughnut/i, 'donut'],
  [/cupcake/i, 'cupcake'],
  [/cake/i, 'cake_slice'],
  [/sundae/i, 'ice_cream_sundae'],
  [/ice\s*cream|gelato/i, 'ice_cream_scoop'],

  // Entrees
  [/cheeseburger/i, 'cheeseburger'],
  [/burger|hamburger/i, 'burger'],
  [/hot\s*dog|corn\s*dog/i, 'hot_dog'],
  [/pizza/i, 'pizza_slice'],
  [/sandwich|sub|hoagie|panini/i, 'sandwich'],
  [/wrap|burrito/i, 'wrap'],
  [/taco/i, 'taco'],
  [/quesadilla/i, 'quesadilla'],
  [/nacho/i, 'nachos'],
  [/chicken\s*(tender|finger|nugget|strip)/i, 'chicken_tenders'],
  [/chicken\s*sandwich/i, 'chicken_sandwich'],
  [/grilled\s*chicken/i, 'grilled_chicken'],
  [/fish\s*(and|&|'?n'?)\s*chips/i, 'fish_and_chips'],
  [/fried\s*shrimp|shrimp\s*basket/i, 'fried_shrimp'],
  [/steak|filet|sirloin|ribeye/i, 'steak'],
  [/ribs?/i, 'ribs'],
  [/pulled\s*pork/i, 'pulled_pork'],
  [/bbq\s*platter|bbq\s*combo/i, 'bbq_platter'],
  [/pasta|spaghetti|fettuccine|penne/i, 'pasta'],
  [/mac\s*(and|&|'?n'?)\s*cheese/i, 'mac_and_cheese'],
  [/salad/i, 'salad'],
  [/soup|chowder/i, 'soup'],

  // Sides
  [/fries|french\s*fries/i, 'fries'],
  [/onion\s*rings?/i, 'onion_rings'],
  [/mashed\s*potatoes?/i, 'mashed_potatoes'],
  [/baked\s*beans?/i, 'baked_beans'],
  [/coleslaw|cole\s*slaw/i, 'coleslaw'],
  [/\bcorn\b/i, 'corn'],
  [/\brice\b/i, 'rice'],
  [/bread|roll|biscuit/i, 'bread'],

  // Breakfast
  [/pancake/i, 'pancakes'],
  [/waffle/i, 'waffles'],
  [/french\s*toast/i, 'french_toast'],
  [/scrambled\s*eggs?|eggs?\s*benedict/i, 'eggs'],
  [/bacon/i, 'bacon'],
  [/sausage/i, 'sausage'],
  [/breakfast\s*sandwich/i, 'breakfast_sandwich'],

  // Fruits
  [/fruit\s*cup|mixed\s*fruit/i, 'fruit_cup'],
  [/\bapple\b(?!\s*juice)/i, 'apple'],
  [/banana/i, 'banana'],
  [/grapes/i, 'grapes'],
]

async function fetchAll(table: string, select: string): Promise<any[]> {
  const all: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999)
    if (error) { console.error(`Error fetching ${table}:`, error.message); break }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

async function main() {
  console.log('Fetching items with null calories...\n')

  // Get items with null calories
  const nutritionData = await fetchAll('nutritional_data', 'id, menu_item_id, calories')
  const nullCalorieItems = nutritionData.filter(n => n.calories === null)
  console.log(`Items with null calories: ${nullCalorieItems.length}`)

  // Get menu item details
  const menuItems = await fetchAll('menu_items', 'id, name, description, category')
  const menuItemMap = new Map(menuItems.map(m => [m.id, m]))

  let zeroCalorieCount = 0
  let keywordCount = 0
  let needsAiCount = 0
  const needsAi: any[] = []

  for (const nutrition of nullCalorieItems) {
    const menuItem = menuItemMap.get(nutrition.menu_item_id)
    if (!menuItem) continue

    const name = (menuItem.name || '').trim()
    const text = `${name} ${menuItem.description || ''}`.toLowerCase()

    // Check if zero-calorie item
    const isZeroCalorie = ZERO_CALORIE_PATTERNS.some(pattern => pattern.test(name))
    if (isZeroCalorie) {
      // Set to zero
      const { error } = await supabase.from('nutritional_data')
        .update({
          calories: 0,
          carbs: 0,
          fat: 0,
          protein: 0,
          sugar: 0,
          fiber: 0,
          sodium: 0,
          source: 'crowdsourced',
          confidence_score: 90
        })
        .eq('id', nutrition.id)

      if (!error) zeroCalorieCount++
      continue
    }

    // Check keyword templates
    let matched = false
    for (const [pattern, templateKey] of TEMPLATE_PATTERNS) {
      if (pattern.test(text)) {
        const template = NUTRITION_TEMPLATES[templateKey]
        if (template) {
          const { error } = await supabase.from('nutritional_data')
            .update({
              ...template,
              source: 'crowdsourced',
              confidence_score: 30
            })
            .eq('id', nutrition.id)

          if (!error) keywordCount++
          matched = true
          break
        }
      }
    }

    if (!matched) {
      needsAi.push({ nutrition, menuItem })
      needsAiCount++
    }
  }

  console.log(`\nPhase 1 Results:`)
  console.log(`  Zero-calorie items updated: ${zeroCalorieCount}`)
  console.log(`  Keyword-matched items updated: ${keywordCount}`)
  console.log(`  Items still needing estimation: ${needsAiCount}`)

  // If we have Groq API key and items needing AI
  if (groq && needsAi.length > 0) {
    console.log(`\nPhase 2: AI Estimation for ${needsAi.length} items...`)

    const BATCH_SIZE = 5
    const DELAY = 4000 // 4 seconds between batches
    let aiEstimated = 0

    for (let i = 0; i < Math.min(needsAi.length, 100); i += BATCH_SIZE) { // Limit to 100 for now
      const batch = needsAi.slice(i, i + BATCH_SIZE)
      console.log(`  Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(Math.min(needsAi.length, 100) / BATCH_SIZE)}...`)

      for (const { nutrition, menuItem } of batch) {
        try {
          const prompt = `Estimate nutrition for this theme park food item. Return ONLY a JSON object with these exact keys: calories, carbs, fat, protein, sugar, fiber, sodium. All values should be integers.

Item: ${menuItem.name}
Description: ${menuItem.description || 'No description'}
Category: ${menuItem.category}

Theme park portions are typically 1.5-2x restaurant portions. Consider this when estimating.`

          const response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 200,
          })

          const content = response.choices[0]?.message?.content || ''
          const jsonMatch = content.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0])
            if (parsed.calories && parsed.calories >= 10 && parsed.calories <= 3000) {
              const { error } = await supabase.from('nutritional_data')
                .update({
                  calories: Math.round(parsed.calories),
                  carbs: Math.round(parsed.carbs || 0),
                  fat: Math.round(parsed.fat || 0),
                  protein: Math.round(parsed.protein || 0),
                  sugar: Math.round(parsed.sugar || 0),
                  fiber: Math.round(parsed.fiber || 0),
                  sodium: Math.round(parsed.sodium || 0),
                  source: 'crowdsourced',
                  confidence_score: 35
                })
                .eq('id', nutrition.id)

              if (!error) aiEstimated++
            }
          }
        } catch (error: any) {
          if (error?.status === 429) {
            console.log(`    Rate limited, waiting 30s...`)
            await new Promise(r => setTimeout(r, 30000))
            i -= BATCH_SIZE // Retry this batch
            break
          }
          // Skip other errors silently
        }
      }

      // Delay between batches
      if (i + BATCH_SIZE < needsAi.length) {
        await new Promise(r => setTimeout(r, DELAY))
      }
    }

    console.log(`  AI estimated: ${aiEstimated} items`)
  } else if (!groq) {
    console.log('\nNote: GROQ_API_KEY not set. Skipping AI estimation.')
    console.log('Get a free API key from: https://console.groq.com/keys')
  }

  // Final stats
  const { data: finalStats } = await supabase
    .from('nutritional_data')
    .select('calories')

  let withCal = 0
  let nullCal = 0
  for (const n of finalStats || []) {
    if (n.calories !== null && n.calories > 0) withCal++
    else nullCal++
  }

  console.log(`\n=== Final Coverage ===`)
  console.log(`Items with calories > 0: ${withCal} (${(withCal / (withCal + nullCal) * 100).toFixed(1)}%)`)
  console.log(`Items with null/zero calories: ${nullCal}`)
}

main().catch(console.error)
