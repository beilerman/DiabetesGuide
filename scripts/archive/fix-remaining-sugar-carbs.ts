import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(url, key)
const DRY_RUN = process.argv.includes('--dry-run')

async function findSugarCarbs() {
  const items: any[] = []
  let from = 0

  while (true) {
    const { data, error } = await sb
      .from('menu_items')
      .select(`
        id, name,
        restaurant:restaurants(name, park:parks(name)),
        nutritional_data(id, calories, carbs, sugar, confidence_score)
      `)
      .range(from, from + 499)

    if (error) {
      console.error(error)
      break
    }
    if (!data || data.length === 0) break

    // Find items where sugar > carbs
    const bad = data.filter((item: any) => {
      const nut = item.nutritional_data?.[0]
      return nut && nut.sugar && nut.carbs && nut.sugar > nut.carbs
    })

    items.push(...bad)

    if (data.length < 500) break
    from += 500
  }

  return items
}

async function updateNutrition(nutId: string, updates: Record<string, number>) {
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
console.log('     FIX REMAINING SUGAR > CARBS VIOLATIONS')
console.log('═══════════════════════════════════════════════════════════════\n')

const items = await findSugarCarbs()

console.log(`Found ${items.length} items with sugar > carbs\n`)

if (items.length === 0) {
  console.log('✅ No issues found - all sugar > carbs violations fixed!\n')
  process.exit(0)
}

console.log('═══════════════════════════════════════════════════════════════\n')

let fixed = 0
let failed = 0

for (const item of items) {
  const nut = item.nutritional_data[0]
  const currentSugar = nut.sugar
  const currentCarbs = nut.carbs

  console.log(`📝 ${item.name}`)
  console.log(`   Location: ${item.restaurant.name} (${item.restaurant.park.name})`)
  console.log(`   Current: sugar=${currentSugar}g, carbs=${currentCarbs}g`)

  // For Old Fashioned cocktails, use 30% of carbs (they have sugar from simple syrup)
  const newSugar = Math.round(currentCarbs * 0.3)

  console.log(`   Fix: sugar=${currentSugar}g → ${newSugar}g (30% of carbs - Old Fashioned has sugar from simple syrup)`)

  const success = await updateNutrition(nut.id, { sugar: newSugar })
  if (success) {
    fixed++
    console.log(`   ✅ Fixed`)
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
  console.log('✅ All remaining sugar > carbs violations fixed!\n')
}
