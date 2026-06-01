import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const supabase = createClient(url, key)

async function main() {
  // 1. Find all parks matching "Magic Kingdom"
  const { data: parks, error: parkErr } = await supabase
    .from('parks')
    .select('id, name, location')
    .ilike('name', `%${process.argv[2] || 'Magic Kingdom'}%`)

  if (parkErr) {
    console.error('Error fetching parks:', parkErr.message)
    process.exit(1)
  }

  if (!parks || parks.length === 0) {
    console.log('No parks found matching "Magic Kingdom"')
    process.exit(0)
  }

  console.log(`\n=== Found ${parks.length} park(s) matching "Magic Kingdom" ===\n`)

  for (const park of parks) {
    console.log(`Park: ${park.name}`)
    console.log(`  Location: ${park.location}`)
    console.log(`  ID: ${park.id}`)
    console.log('')

    // 2. Get all restaurants for this park
    const { data: restaurants, error: restErr } = await supabase
      .from('restaurants')
      .select('id, name, land, cuisine_type')
      .eq('park_id', park.id)
      .order('land', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })

    if (restErr) {
      console.error(`  Error fetching restaurants: ${restErr.message}`)
      continue
    }

    if (!restaurants || restaurants.length === 0) {
      console.log('  No restaurants found.')
      continue
    }

    // 3. For each restaurant, get menu items
    let totalItems = 0
    const restaurantSummaries: { name: string; land: string | null; count: number }[] = []

    for (const rest of restaurants) {
      const { data: items, error: itemErr } = await supabase
        .from('menu_items')
        .select('id, name, category, price')
        .eq('restaurant_id', rest.id)
        .order('category', { ascending: true })
        .order('name', { ascending: true })

      if (itemErr) {
        console.error(`  Error fetching items for ${rest.name}: ${itemErr.message}`)
        continue
      }

      const count = items?.length ?? 0
      totalItems += count
      restaurantSummaries.push({ name: rest.name, land: rest.land, count })
    }

    // Print summary table
    console.log(`--- Restaurant Summary (${restaurants.length} restaurants, ${totalItems} total items) ---\n`)
    console.log('  Land | Restaurant | Items')
    console.log('  ' + '-'.repeat(70))

    for (const r of restaurantSummaries) {
      const land = (r.land ?? '(no land)').padEnd(25)
      const name = r.name.padEnd(35)
      console.log(`  ${land} | ${name} | ${r.count}`)
    }

    console.log('')

    // 4. Detailed listing: menu items grouped by restaurant
    console.log(`--- Detailed Menu Items by Restaurant ---\n`)

    for (const rest of restaurants) {
      const { data: items } = await supabase
        .from('menu_items')
        .select('id, name, category, price')
        .eq('restaurant_id', rest.id)
        .order('category', { ascending: true })
        .order('name', { ascending: true })

      if (!items || items.length === 0) continue

      const land = rest.land ? ` (${rest.land})` : ''
      console.log(`  ${rest.name}${land} — ${items.length} items`)

      // Group by category
      const byCategory: Record<string, typeof items> = {}
      for (const item of items) {
        const cat = item.category ?? 'uncategorized'
        if (!byCategory[cat]) byCategory[cat] = []
        byCategory[cat].push(item)
      }

      for (const [cat, catItems] of Object.entries(byCategory)) {
        console.log(`    [${cat}]`)
        for (const item of catItems) {
          const price = item.price ? ` — $${item.price.toFixed(2)}` : ''
          console.log(`      - ${item.name}${price}`)
        }
      }
      console.log('')
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
