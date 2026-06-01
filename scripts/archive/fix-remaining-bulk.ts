/**
 * Fix remaining bulk items - patterns across multiple locations
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

// Patterns to fix with their correct nutrition
const bulkFixes = [
  // Giant pickles - correct but need slight adjustment (35 cal verified earlier)
  {
    namePattern: "Dollywood's Giant Pickle",
    fix: { calories: 35, carbs: 8, fat: 0, protein: 1, sugar: 3, fiber: 2, sodium: 1800, confidence_score: 70 }
  },
  // Plain hot tea - correct at 2 cal, boost confidence
  {
    namePattern: "The",
    descPattern: "hot tea",
    fix: { calories: 2, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0, confidence_score: 90 }
  },
  // Khumbu Icefall - rum cocktail, was 1182 cal which is too high
  {
    namePattern: "Khumbu Icefall",
    fix: { calories: 380, carbs: 52, fat: 0, protein: 0, sugar: 42, fiber: 0, sodium: 15, confidence_score: 55 }
  },
  // Lamu Libation - rum cocktail
  {
    namePattern: "Lamu Libation",
    fix: { calories: 320, carbs: 42, fat: 0, protein: 0, sugar: 36, fiber: 0, sodium: 10, confidence_score: 55 }
  },
  // Hollywood Manhattan - whiskey cocktail
  {
    namePattern: "Hollywood Manhattan",
    fix: { calories: 180, carbs: 8, fat: 0, protein: 0, sugar: 6, fiber: 0, sodium: 5, confidence_score: 60 }
  },
  // Beer items - typical craft beer ~200 cal
  {
    namePattern: "Kungaloosh Spiced Excursion Ale",
    fix: { calories: 200, carbs: 18, fat: 0, protein: 2, sugar: 2, fiber: 0, sodium: 15, confidence_score: 70 }
  },
  {
    namePattern: "Kona Longboard Island Lager",
    fix: { calories: 150, carbs: 12, fat: 0, protein: 1, sugar: 1, fiber: 0, sodium: 15, confidence_score: 80 }
  },
  {
    namePattern: "Sierra Nevada Pale Ale",
    fix: { calories: 175, carbs: 14, fat: 0, protein: 2, sugar: 0, fiber: 0, sodium: 15, confidence_score: 80 }
  },
  // Marinated Grilled Chicken - recalc macros
  {
    namePattern: "Marinated Grilled Chicken",
    descPattern: "mushroom",
    fix: { calories: 680, carbs: 42, fat: 28, protein: 58, sugar: 4, fiber: 3, sodium: 980, confidence_score: 55 }
  },
]

async function applyBulkFixes() {
  console.log('Applying remaining bulk fixes...\n')

  let totalUpdated = 0

  for (const item of bulkFixes) {
    // Find matching items
    let query = supabase
      .from('menu_items')
      .select('id, name, description')
      .ilike('name', `%${item.namePattern}%`)

    if (item.descPattern) {
      query = query.ilike('description', `%${item.descPattern}%`)
    }

    const { data: menuItems, error: findError } = await query.limit(20)

    if (findError) {
      console.log(`Error finding ${item.namePattern}: ${findError.message}`)
      continue
    }

    if (!menuItems?.length) {
      console.log(`No matches for: ${item.namePattern}`)
      continue
    }

    console.log(`Found ${menuItems.length} items matching "${item.namePattern}"`)

    for (const mi of menuItems) {
      // Get nutrition data
      const { data: nutData, error: nutError } = await supabase
        .from('nutritional_data')
        .select('id')
        .eq('menu_item_id', mi.id)
        .single()

      if (nutError || !nutData) continue

      const { error: updateError } = await supabase
        .from('nutritional_data')
        .update({
          ...item.fix,
          source: 'crowdsourced'
        })
        .eq('id', nutData.id)

      if (!updateError) {
        console.log(`  Fixed: ${mi.name}`)
        totalUpdated++
      }
    }
    console.log('')
  }

  console.log('=== BULK FIXES COMPLETE ===')
  console.log(`Total updated: ${totalUpdated}`)
}

applyBulkFixes().catch(console.error)
