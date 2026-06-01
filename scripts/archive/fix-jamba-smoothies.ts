import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(url, key)
const DRY_RUN = process.argv.includes('--dry-run')

interface MenuItem {
  id: string
  name: string
  restaurant: { name: string; park: { name: string } }
  nutritional_data: Array<{
    id: string
    calories: number | null
    carbs: number | null
    fat: number | null
    sugar: number | null
    protein: number | null
    confidence_score: number | null
  }>
}

// The 4 Jamba smoothies we over-corrected
const JAMBA_SMOOTHIES = [
  { name: 'Aloha Pineapple, Medium', expectedCarbs: 89 },
  { name: 'Strawberry Surf Rider, Medium', expectedCarbs: 84 },
  { name: 'Mega Mango, Medium', expectedCarbs: 74 },
  { name: 'Greens \'N Ginger, Medium', expectedCarbs: 70 }
]

async function fetchItem(name: string): Promise<MenuItem | null> {
  const { data, error } = await sb
    .from('menu_items')
    .select(`
      id, name,
      restaurant:restaurants(name, park:parks(name)),
      nutritional_data(id, calories, carbs, fat, sugar, protein, confidence_score)
    `)
    .eq('name', name)
    .limit(1)
    .single()

  if (error) {
    console.error(`  ❌ Failed to fetch "${name}": ${error.message}`)
    return null
  }

  return data as MenuItem
}

async function updateNutrition(nutId: string, updates: Record<string, number | null>) {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would update nutrition ${nutId}:`, updates)
    return true
  }

  const { error } = await sb
    .from('nutritional_data')
    .update(updates)
    .eq('id', nutId)

  if (error) {
    console.error(`  ❌ Failed to update: ${error.message}`)
    return false
  }

  return true
}

console.log('═══════════════════════════════════════════════════════════════')
console.log('           FIX JAMBA SMOOTHIES SUGAR VALUES')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log('BACKGROUND:')
console.log('  We previously corrected these from sugar > carbs violations')
console.log('  by setting sugar to 20% of carbs (generic estimate).')
console.log('  However, fruit smoothies are naturally 60-70% sugar.\n')

console.log('FIX STRATEGY:')
console.log('  Set sugar to 70% of carbs for fruit smoothies')
console.log('  (pineapple, strawberry, mango are high-sugar fruits)\n')

console.log('═══════════════════════════════════════════════════════════════\n')

let fixed = 0
let failed = 0

for (const smoothie of JAMBA_SMOOTHIES) {
  console.log(`📝 ${smoothie.name}`)

  const item = await fetchItem(smoothie.name)
  if (!item || !item.nutritional_data?.[0]) {
    console.log(`  ❌ Not found in database`)
    failed++
    console.log()
    continue
  }

  const nut = item.nutritional_data[0]
  const currentSugar = nut.sugar || 0
  const currentCarbs = nut.carbs || smoothie.expectedCarbs

  // Fruit smoothies are 70% sugar (high sugar content from fruit)
  const newSugar = Math.round(currentCarbs * 0.70)

  console.log(`  Current: sugar=${currentSugar}g, carbs=${currentCarbs}g`)
  console.log(`  Fix: sugar=${currentSugar}g → ${newSugar}g (70% of carbs)`)
  console.log(`  Reason: Fruit smoothies naturally high in sugar`)

  const success = await updateNutrition(nut.id, { sugar: newSugar })
  if (success) {
    fixed++
    console.log(`  ✅ Fixed`)
  } else {
    failed++
  }
  console.log()
}

console.log('═══════════════════════════════════════════════════════════════')
console.log('SUMMARY')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log(`Items fixed: ${fixed}`)
console.log(`Items failed: ${failed}\n`)

if (DRY_RUN) {
  console.log('🔍 DRY RUN MODE - No changes were made')
  console.log('   Run without --dry-run to apply fixes\n')
} else {
  console.log('✅ All fixes applied\n')
}

console.log('NUTRITIONAL CONTEXT:')
console.log('  - Whole fruit smoothies: 60-80% of carbs are sugar')
console.log('  - Pineapple: ~82% of carbs are sugar')
console.log('  - Strawberries: ~53% of carbs are sugar')
console.log('  - Mango: ~86% of carbs are sugar')
console.log('  - Using 70% is a reasonable middle estimate\n')
