import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Set env vars'); process.exit(1) }

const supabase = createClient(url, key)

async function main() {
  const parkName = process.argv[2] || 'Magic Kingdom Park'

  const { data: park } = await supabase
    .from('parks')
    .select('id, name')
    .eq('name', parkName)
    .single()

  if (!park) { console.error(`Park "${parkName}" not found`); process.exit(1) }

  console.log(`=== Beverage Coverage: ${park.name} ===\n`)

  // Get all restaurants for this park
  const { data: restaurants } = await supabase
    .from('restaurants')
    .select('id, name')
    .eq('park_id', park.id)

  if (!restaurants) return

  // Get all beverages
  const allBeverages: { name: string; restaurant: string; calories: number }[] = []

  for (const rest of restaurants) {
    const { data: items } = await supabase
      .from('menu_items')
      .select('name, category, nutritional_data (calories)')
      .eq('restaurant_id', rest.id)
      .eq('category', 'beverage')

    for (const item of items ?? []) {
      const nd = (item as any).nutritional_data?.[0] || (item as any).nutritional_data
      allBeverages.push({
        name: item.name,
        restaurant: rest.name,
        calories: nd?.calories ?? 0,
      })
    }
  }

  // Categorize beverages
  const categories = {
    'Fountain/Soda': [] as typeof allBeverages,
    'Slushies/Frozen': [] as typeof allBeverages,
    'Coffee/Tea': [] as typeof allBeverages,
    'Milkshakes/Floats': [] as typeof allBeverages,
    'Specialty Non-Alc': [] as typeof allBeverages,
    'Alcoholic': [] as typeof allBeverages,
    'Water/Juice': [] as typeof allBeverages,
    'Other': [] as typeof allBeverages,
  }

  for (const bev of allBeverages) {
    const n = bev.name.toLowerCase()
    if (/slushy|slush|frozen/i.test(n)) categories['Slushies/Frozen'].push(bev)
    else if (/shake|milkshake/i.test(n)) categories['Milkshakes/Floats'].push(bev)
    else if (/float/i.test(n)) categories['Milkshakes/Floats'].push(bev)
    else if (/coffee|cold brew|espresso|latte|cappuccino/i.test(n)) categories['Coffee/Tea'].push(bev)
    else if (/tea/i.test(n)) categories['Coffee/Tea'].push(bev)
    else if (/coca.cola|coke|pepsi|sprite|fanta|dr pepper|root beer|ginger ale|soda|fountain/i.test(n)) categories['Fountain/Soda'].push(bev)
    else if (/beer|ale|lager|ipa|stout|pilsner/i.test(n)) categories['Alcoholic'].push(bev)
    else if (/wine|champagne|prosecco|sangria/i.test(n)) categories['Alcoholic'].push(bev)
    else if (/margarita|cocktail|martini|mojito|daiquiri|manhattan|old fashioned|rum|vodka|whiskey|bourbon|tequila/i.test(n)) categories['Alcoholic'].push(bev)
    else if (/water|juice|lemonade|smoothie/i.test(n)) categories['Water/Juice'].push(bev)
    else if (/lefou|brew.*souvenir/i.test(n)) categories['Specialty Non-Alc'].push(bev)
    else categories['Other'].push(bev)
  }

  console.log(`Total beverages: ${allBeverages.length}\n`)

  for (const [cat, items] of Object.entries(categories)) {
    if (items.length === 0) {
      console.log(`${cat}: NONE ⚠️`)
    } else {
      console.log(`${cat}: ${items.length} items`)
      for (const item of items) {
        console.log(`  - ${item.name} (${item.restaurant}) — ${item.calories} cal`)
      }
    }
    console.log('')
  }

  // Summary check
  console.log('=== Coverage Check ===')
  const checks = [
    { name: 'Fountain drinks', ok: categories['Fountain/Soda'].length > 0 },
    { name: 'Slushies/frozen', ok: categories['Slushies/Frozen'].length > 0 },
    { name: 'Coffee/tea', ok: categories['Coffee/Tea'].length > 0 },
    { name: 'Milkshakes/floats', ok: categories['Milkshakes/Floats'].length > 0 },
    { name: 'Specialty non-alc', ok: categories['Specialty Non-Alc'].length > 0 || categories['Other'].length > 0 },
    { name: 'Alcoholic', ok: categories['Alcoholic'].length > 0 },
    { name: 'Water/juice/lemonade', ok: categories['Water/Juice'].length > 0 },
  ]

  for (const check of checks) {
    console.log(`  ${check.ok ? '✓' : '✗'} ${check.name}`)
  }

  // Also count total items by category for the park
  let totalItems = 0
  const catCounts: Record<string, number> = {}
  for (const rest of restaurants) {
    const { data: items } = await supabase
      .from('menu_items')
      .select('category')
      .eq('restaurant_id', rest.id)

    for (const item of items ?? []) {
      totalItems++
      catCounts[item.category] = (catCounts[item.category] || 0) + 1
    }
  }

  console.log(`\n=== Park Total: ${totalItems} items ===`)
  for (const [cat, count] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
