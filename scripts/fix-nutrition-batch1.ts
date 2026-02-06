/**
 * Food Scientist Review - Batch 1: Critical and High Priority Fixes
 *
 * These items have clearly incorrect nutrition data that needs correction
 * based on ingredient analysis and comparison to similar items.
 */

import { createClient } from '@supabase/supabase-js'
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

const url = envVars['SUPABASE_URL'] || process.env.SUPABASE_URL
const key = envVars['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

interface NutritionFix {
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

// Food scientist estimates based on ingredient analysis and portion sizes
const fixes: NutritionFix[] = [
  // ========== SAVORY FOOD ITEMS ==========
  {
    id: "93fec41a-9949-42c1-bb9e-7ce4a35828ed",
    name: "Mini Pie Combination (Leaky Cauldron)",
    reasoning: "Mini cottage pie (~300 cal: beef, mashed potato top) + mini fisherman's pie (~280 cal: fish, cream sauce, potato) + garden salad (~50 cal). Theme park portions are generous.",
    calories: 630, carbs: 52, fat: 28, protein: 32, sugar: 4, fiber: 4, sodium: 1280,
    confidence_score: 65
  },
  {
    id: "b97ed2c7-889f-45a6-96f7-8225685e85d3",
    name: "Buffalo Chicken Burgushi (The Cowfish)",
    reasoning: "Fried sushi roll with shredded buffalo chicken, jalapeño cream cheese, panko coating, bacon, bleu cheese. Similar to a fried appetizer roll. Cowfish portions are substantial.",
    calories: 580, carbs: 42, fat: 32, protein: 28, sugar: 4, fiber: 2, sodium: 1650,
    confidence_score: 60
  },

  // ========== DESSERTS ==========
  {
    id: "c0f425e4-4bc5-40b2-a5ac-263e21a6fd1d",
    name: "Hot for Cookie (Cold Stone Creamery)",
    reasoning: "Description states 730 cal. French vanilla ice cream (~300 cal), chocolate chip cookie (~150 cal), cookie dough (~150 cal), whipped cream (~50 cal), chocolate shavings (~80 cal).",
    calories: 730, carbs: 92, fat: 36, protein: 10, sugar: 68, fiber: 2, sodium: 380,
    confidence_score: 85
  },

  // ========== ALCOHOLIC BEVERAGES ==========
  {
    id: "510d2154-4234-4134-a536-e365b25f8052",
    name: "Wizard's Brew (Leaky Cauldron)",
    reasoning: "Sweet stout, full bodied. Similar to Guinness Extra Stout. 16oz serving typical for theme parks. Stouts range 170-220 cal per pint.",
    calories: 200, carbs: 18, fat: 0, protein: 2, sugar: 8, fiber: 0, sodium: 25,
    confidence_score: 60
  },
  {
    id: "21ac7ac2-6579-4988-b7c4-b9aa19f681a4",
    name: "Japanese Whisky Highball (Kimonos)",
    reasoning: "Suntory Toki whisky (1.5oz = ~100 cal from alcohol) + sparkling water + lemon. Clean, simple drink.",
    calories: 100, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 10,
    confidence_score: 75
  },

  // ========== SWEETENED COFFEE DRINKS ==========
  {
    id: "c4981ac1-5150-49b8-bc7c-fd64db4e2248",
    name: "Matcha Love Refresher (Go Juice)",
    reasoning: "Matcha powder (~5 cal), honey (1 tbsp = ~64 cal), lemon, likely some milk/water base. Refresher-style drinks are lighter than lattes.",
    calories: 120, carbs: 26, fat: 1, protein: 2, sugar: 22, fiber: 0, sodium: 35,
    confidence_score: 55
  },
  {
    id: "3edcf38f-ab54-4a87-b198-19e86e579aec",
    name: "Specialty Ube Cold Brew (Satu'li Canteen)",
    reasoning: "Cold brew (~5 cal) + ube flavoring (~20 cal) + oat milk (8oz = ~120 cal) + pure cane syrup (1 tbsp = ~50 cal). Disney specialty drinks are typically 16oz.",
    calories: 195, carbs: 38, fat: 3, protein: 2, sugar: 32, fiber: 1, sodium: 110,
    confidence_score: 55
  },
  {
    id: "db17ada9-8914-48e7-a26a-5eec764b1aec",
    name: "Specialty Cold Brew Flight (Satu'li Canteen)",
    reasoning: "Three 4oz samples of specialty cold brews. Each ~65 cal. Total ~195 cal for flight.",
    calories: 195, carbs: 36, fat: 3, protein: 2, sugar: 28, fiber: 0, sodium: 90,
    confidence_score: 50
  },
  {
    id: "66f9cf4d-c891-49e0-b884-006f5843dece",
    name: "Specialty Matcha Cold Brew (Satu'li Canteen)",
    reasoning: "Cold brew + matcha + oat milk + pure cane syrup. Similar to ube version.",
    calories: 180, carbs: 34, fat: 3, protein: 3, sugar: 28, fiber: 1, sodium: 105,
    confidence_score: 55
  },
  {
    id: "cd03cca4-54b7-4e56-88f3-b82dd13fa1f3",
    name: "Salted Caramel Cold Brew (Everglazed)",
    reasoning: "Cold brew + milk (4oz = ~75 cal) + salted caramel syrup (2 pumps = ~40 cal) + whipped cream (~50 cal). 16oz drink.",
    calories: 220, carbs: 32, fat: 8, protein: 3, sugar: 28, fiber: 0, sodium: 180,
    confidence_score: 60
  },
  {
    id: "c5649ba5-99a7-42af-9eb6-4eec9b4eea92",
    name: "Cinnamon Bun Cold Brew (Everglazed)",
    reasoning: "Cold brew + cinnamon bun syrup + Cinnamon Toast milk (flavored milk ~130 cal/8oz) + whipped cream. Rich, dessert-style drink.",
    calories: 280, carbs: 42, fat: 10, protein: 4, sugar: 36, fiber: 0, sodium: 160,
    confidence_score: 55
  },
  {
    id: "d1d3bf11-ce02-4b43-b608-bcf8bfebbacf",
    name: "Costa Irish Crème Cold Brew (Coca-Cola Store)",
    reasoning: "Cold brew + Irish crème syrup (2 pumps = ~40 cal). Simple flavored cold brew, no milk mentioned.",
    calories: 50, carbs: 10, fat: 0, protein: 0, sugar: 8, fiber: 0, sodium: 15,
    confidence_score: 60
  },
  {
    id: "a2ffe3c2-0eb9-4f2c-8f73-87da8762f118",
    name: "Caffe Misto (Starbucks - Marketplace)",
    reasoning: "Starbucks Caffe Misto Grande = 110 cal per official Starbucks nutrition. Half brewed coffee, half steamed milk.",
    calories: 110, carbs: 10, fat: 4, protein: 7, sugar: 9, fiber: 0, sodium: 115,
    confidence_score: 85
  },

  // ========== UNSWEETENED COFFEE/COLD BREW ==========
  {
    id: "7090bb54-a689-444c-9ff4-f09e38a64feb",
    name: "Shakin' Jamaican Cold Brew (AK Entrance)",
    reasoning: "Joffrey's signature cold brew with hints of caramel/vanilla but unsweetened base. Description says flavor shots extra. Base drink ~15 cal.",
    calories: 15, carbs: 2, fat: 0, protein: 0, sugar: 1, fiber: 0, sodium: 10,
    confidence_score: 55
  },
  {
    id: "37a4efa1-0d40-46f3-9188-8ae48ebf2a3e",
    name: "Shakin' Jamaican Cold Brew (Marketplace)",
    reasoning: "Same as above - island-inspired cold brew, base without flavor shot.",
    calories: 15, carbs: 2, fat: 0, protein: 0, sugar: 1, fiber: 0, sodium: 10,
    confidence_score: 55
  },
  {
    id: "c119ad7f-b777-4df0-ac59-35edbe55f15a",
    name: "Shakin' Jamaican (Starbucks)",
    reasoning: "Jamaican-inspired iced coffee. Assuming 16oz with light flavoring, no added milk.",
    calories: 20, carbs: 4, fat: 0, protein: 0, sugar: 2, fiber: 0, sodium: 10,
    confidence_score: 50
  },
  {
    id: "76acc6bb-09a7-442a-a05c-ffd2c2478194",
    name: "Shakin' Jamaican (The Landing Joffrey's)",
    reasoning: "Same Joffrey's product, base without additions.",
    calories: 15, carbs: 2, fat: 0, protein: 0, sugar: 1, fiber: 0, sodium: 10,
    confidence_score: 55
  },
  {
    id: "de94d320-9437-4e4b-8285-9d3fe3cec136",
    name: "Nitro (Everglazed)",
    reasoning: "Nitro cold brew, unsweetened. Nitrogen infusion adds no calories. ~5-10 cal for 16oz.",
    calories: 5, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 5,
    confidence_score: 80
  },

  // ========== PLAIN TEA (correctly low cal) ==========
  {
    id: "6ff6dc6b-a06e-483c-b83a-7829442b1fd0",
    name: "Loose-leaf Teas (Joffrey's)",
    reasoning: "Plain loose-leaf tea, unsweetened. Correct at ~2 cal.",
    calories: 2, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0,
    confidence_score: 90
  },
  {
    id: "722e0fc6-d6d9-4ed2-b37f-ba4d96da8a1e",
    name: "Assorted Hot Twinings Teas (Amorette's)",
    reasoning: "Plain hot tea, unsweetened. Correct at ~2 cal.",
    calories: 2, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0,
    confidence_score: 90
  },
  {
    id: "113db814-438f-40f3-84e9-a680975e2d53",
    name: "The (hot tea at Boulangerie)",
    reasoning: "Plain hot tea. Name appears truncated but description confirms. Correct at ~1-2 cal.",
    calories: 2, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0,
    confidence_score: 90
  },

  // ========== PICKLE (correctly low) ==========
  {
    id: "4487b13b-ff21-4c0a-a9fc-c5acccba1a7e",
    name: "Dollywood's Giant Pickle",
    reasoning: "Giant dill pickle. Pickles are very low calorie (~5 cal/oz) but high sodium. A 'giant' pickle is ~6-8oz = 30-40 cal.",
    calories: 35, carbs: 8, fat: 0, protein: 1, sugar: 3, fiber: 2, sodium: 1800,
    confidence_score: 70
  },
]

async function applyFixes() {
  console.log('Applying food scientist reviewed nutrition fixes...\n')

  let updated = 0
  let errors = 0

  for (const fix of fixes) {
    console.log(`Fixing: ${fix.name}`)
    console.log(`  Reasoning: ${fix.reasoning.slice(0, 80)}...`)
    console.log(`  New values: ${fix.calories} cal, ${fix.carbs}g C, ${fix.fat}g F, ${fix.protein}g P`)

    const { error } = await supabase
      .from('nutritional_data')
      .update({
        calories: fix.calories,
        carbs: fix.carbs,
        fat: fix.fat,
        protein: fix.protein,
        sugar: fix.sugar,
        fiber: fix.fiber,
        sodium: fix.sodium,
        confidence_score: fix.confidence_score,
        source: 'crowdsourced',  // Expert review
      })
      .eq('id', fix.id)

    if (error) {
      console.error(`  ERROR: ${error.message}`)
      errors++
    } else {
      console.log(`  SUCCESS`)
      updated++
    }
    console.log('')
  }

  console.log('=== BATCH 1 COMPLETE ===')
  console.log(`Updated: ${updated}`)
  console.log(`Errors: ${errors}`)
}

applyFixes().catch(console.error)
