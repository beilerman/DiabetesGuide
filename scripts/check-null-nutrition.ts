/**
 * List items with null nutrition data (excluding water/coffee/tea)
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

async function main() {
  console.log('Fetching items with null calories...')

  // Fetch all items with null calories
  let allItems: any[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase.from('nutritional_data')
      .select('id, calories, carbs, menu_item:menu_items(name, category, description)')
      .is('calories', null)
      .range(offset, offset + 999)

    if (error) {
      console.error('Error:', error)
      break
    }
    if (!data?.length) break
    allItems = allItems.concat(data)
    if (data.length < 1000) break
    offset += 1000
  }

  console.log(`Found ${allItems.length} items with null calories`)

  // Filter out water/coffee/tea/spirits
  const skipWords = ['water', 'coffee', 'tea', 'espresso', 'americano', 'latte', 'cappuccino', 'spirits', 'evian', 'perrier']
  const nonBeverage = allItems.filter(item => {
    const mi = Array.isArray(item.menu_item) ? item.menu_item[0] : item.menu_item
    const name = (mi?.name || '').toLowerCase()
    return !skipWords.some(word => name.includes(word))
  })

  console.log(`After filtering zero-cal beverages: ${nonBeverage.length} items`)
  console.log('')

  // Group by category
  const byCategory: Record<string, any[]> = {}
  for (const item of nonBeverage) {
    const mi = Array.isArray(item.menu_item) ? item.menu_item[0] : item.menu_item
    const cat = mi?.category || 'unknown'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(mi?.name)
  }

  console.log('By category:')
  for (const [cat, items] of Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${cat}: ${items.length}`)
    items.slice(0, 10).forEach(name => console.log(`  - ${name}`))
    if (items.length > 10) console.log(`  ... and ${items.length - 10} more`)
  }

  // Check which have descriptions
  const withDesc = nonBeverage.filter(item => {
    const mi = Array.isArray(item.menu_item) ? item.menu_item[0] : item.menu_item
    return mi?.description && mi.description.trim().length > 0
  })
  const withoutDesc = nonBeverage.filter(item => {
    const mi = Array.isArray(item.menu_item) ? item.menu_item[0] : item.menu_item
    return !mi?.description || mi.description.trim().length === 0
  })

  console.log('\n--- Description Analysis ---')
  console.log(`Items WITH description: ${withDesc.length}`)
  console.log(`Items WITHOUT description: ${withoutDesc.length}`)

  console.log('\nSample items WITHOUT description (need USDA lookup or manual entry):')
  withoutDesc.slice(0, 15).forEach(item => {
    const mi = Array.isArray(item.menu_item) ? item.menu_item[0] : item.menu_item
    console.log(`  - ${mi?.name} [${mi?.category}]`)
  })
}

main()
