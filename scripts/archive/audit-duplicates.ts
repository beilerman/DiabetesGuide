import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

interface Item {
  id: string
  name: string
  category: string
  description: string | null
  restaurant: { id: string; name: string; park: { name: string } }
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
    source: string
    confidence_score: number | null
  }>
}

async function fetchAll(): Promise<Item[]> {
  const all: Item[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from('menu_items')
      .select('id, name, category, description, restaurant:restaurants(id, name, park:parks(name)), nutritional_data(id, calories, carbs, fat, sugar, protein, fiber, sodium, cholesterol, source, confidence_score)')
      .range(from, from + 499)
    if (error) { console.error(error); break }
    if (!data || data.length === 0) break
    all.push(...(data as unknown as Item[]))
    if (data.length < 500) break
    from += 500
  }
  return all
}

function nutritionKey(nd: Item['nutritional_data'][0]): string {
  return `${nd.calories ?? 'n'}|${nd.carbs ?? 'n'}|${nd.fat ?? 'n'}|${nd.protein ?? 'n'}|${nd.sugar ?? 'n'}|${nd.sodium ?? 'n'}`
}

async function main() {
  console.log('Fetching all items...')
  const items = await fetchAll()
  console.log(`Fetched ${items.length} items\n`)

  // Group by restaurant, then find duplicate nutrition profiles within each
  const byRestaurant = new Map<string, Item[]>()
  for (const item of items) {
    const r = item.restaurant as any
    const key = r?.id ?? 'unknown'
    if (!byRestaurant.has(key)) byRestaurant.set(key, [])
    byRestaurant.get(key)!.push(item)
  }

  interface DupGroup {
    restaurant: string
    park: string
    restaurantId: string
    nutritionKey: string
    calories: number | null
    items: { name: string; category: string; id: string }[]
    source: string
    confidence: number | null
  }

  const dupGroups: DupGroup[] = []
  let totalDupItems = 0

  for (const [restId, restItems] of byRestaurant) {
    // Group items by nutrition profile
    const byNutrition = new Map<string, Item[]>()
    for (const item of restItems) {
      const nd = item.nutritional_data?.[0]
      if (!nd || nd.calories === null || nd.calories === 0) continue
      const key = nutritionKey(nd)
      if (!byNutrition.has(key)) byNutrition.set(key, [])
      byNutrition.get(key)!.push(item)
    }

    // Find groups with 3+ items sharing same nutrition
    for (const [key, group] of byNutrition) {
      if (group.length < 3) continue
      // Skip if items are genuinely similar (e.g., "Coke", "Diet Coke", "Sprite" all ~0 cal)
      const nd = group[0].nutritional_data[0]
      if ((nd.calories ?? 0) <= 10) continue // zero-cal items are legitimately identical

      const r = group[0].restaurant as any
      dupGroups.push({
        restaurant: r?.name ?? '?',
        park: r?.park?.name ?? '?',
        restaurantId: restId,
        nutritionKey: key,
        calories: nd.calories,
        items: group.map(i => ({ name: i.name, category: i.category, id: i.id })),
        source: nd.source,
        confidence: nd.confidence_score,
      })
      totalDupItems += group.length
    }
  }

  // Sort by group size desc
  dupGroups.sort((a, b) => b.items.length - a.items.length)

  console.log(`\n${'═'.repeat(85)}`)
  console.log(`  DUPLICATE NUTRITION PROFILES`)
  console.log(`  ${dupGroups.length} groups, ${totalDupItems} total items`)
  console.log(`${'═'.repeat(85)}`)

  // By park
  const byPark = new Map<string, { groups: number; items: number }>()
  for (const g of dupGroups) {
    const p = byPark.get(g.park) ?? { groups: 0, items: 0 }
    p.groups++
    p.items += g.items.length
    byPark.set(g.park, p)
  }
  console.log('\nBy park:')
  for (const [park, counts] of [...byPark.entries()].sort((a, b) => b[1].items - a[1].items)) {
    console.log(`  ${park.padEnd(50)} ${counts.groups} groups, ${counts.items} items`)
  }

  // By source
  const bySource = new Map<string, number>()
  for (const g of dupGroups) {
    bySource.set(g.source, (bySource.get(g.source) ?? 0) + g.items.length)
  }
  console.log('\nBy source:')
  for (const [src, count] of [...bySource.entries()].sort((a, b) => b - a)) {
    console.log(`  ${src.padEnd(20)} ${count} items`)
  }

  // By confidence
  const byConf = new Map<number, number>()
  for (const g of dupGroups) {
    const c = g.confidence ?? 0
    byConf.set(c, (byConf.get(c) ?? 0) + g.items.length)
  }
  console.log('\nBy confidence:')
  for (const [conf, count] of [...byConf.entries()].sort((a, b) => a - b)) {
    console.log(`  conf=${String(conf).padEnd(5)} ${count} items`)
  }

  // Show top 30 largest groups
  console.log(`\n${'─'.repeat(85)}`)
  console.log('  TOP 30 LARGEST DUPLICATE GROUPS')
  console.log(`${'─'.repeat(85)}`)
  for (const g of dupGroups.slice(0, 30)) {
    console.log(`\n  ${g.restaurant} @ ${g.park}`)
    console.log(`  ${g.items.length} items sharing: ${g.calories}cal | profile: ${g.nutritionKey} | src=${g.source} conf=${g.confidence}`)
    // Show mix of categories
    const cats = new Map<string, number>()
    for (const i of g.items) cats.set(i.category, (cats.get(i.category) ?? 0) + 1)
    console.log(`  Categories: ${[...cats.entries()].map(([c, n]) => `${c}(${n})`).join(', ')}`)
    // Show first 8 item names
    const shown = g.items.slice(0, 8)
    for (const i of shown) console.log(`    - ${i.name} [${i.category}]`)
    if (g.items.length > 8) console.log(`    ... and ${g.items.length - 8} more`)
  }

  // Identify fixable patterns
  console.log(`\n${'═'.repeat(85)}`)
  console.log('  FIXABLE PATTERNS')
  console.log(`${'═'.repeat(85)}`)

  // Pattern 1: Same restaurant, wildly different food types sharing same nutrition
  let mixedCatCount = 0
  for (const g of dupGroups) {
    const cats = new Set(g.items.map(i => i.category))
    if (cats.size >= 3) mixedCatCount += g.items.length
  }
  console.log(`  Mixed-category duplicates (3+ categories): ${mixedCatCount} items`)
  console.log('    → These are almost certainly template data (an entree and dessert can\'t have same nutrition)')

  // Pattern 2: High-confidence duplicates (supposed to be accurate)
  let highConfDups = 0
  for (const g of dupGroups) {
    if ((g.confidence ?? 0) >= 60) highConfDups += g.items.length
  }
  console.log(`  High-confidence duplicates (conf≥60): ${highConfDups} items`)

  // Pattern 3: Low-confidence bulk estimates
  let lowConfDups = 0
  for (const g of dupGroups) {
    if ((g.confidence ?? 0) <= 40) lowConfDups += g.items.length
  }
  console.log(`  Low-confidence duplicates (conf≤40): ${lowConfDups} items`)
  console.log('    → These are already flagged as estimates, lower priority')
}

main().catch(console.error)
