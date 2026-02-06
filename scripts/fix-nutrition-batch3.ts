/**
 * Food Scientist Review - Batch 3: Fat=0 Fried Items & Sugar>Carbs Fixes
 * These items have nutritionally impossible values.
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

const supabase = createClient(
  envVars['SUPABASE_URL'] || process.env.SUPABASE_URL!,
  envVars['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Fix {
  id: string
  name: string
  reasoning: string
  calories: number
  carbs: number
  fat: number
  protein: number
  sugar: number
  fiber: number
  sodium: number
  confidence_score: number
}

const fixes: Fix[] = [
  // ========== SUGAR > CARBS FIXES (Impossible) ==========
  {
    id: "d0a8e5f2-xxxx", // Placeholder - need to find actual ID
    name: "Kimchee FC (Bend the Bao)",
    reasoning: "Fried chicken bao with kimchee butter. Bao bun ~120 cal, fried chicken ~180 cal, kimchee butter ~50 cal. Carbs were 0 which is impossible for a bao bun.",
    calories: 420, carbs: 38, fat: 22, protein: 18, sugar: 4, fiber: 2, sodium: 780,
    confidence_score: 55
  },
  {
    id: "xxx-new-delhi", // Need actual ID
    name: "New Delhi Poutine (The Daily Poutine)",
    reasoning: "Indian-spiced poutine with fries, curry gravy, cheese curds. Sugar was 23g, carbs 22g - fixing sugar to be less than carbs.",
    calories: 580, carbs: 52, fat: 32, protein: 14, sugar: 8, fiber: 4, sodium: 1100,
    confidence_score: 55
  },
  {
    id: "xxx-bammy", // Need actual ID
    name: "Bammy (Bob Marley)",
    reasoning: "Jamaican cassava flatbread. Carbs were 0 but cassava is pure starch. Traditional bammy ~240 cal, mostly carbs.",
    calories: 240, carbs: 52, fat: 2, protein: 2, sugar: 2, fiber: 4, sodium: 180,
    confidence_score: 55
  },

  // ========== FRIED ITEMS WITH FAT=0 ==========
  {
    id: "xxx-fried-shrimp", // Need actual ID
    name: "Fried Shrimp N' Chips (Cookes of Dublin)",
    reasoning: "Beer-battered fried shrimp with chips (fries). Fried seafood + fries = significant fat. ~500-600 cal total.",
    calories: 580, carbs: 52, fat: 28, protein: 24, sugar: 2, fiber: 3, sodium: 980,
    confidence_score: 55
  },
  {
    id: "xxx-air-pirate", // Need actual ID
    name: "Air Pirate's Pretzel (Jock Lindsey's)",
    reasoning: "Large pretzel with beer cheese fondue. Pretzel ~400 cal + cheese fondue ~200 cal. Fat is significant from cheese.",
    calories: 620, carbs: 72, fat: 28, protein: 18, sugar: 4, fiber: 2, sodium: 1450,
    confidence_score: 55
  },
  {
    id: "xxx-crispy-chicken-edison", // Need actual ID
    name: "Crispy Fried Chicken (The Edison)",
    reasoning: "Southern fried chicken with mashed potatoes. Fried chicken is ~40% fat by calories. Theme park portion.",
    calories: 980, carbs: 58, fat: 52, protein: 62, sugar: 4, fiber: 3, sodium: 1650,
    confidence_score: 55
  },
  {
    id: "xxx-bangers-poutine", // Need actual ID
    name: "Bangers Poutine (The Daily Poutine)",
    reasoning: "Fries + sausage + gravy + cheese curds. Classic poutine with meat. Fat=0 is impossible.",
    calories: 780, carbs: 62, fat: 45, protein: 28, sugar: 3, fiber: 4, sodium: 1380,
    confidence_score: 55
  },
  {
    id: "xxx-hop-salt", // Need actual ID
    name: "Hop Salt Pretzel (Polite Pig)",
    reasoning: "Pretzel with beer cheese fondue. Similar to Air Pirate's but at different restaurant.",
    calories: 580, carbs: 68, fat: 26, protein: 16, sugar: 4, fiber: 2, sodium: 1320,
    confidence_score: 55
  },
  {
    id: "xxx-grilled-cheese", // Need actual ID
    name: "Old-Fashioned Grilled Cheese (Starbucks)",
    reasoning: "Toasted cheese sandwich. Bread ~200 cal, cheese ~200 cal, butter ~100 cal. Cheese has significant fat.",
    calories: 520, carbs: 42, fat: 32, protein: 18, sugar: 4, fiber: 2, sodium: 980,
    confidence_score: 60
  },
  {
    id: "xxx-brussels", // Need actual ID
    name: "Crispy Brussels Sprouts (Black Tap)",
    reasoning: "Fried brussels sprouts appetizer. 43 cal with 0 fat is impossible for fried food. Typical ~250-350 cal.",
    calories: 320, carbs: 28, fat: 22, protein: 8, sugar: 6, fiber: 6, sodium: 480,
    confidence_score: 55
  },

  // ========== VOODOO DOUGHNUT ITEMS ==========
  {
    id: "xxx-buttermilk-bar", // Need actual ID
    name: "Old Fashioned Buttermilk Bar (Voodoo)",
    reasoning: "Classic buttermilk doughnut bar with glaze. Voodoo donuts are substantial. ~450-500 cal based on size.",
    calories: 480, carbs: 58, fat: 26, protein: 6, sugar: 32, fiber: 1, sodium: 380,
    confidence_score: 60
  },
  {
    id: "xxx-maple-old", // Need actual ID
    name: "Maple Old Fashioned (Voodoo)",
    reasoning: "Buttermilk cake donut with maple frosting. Similar to buttermilk bar.",
    calories: 420, carbs: 52, fat: 22, protein: 5, sugar: 28, fiber: 1, sodium: 340,
    confidence_score: 60
  },

  // ========== BURGERS WITH FAT=0 ==========
  {
    id: "xxx-all-american", // Need actual ID
    name: "All American Burger (Bread Box)",
    reasoning: "Beef patty, bacon, American cheese. Burgers are 40-50% fat by calories. 300 cal with 0 fat is impossible.",
    calories: 850, carbs: 48, fat: 48, protein: 42, sugar: 6, fiber: 2, sodium: 1280,
    confidence_score: 55
  },
  {
    id: "xxx-red-dragon", // Need actual ID
    name: "Red Dragon Bacon Cheeseburger (Finnegan's)",
    reasoning: "Burger with fried pickle, cheddar, bacon. Heavy toppings. 68 cal with 0 fat is absurdly wrong.",
    calories: 920, carbs: 52, fat: 52, protein: 48, sugar: 8, fiber: 3, sodium: 1450,
    confidence_score: 55
  },
  {
    id: "xxx-birria", // Need actual ID
    name: "Birria Bistro Burger (NBC Sports)",
    reasoning: "Beef burger with melted Oaxaca cheese. 333 cal with 67g carbs and 0 fat is nutritionally impossible.",
    calories: 920, carbs: 58, fat: 48, protein: 52, sugar: 6, fiber: 3, sodium: 1380,
    confidence_score: 55
  },
  {
    id: "xxx-maple-bourbon", // Need actual ID
    name: "Maple Bourbon BBQ Pulled Pork (Comic Strip)",
    reasoning: "Pulled pork with smoked gouda/cheddar sauce and fries. Cheese sauce + pork + fries = significant fat.",
    calories: 780, carbs: 62, fat: 38, protein: 42, sugar: 18, fiber: 3, sodium: 1520,
    confidence_score: 55
  },

  // ========== CRUISE SHIP DOVER SOLE (Multiple) ==========
  {
    id: "xxx-dover-dream", // Need actual ID
    name: "Dover Sole Meunière (Remy - Disney Dream)",
    reasoning: "Same dish as other Remy locations. Pan-fried sole in brown butter.",
    calories: 420, carbs: 4, fat: 28, protein: 38, sugar: 0, fiber: 0, sodium: 480,
    confidence_score: 60
  },
  {
    id: "xxx-dover-treasure", // Need actual ID
    name: "Dover Sole (Enchanté - Disney Treasure)",
    reasoning: "Pan-seared Dover sole with brown butter. Fine dining portion.",
    calories: 420, carbs: 4, fat: 28, protein: 38, sugar: 0, fiber: 0, sodium: 480,
    confidence_score: 60
  },
  {
    id: "xxx-dover-wish", // Need actual ID
    name: "Dover Sole (Enchanté - Disney Wish)",
    reasoning: "Pan-seared Dover sole with brown butter. Fine dining portion.",
    calories: 420, carbs: 4, fat: 28, protein: 38, sugar: 0, fiber: 0, sodium: 480,
    confidence_score: 60
  },

  // ========== RANCHERA AND MEXICAN ITEMS ==========
  {
    id: "xxx-ranchera", // Need actual ID
    name: "Ranchera (Antojitos)",
    reasoning: "Melted Oaxaca cheese, queso fresco. 45 cal with 0 fat is impossible - cheese is ~70% fat by calories.",
    calories: 380, carbs: 28, fat: 24, protein: 18, sugar: 4, fiber: 2, sodium: 820,
    confidence_score: 55
  },
  {
    id: "xxx-tostada-cangrejo", // From earlier batch but reconfirming
    name: "Tostada de Cangrejo (El Artista Hambriento)",
    reasoning: "Crispy tortilla with guacamole, crab, mango. Avocado/guac has significant fat. 1027 cal was too high.",
    calories: 420, carbs: 38, fat: 22, protein: 18, sugar: 8, fiber: 5, sodium: 680,
    confidence_score: 55
  },
]

// We need to find the actual IDs first
async function findAndFixItems() {
  console.log('Finding items by name pattern and fixing...\n')

  // Define patterns to search and their fixes
  const searchPatterns = [
    { pattern: 'Kimchee FC', fix: { calories: 420, carbs: 38, fat: 22, protein: 18, sugar: 4, fiber: 2, sodium: 780, confidence_score: 55 } },
    { pattern: 'New Delhi Poutine', fix: { calories: 580, carbs: 52, fat: 32, protein: 14, sugar: 8, fiber: 4, sodium: 1100, confidence_score: 55 } },
    { pattern: 'Bammy', fix: { calories: 240, carbs: 52, fat: 2, protein: 2, sugar: 2, fiber: 4, sodium: 180, confidence_score: 55 } },
    { pattern: 'Fried Shrimp N%Chips', fix: { calories: 580, carbs: 52, fat: 28, protein: 24, sugar: 2, fiber: 3, sodium: 980, confidence_score: 55 } },
    { pattern: "Air Pirate's Pretzel", fix: { calories: 620, carbs: 72, fat: 28, protein: 18, sugar: 4, fiber: 2, sodium: 1450, confidence_score: 55 } },
    { pattern: 'Crispy Fried Chicken', fix: { calories: 980, carbs: 58, fat: 52, protein: 62, sugar: 4, fiber: 3, sodium: 1650, confidence_score: 55 } },
    { pattern: 'Bangers Poutine', fix: { calories: 780, carbs: 62, fat: 45, protein: 28, sugar: 3, fiber: 4, sodium: 1380, confidence_score: 55 } },
    { pattern: 'Hop Salt Pretzel', fix: { calories: 580, carbs: 68, fat: 26, protein: 16, sugar: 4, fiber: 2, sodium: 1320, confidence_score: 55 } },
    { pattern: 'Old-Fashioned Grilled Cheese', fix: { calories: 520, carbs: 42, fat: 32, protein: 18, sugar: 4, fiber: 2, sodium: 980, confidence_score: 60 } },
    { pattern: 'Crispy Brussels Sprouts', fix: { calories: 320, carbs: 28, fat: 22, protein: 8, sugar: 6, fiber: 6, sodium: 480, confidence_score: 55 } },
    { pattern: 'Old Fashioned Buttermilk Bar', fix: { calories: 480, carbs: 58, fat: 26, protein: 6, sugar: 32, fiber: 1, sodium: 380, confidence_score: 60 } },
    { pattern: 'Maple Old Fashioned', fix: { calories: 420, carbs: 52, fat: 22, protein: 5, sugar: 28, fiber: 1, sodium: 340, confidence_score: 60 } },
    { pattern: 'All American Burger', fix: { calories: 850, carbs: 48, fat: 48, protein: 42, sugar: 6, fiber: 2, sodium: 1280, confidence_score: 55 } },
    { pattern: 'Red Dragon Bacon Cheeseburger', fix: { calories: 920, carbs: 52, fat: 52, protein: 48, sugar: 8, fiber: 3, sodium: 1450, confidence_score: 55 } },
    { pattern: 'Birria Bistro Burger', fix: { calories: 920, carbs: 58, fat: 48, protein: 52, sugar: 6, fiber: 3, sodium: 1380, confidence_score: 55 } },
    { pattern: 'Maple Bourbon BBQ Pulled Pork', fix: { calories: 780, carbs: 62, fat: 38, protein: 42, sugar: 18, fiber: 3, sodium: 1520, confidence_score: 55 } },
    { pattern: 'Ranchera', restaurant: 'Antojitos', fix: { calories: 380, carbs: 28, fat: 24, protein: 18, sugar: 4, fiber: 2, sodium: 820, confidence_score: 55 } },
    { pattern: 'Tostada de Cangrejo', fix: { calories: 420, carbs: 38, fat: 22, protein: 18, sugar: 8, fiber: 5, sodium: 680, confidence_score: 55 } },
    { pattern: 'Dirty Pearls', fix: { calories: 180, carbs: 4, fat: 8, protein: 2, sugar: 2, fiber: 0, sodium: 450, confidence_score: 55 } },
    { pattern: 'Boathouse Bloody Mary', fix: { calories: 200, carbs: 12, fat: 4, protein: 2, sugar: 8, fiber: 1, sodium: 980, confidence_score: 55 } },
  ]

  let updated = 0
  let notFound = 0

  for (const item of searchPatterns) {
    // Find the menu item
    let query = supabase
      .from('menu_items')
      .select('id, name')
      .ilike('name', `%${item.pattern}%`)

    const { data: menuItems, error: findError } = await query.limit(5)

    if (findError || !menuItems?.length) {
      console.log(`NOT FOUND: ${item.pattern}`)
      notFound++
      continue
    }

    for (const menuItem of menuItems) {
      // Get the nutritional_data ID
      const { data: nutData, error: nutError } = await supabase
        .from('nutritional_data')
        .select('id, calories, fat')
        .eq('menu_item_id', menuItem.id)
        .single()

      if (nutError || !nutData) {
        console.log(`  No nutrition data for: ${menuItem.name}`)
        continue
      }

      // Only fix if fat is 0 or calories seem wrong
      if (nutData.fat === 0 || nutData.calories < 50) {
        console.log(`Fixing: ${menuItem.name}`)
        console.log(`  Old: ${nutData.calories} cal, ${nutData.fat}g fat`)
        console.log(`  New: ${item.fix.calories} cal, ${item.fix.fat}g fat`)

        const { error: updateError } = await supabase
          .from('nutritional_data')
          .update({
            ...item.fix,
            source: 'crowdsourced'
          })
          .eq('id', nutData.id)

        if (updateError) {
          console.log(`  ERROR: ${updateError.message}`)
        } else {
          console.log(`  SUCCESS`)
          updated++
        }
      } else {
        console.log(`SKIP (already has data): ${menuItem.name} - ${nutData.calories} cal, ${nutData.fat}g fat`)
      }
    }
    console.log('')
  }

  console.log('=== BATCH 3 COMPLETE ===')
  console.log(`Updated: ${updated}`)
  console.log(`Not Found: ${notFound}`)
}

findAndFixItems().catch(console.error)
