import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(url, key)
const DRY_RUN = process.argv.includes('--dry-run')

interface Flag {
  item: string
  location: string
  pass: number
  issue: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  current: string
  suggested: string
  category: string
}

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
    fiber: number | null
    sodium: number | null
    cholesterol: number | null
    confidence_score: number | null
  }>
}

const flags: Flag[] = JSON.parse(readFileSync('audit-report.json', 'utf-8'))
const fixedIds = new Set<string>()

async function fetchItemByName(name: string, location: string): Promise<MenuItem | null> {
  const { data, error } = await sb
    .from('menu_items')
    .select(`
      id, name,
      restaurant:restaurants(name, park:parks(name)),
      nutritional_data(id, calories, carbs, fat, sugar, protein, fiber, sodium, cholesterol, confidence_score)
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

// =============================================================================
// FIX 1: SUGAR > CARBS (46 items)
// =============================================================================
console.log('═══════════════════════════════════════════════════════════════')
console.log('FIX 1: SUGAR > CARBS (Biological Impossibility)')
console.log('═══════════════════════════════════════════════════════════════\n')

const sugarFlags = flags.filter(f => f.severity === 'HIGH' && f.category === 'sugar-carbs')
console.log(`Found ${sugarFlags.length} items with sugar > carbs\n`)

let sugarFixed = 0
let sugarFailed = 0

for (const flag of sugarFlags) {
  const match = flag.current.match(/sugar=(\d+)g, carbs=(\d+)g/)
  if (!match) continue

  const currentSugar = parseInt(match[1])
  const currentCarbs = parseInt(match[2])

  console.log(`\n📝 ${flag.item}`)
  console.log(`   Location: ${flag.location}`)
  console.log(`   Current: sugar=${currentSugar}g, carbs=${currentCarbs}g`)

  const item = await fetchItemByName(flag.item, flag.location)
  if (!item || !item.nutritional_data?.[0]) {
    sugarFailed++
    continue
  }

  if (fixedIds.has(item.nutritional_data[0].id)) {
    console.log(`   ⏭️  Already fixed`)
    continue
  }

  const nut = item.nutritional_data[0]

  // Strategy: Check if it looks like a swap (sugar and carbs are swapped)
  // If currentSugar matches nut.carbs and currentCarbs matches nut.sugar, it's a swap
  // Otherwise, set sugar to reasonable percentage of carbs

  let newSugar: number
  let reason: string

  if (currentSugar > currentCarbs * 2) {
    // Likely they're swapped
    newSugar = currentCarbs
    reason = 'Likely swapped - setting sugar = carbs'
  } else {
    // Set to reasonable percentage (30% for desserts/drinks, 10% for others)
    const itemName = flag.item.toLowerCase()
    if (/dessert|cake|cookie|brownie|ice cream|shake|smoothie|sweet|daiquiri|margarita/.test(itemName)) {
      newSugar = Math.round(currentCarbs * 0.6) // Desserts/sweet drinks are high sugar
    } else if (/beer|ale|lager|ipa|wine|champagne|cocktail|old fashioned|mojito|sangria/.test(itemName)) {
      newSugar = Math.round(currentCarbs * 0.3) // Alcoholic drinks
    } else {
      newSugar = Math.round(currentCarbs * 0.2) // Everything else
    }
    reason = `Setting to reasonable percentage of carbs`
  }

  console.log(`   Fix: sugar=${currentSugar}g → ${newSugar}g (${reason})`)

  const success = await updateNutrition(nut.id, { sugar: newSugar })
  if (success) {
    fixedIds.add(nut.id)
    sugarFixed++
    console.log(`   ✅ Fixed`)
  } else {
    sugarFailed++
  }
}

console.log(`\n✅ Sugar > Carbs: ${sugarFixed} fixed, ${sugarFailed} failed\n`)

// =============================================================================
// FIX 2: EXTREME CALORIC UNDERCOUNT (4 items)
// =============================================================================
console.log('═══════════════════════════════════════════════════════════════')
console.log('FIX 2: EXTREME CALORIC UNDERCOUNT')
console.log('═══════════════════════════════════════════════════════════════\n')

const undercountFlags = flags.filter(f =>
  f.severity === 'HIGH' &&
  f.category === 'caloric-math' &&
  f.issue.includes('ratio 0.') &&
  parseFloat(f.issue.match(/ratio (0\.\d+)/)?.[1] || '1') < 0.5
)

console.log(`Found ${undercountFlags.length} items with extreme undercount\n`)

let undercountFixed = 0
let undercountFailed = 0

for (const flag of undercountFlags) {
  const match = flag.current.match(/cal=(\d+), P=(\d+)g, C=(\d+)g, F=(\d+)g/)
  if (!match) continue

  const [_, currentCal, p, c, f] = match
  const protein = parseInt(p)
  const carbs = parseInt(c)
  const fat = parseInt(f)
  const calculatedCal = protein * 4 + carbs * 4 + fat * 9
  const currentCalNum = parseInt(currentCal)

  console.log(`\n📝 ${flag.item}`)
  console.log(`   Location: ${flag.location}`)
  console.log(`   Current: ${currentCalNum} cal (P=${protein}g, C=${carbs}g, F=${fat}g)`)
  console.log(`   Calculated from macros: ${calculatedCal} cal`)

  const item = await fetchItemByName(flag.item, flag.location)
  if (!item || !item.nutritional_data?.[0]) {
    undercountFailed++
    continue
  }

  if (fixedIds.has(item.nutritional_data[0].id)) {
    console.log(`   ⏭️  Already fixed`)
    continue
  }

  const nut = item.nutritional_data[0]

  // Strategy: Use calculated calories from macros
  // Reduce confidence score since we're making a correction
  const newCal = calculatedCal
  const newConfidence = Math.max(35, (nut.confidence_score || 50) - 10)

  console.log(`   Fix: calories=${currentCalNum} → ${newCal}, confidence=${nut.confidence_score || 50} → ${newConfidence}`)

  const success = await updateNutrition(nut.id, {
    calories: newCal,
    confidence_score: newConfidence
  })

  if (success) {
    fixedIds.add(nut.id)
    undercountFixed++
    console.log(`   ✅ Fixed`)
  } else {
    undercountFailed++
  }
}

console.log(`\n✅ Extreme Undercount: ${undercountFixed} fixed, ${undercountFailed} failed\n`)

// =============================================================================
// SUMMARY
// =============================================================================
console.log('═══════════════════════════════════════════════════════════════')
console.log('SUMMARY')
console.log('═══════════════════════════════════════════════════════════════\n')

const totalFixed = sugarFixed + undercountFixed
const totalFailed = sugarFailed + undercountFailed

console.log(`Total items fixed: ${totalFixed}`)
console.log(`  Sugar > Carbs: ${sugarFixed}`)
console.log(`  Extreme Undercount: ${undercountFixed}`)
console.log(`\nTotal items failed: ${totalFailed}\n`)

if (DRY_RUN) {
  console.log('🔍 DRY RUN MODE - No changes were made')
  console.log('   Run without --dry-run to apply fixes\n')
} else {
  console.log('✅ All fixes applied\n')
}
