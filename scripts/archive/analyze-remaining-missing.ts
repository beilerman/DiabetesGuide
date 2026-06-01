import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(url, key)

async function analyzeRemaining() {
  const items: any[] = []
  let from = 0

  while (true) {
    const { data, error } = await sb
      .from('menu_items')
      .select(`
        id, name, category,
        nutritional_data(calories, carbs, fat, protein, sugar, fiber, sodium)
      `)
      .range(from, from + 499)

    if (error) {
      console.error(error)
      break
    }
    if (!data || data.length === 0) break

    items.push(...data)

    if (data.length < 500) break
    from += 500
  }

  console.log('═══════════════════════════════════════════════════════════════')
  console.log('         ANALYZE REMAINING MISSING VALUES')
  console.log('═══════════════════════════════════════════════════════════════\n')

  // Items with calories but missing sugar
  const missingSugar = items.filter(i => {
    const nut = i.nutritional_data?.[0]
    return nut && nut.calories && nut.calories > 0 && (!nut.sugar || nut.sugar === 0)
  })

  console.log(`Missing sugar (${missingSugar.length} items):`)
  const sugarByReason = new Map<string, number>()
  for (const item of missingSugar) {
    const nut = item.nutritional_data[0]
    let reason = 'unknown'
    if (!nut.carbs || nut.carbs === 0) {
      reason = 'no carbs data'
    } else if (nut.carbs > 0) {
      reason = 'has carbs but no sugar estimate'
    }
    sugarByReason.set(reason, (sugarByReason.get(reason) || 0) + 1)
  }
  for (const [reason, count] of sugarByReason) {
    console.log(`  ${reason}: ${count}`)
  }
  console.log()

  // Items with calories but missing protein
  const missingProtein = items.filter(i => {
    const nut = i.nutritional_data?.[0]
    return nut && nut.calories && nut.calories > 0 && (!nut.protein || nut.protein === 0)
  })

  console.log(`Missing protein (${missingProtein.length} items):`)
  console.log(`  Sample items:`)
  for (const item of missingProtein.slice(0, 10)) {
    const nut = item.nutritional_data[0]
    console.log(`    ${item.name} - ${nut.calories} cal, category: ${item.category}`)
  }
  console.log()

  // Items with carbs but missing fiber
  const missingFiber = items.filter(i => {
    const nut = i.nutritional_data?.[0]
    return nut && nut.carbs && nut.carbs > 0 && (!nut.fiber || nut.fiber === 0)
  })

  console.log(`Missing fiber (${missingFiber.length} items):`)
  console.log(`  Sample items:`)
  for (const item of missingFiber.slice(0, 10)) {
    const nut = item.nutritional_data[0]
    console.log(`    ${item.name} - ${nut.carbs}g carbs, category: ${item.category}`)
  }
  console.log()

  // Items with calories but missing sodium
  const missingSodium = items.filter(i => {
    const nut = i.nutritional_data?.[0]
    return nut && nut.calories && nut.calories > 0 && (!nut.sodium || nut.sodium === 0)
  })

  console.log(`Missing sodium (${missingSodium.length} items):`)
  console.log(`  Sample items:`)
  for (const item of missingSodium.slice(0, 10)) {
    const nut = item.nutritional_data[0]
    console.log(`    ${item.name} - ${nut.calories} cal, category: ${item.category}`)
  }
  console.log()

  console.log('═══════════════════════════════════════════════════════════════')
  console.log('CONCLUSION')
  console.log('═══════════════════════════════════════════════════════════════\n')

  console.log('Items missing micronutrients likely fall into these categories:')
  console.log('  1. Items with calories but no carbs (can\'t estimate sugar/fiber)')
  console.log('  2. Items that slipped through estimation filters')
  console.log('  3. Items added after the estimation scripts ran\n')
}

analyzeRemaining()
