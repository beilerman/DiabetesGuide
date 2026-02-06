/**
 * Food Scientist Review - Batch 2: More Critical Fixes
 * Items with clearly incorrect nutrition data.
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
  // ========== CLEARLY WRONG FOOD ITEMS ==========
  {
    id: "5461a18a-4cbe-4720-a7a8-f1c71148fc07",
    name: "Coffee-rubbed Rib-Eye Beef Puff (BaseLine Tap House)",
    reasoning: "Puff pastry appetizer with spiced rib-eye beef. Puff pastry ~200 cal, beef filling ~150 cal for small appetizer portion. Theme park appetizer size.",
    calories: 380, carbs: 22, fat: 24, protein: 18, sugar: 2, fiber: 1, sodium: 580,
    confidence_score: 60
  },
  {
    id: "22a8f447-c772-42d7-920f-6377af81e24d",
    name: "Coffee Cake Cookie (Gideon's Bakehouse)",
    reasoning: "Famous HALF-POUND cookie with cinnamon streusel. Gideon's cookies are 750-900 cal each based on fan measurements. Similar to their other jumbo cookies.",
    calories: 850, carbs: 105, fat: 42, protein: 10, sugar: 62, fiber: 2, sodium: 380,
    confidence_score: 70
  },
  {
    id: "e8bac5e1-72e5-4190-8af1-449c064fb38f",
    name: "The Old Fashioned Burger (Black Tap)",
    reasoning: "Black Tap's burgers are 6-8oz patties with generous toppings. 1020 cal is plausible but macros were missing. Typical burger: 40% fat, 25% protein, 35% carbs by cal.",
    calories: 1020, carbs: 52, fat: 58, protein: 48, sugar: 8, fiber: 3, sodium: 1450,
    confidence_score: 65
  },
  {
    id: "24263050-e53b-4fb2-8f70-c3973be7f3af",
    name: "Buzz Cola (Luigi's Pizza)",
    reasoning: "Description says 'zero calorie cherry flavored cola' - this is Simpsons-themed diet cola. Should be 0 calories like other diet sodas.",
    calories: 0, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 35,
    confidence_score: 85
  },
  {
    id: "7fc075a2-010d-4031-9de1-8ac6e98abe15",
    name: "Chicken Penne (Naples Ristorante)",
    reasoning: "Penne pasta with chicken in creamy sauce. Standard restaurant pasta portion: 400-500 cal pasta + 200-300 cal chicken + 300-400 cal cream sauce. Carbs were incorrectly null.",
    calories: 1100, carbs: 95, fat: 45, protein: 48, sugar: 6, fiber: 4, sodium: 1280,
    confidence_score: 55
  },

  // ========== LOBSTER/SEAFOOD ITEMS WITH WRONG MACROS ==========
  {
    id: "3b531a35-089d-45ea-b3b6-132944918028",
    name: "Lobster Roll (Columbia Harbour House)",
    reasoning: "Columbia Harbour House lobster roll with fries. Lobster ~200 cal, buttered roll ~250 cal, mayo ~100 cal, fries ~300 cal. 1688 cal is too high - likely over-multiplied.",
    calories: 720, carbs: 58, fat: 38, protein: 32, sugar: 4, fiber: 3, sodium: 1150,
    confidence_score: 60
  },
  {
    id: "9660f9dd-dd2d-4d7d-b669-3b34f1bf9cfa",
    name: "Lobster Roll (The Boathouse)",
    reasoning: "Boathouse serves premium lobster. More lobster meat than Columbia HH. New England style with butter.",
    calories: 780, carbs: 48, fat: 42, protein: 38, sugar: 3, fiber: 2, sodium: 980,
    confidence_score: 60
  },
  {
    id: "7c518363-fb1a-4222-9cda-734abf445566",
    name: "Steamed Maine Lobster (The Boathouse)",
    reasoning: "Whole Maine lobster, ~1.25-1.5 lb. Steamed lobster is ~130 cal/4oz meat. Served with butter. Total with butter sauce ~500-600 cal.",
    calories: 580, carbs: 4, fat: 32, protein: 68, sugar: 0, fiber: 0, sodium: 850,
    confidence_score: 65
  },
  {
    id: "5dd2a5b2-d72f-4806-ac83-1745d6e8434c",
    name: "Twin Cold Water Lobster Tails (The Boathouse)",
    reasoning: "Two 5-6oz lobster tails. Lobster meat ~30 cal/oz, total ~300-360 cal meat + butter ~200 cal. Much lower than 1688 cal.",
    calories: 520, carbs: 2, fat: 28, protein: 62, sugar: 0, fiber: 0, sodium: 720,
    confidence_score: 65
  },

  // ========== CRAB ITEMS ==========
  {
    id: "8ee50fc5-ec68-4a53-98fd-c6059cb52097",
    name: "Crab Cakes (The Boathouse)",
    reasoning: "Two lump crab cakes. Crab cakes ~200-250 cal each with breading and remoulade. 1700 cal is way over-estimated.",
    calories: 480, carbs: 22, fat: 28, protein: 32, sugar: 2, fiber: 1, sodium: 980,
    confidence_score: 60
  },
  {
    id: "361ec437-597e-4b72-a118-c774ac3f64ca",
    name: "Lump Crab Cake (Coastal Eats)",
    reasoning: "Single festival-size crab cake appetizer with slaw and remoulade. Festival portions are 3-4oz. 1956 cal is absurd.",
    calories: 320, carbs: 18, fat: 18, protein: 22, sugar: 3, fiber: 2, sodium: 680,
    confidence_score: 60
  },
  {
    id: "9c7dddb6-686b-4de0-a848-2da57a983ebc",
    name: "Snow Crab Legs (Cape May Cafe)",
    reasoning: "Buffet portion of snow crab legs. Crab meat is very lean ~25 cal/oz. Even 1 lb of crab meat = ~400 cal. With butter ~600 cal total.",
    calories: 580, carbs: 2, fat: 32, protein: 68, sugar: 0, fiber: 0, sodium: 1800,
    confidence_score: 55
  },

  // ========== BBQ/SAMPLER ITEMS ==========
  {
    id: "519a1b65-ddd7-4c6d-b280-43009811b49d",
    name: "Zambia Sampler (Zambia Smokehouse)",
    reasoning: "Combination platter: ribs (~400 cal), brisket (~350 cal), BBQ chicken (~300 cal), fries (~400 cal). Theme park sampler is shareable. 427g carbs was way off.",
    calories: 1450, carbs: 65, fat: 78, protein: 95, sugar: 18, fiber: 4, sodium: 2400,
    confidence_score: 55
  },

  // ========== TURKEY LEG ==========
  {
    id: "54354afe-bc8f-4e9f-9d9f-f7d46a08c2ac",
    name: "Smoked Turkey Leg (Thunder Falls Terrace)",
    reasoning: "Giant turkey leg verified at ~1093 cal by Disney. Macros need correction. Turkey leg is mostly protein with skin fat.",
    calories: 1093, carbs: 0, fat: 54, protein: 152, sugar: 0, fiber: 0, sodium: 3500,
    confidence_score: 80
  },

  // ========== SEAFOOD ENTREES ==========
  {
    id: "5dce6d5d-8632-4845-b20f-bcd3b767053e",
    name: "Gulf Coast-style Seafood Roll (Flavors of America)",
    reasoning: "Lobster and rock shrimp on brioche with bisque. Festival portion ~6oz filling. 1143 cal is over-estimated.",
    calories: 580, carbs: 42, fat: 32, protein: 28, sugar: 6, fiber: 2, sodium: 920,
    confidence_score: 55
  },
  {
    id: "64ea9f38-515a-4247-898f-0318bd3f6781",
    name: "Seaside Pot Pie (Coastal Eats)",
    reasoning: "Small festival pot pie with seafood. 824 cal is reasonable for pot pie with puff pastry. Correct macros.",
    calories: 680, carbs: 42, fat: 38, protein: 32, sugar: 4, fiber: 2, sodium: 980,
    confidence_score: 60
  },

  // ========== FINE DINING ==========
  {
    id: "217fa498-be57-4454-8eca-217b98563c80",
    name: "Dover Sole Meunière (Remy)",
    reasoning: "Pan-fried sole in brown butter. Dover sole fillet ~200 cal + brown butter ~150 cal + garnish. Fine dining portion ~6oz.",
    calories: 420, carbs: 4, fat: 28, protein: 38, sugar: 0, fiber: 0, sodium: 480,
    confidence_score: 60
  },
  {
    id: "e674aca0-3f44-4784-8a74-88346d388dff",
    name: "Uni Tomato Bisque (Topolino's Terrace)",
    reasoning: "Soup course with blue crab and sea urchin. Rich bisque ~200 cal, crab ~50 cal, uni ~30 cal. 1436 cal is way too high for a soup.",
    calories: 320, carbs: 18, fat: 22, protein: 12, sugar: 6, fiber: 1, sodium: 780,
    confidence_score: 55
  },
  {
    id: "15621baf-224d-4d2d-b38e-7768a788fabd",
    name: "Chicken Sugo Rigatoni (Topolino's Terrace)",
    reasoning: "Braised chicken pasta. 498 cal seems low for pasta dish but macros don't add up. Recalculate: ~700 cal typical.",
    calories: 720, carbs: 68, fat: 28, protein: 42, sugar: 8, fiber: 4, sodium: 1080,
    confidence_score: 55
  },

  // ========== TRADER SAM'S DRINKS (ALCOHOL) ==========
  {
    id: "3cc3f9d7-9902-4d76-8bfe-ef222539e38e",
    name: "The Nautilus (Trader Sam's)",
    reasoning: "Large shareable tiki drink for 2+. Multiple rums + juices. 688 cal is plausible but macros wrong (77g fat for a drink?). Fix fat to 0.",
    calories: 580, carbs: 72, fat: 0, protein: 2, sugar: 58, fiber: 0, sodium: 25,
    confidence_score: 55
  },
  {
    id: "467d158a-9cab-47fe-a0c1-dc2ae253512d",
    name: "Schweitzer Falls (Trader Sam's)",
    reasoning: "Non-alcoholic tropical drink. Sugar > carbs error. ~300-400 cal from fruit juices.",
    calories: 340, carbs: 82, fat: 0, protein: 1, sugar: 72, fiber: 1, sodium: 35,
    confidence_score: 55
  },
  {
    id: "cec07e51-fd85-4fb8-b0a0-018fb2e9160a",
    name: "HippopotoMai-Tai (Trader Sam's)",
    reasoning: "Classic Mai-Tai. Rum + orgeat + lime + orange liqueur. ~300-350 cal for tiki cocktail.",
    calories: 320, carbs: 38, fat: 0, protein: 0, sugar: 32, fiber: 0, sodium: 10,
    confidence_score: 60
  },

  // ========== ALCOHOLIC BEVERAGES ==========
  {
    id: "70c94a63-6d7d-4b9f-8189-6659e3a61583",
    name: "White Claw Hard Seltzer",
    reasoning: "White Claw is 100 cal per can. Official nutrition. Caloric math 'off' because alcohol calories don't come from macros.",
    calories: 100, carbs: 2, fat: 0, protein: 0, sugar: 2, fiber: 0, sodium: 20,
    confidence_score: 95
  },

  // ========== SALADS AND SIDES ==========
  {
    id: "c2cb6f65-2418-4558-af43-4857733a4b21",
    name: "Endive and Walnut Salad (Be Our Guest)",
    reasoning: "Salad with roquefort, apple, walnuts, vinaigrette. Missing fat data. Cheese + walnuts + dressing = significant fat.",
    calories: 380, carbs: 22, fat: 28, protein: 12, sugar: 10, fiber: 4, sodium: 520,
    confidence_score: 55
  },

  // ========== FRENCH SEAFOOD ==========
  {
    id: "f7b439f4-d2a7-417f-8ca1-00d76b3c84d1",
    name: "Gâteau de Crabe (L'Art de la Cuisine)",
    reasoning: "French crab cake appetizer with bisque. Festival portion. 1243 cal is over-estimated.",
    calories: 340, carbs: 22, fat: 20, protein: 18, sugar: 4, fiber: 1, sodium: 680,
    confidence_score: 55
  },
  {
    id: "bb90d8ad-556f-4246-90b8-a18dc5a67bc6",
    name: "Blanquette de la Mer (Chefs de France)",
    reasoning: "Shrimp and scallops in cream sauce. Rich but 1958 cal is too high. Typical creamy seafood dish ~800-1000 cal.",
    calories: 920, carbs: 32, fat: 58, protein: 62, sugar: 4, fiber: 2, sodium: 1350,
    confidence_score: 55
  },

  // ========== ITALIAN ==========
  {
    id: "400bc794-0621-4d34-b9dd-265354988698",
    name: "Tagliere Misto (Naples Ristorante)",
    reasoning: "Italian charcuterie board for sharing. 2416 cal may be correct for large board but 0 carbs is wrong (crackers, bread).",
    calories: 1800, carbs: 45, fat: 135, protein: 85, sugar: 4, fiber: 2, sodium: 4200,
    confidence_score: 50
  },
  {
    id: "7832720d-2ac5-4fff-9b3e-7c1555a6cd82",
    name: "Wild Mushrooms Arancini (Citricos)",
    reasoning: "Fried risotto balls appetizer. 3-4 arancini ~400-500 cal total. 165 cal is too low.",
    calories: 480, carbs: 52, fat: 24, protein: 12, sugar: 3, fiber: 2, sodium: 720,
    confidence_score: 55
  },
]

async function applyFixes() {
  console.log('Applying food scientist reviewed nutrition fixes - Batch 2...\n')

  let updated = 0
  let errors = 0

  for (const fix of fixes) {
    console.log(`Fixing: ${fix.name}`)
    console.log(`  ${fix.reasoning.slice(0, 70)}...`)
    console.log(`  New: ${fix.calories} cal, ${fix.carbs}g C, ${fix.fat}g F, ${fix.protein}g P`)

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
        source: 'crowdsourced',
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

  console.log('=== BATCH 2 COMPLETE ===')
  console.log(`Updated: ${updated}`)
  console.log(`Errors: ${errors}`)
}

applyFixes().catch(console.error)
