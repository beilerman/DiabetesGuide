import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

interface Item {
  id: string
  name: string
  category: string
  description: string | null
  restaurant: { name: string; park: { name: string } }
  nutritional_data: Array<{
    id: string
    calories: number | null
    carbs: number | null
    fat: number | null
    protein: number | null
    source: string
    confidence_score: number | null
  }>
}

async function fetchAll(): Promise<Item[]> {
  const all: Item[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from('menu_items')
      .select('id, name, category, description, restaurant:restaurants(name, park:parks(name)), nutritional_data(id, calories, carbs, fat, protein, source, confidence_score)')
      .range(from, from + 499)
    if (error) { console.error(error); break }
    if (!data || data.length === 0) break
    all.push(...(data as unknown as Item[]))
    if (data.length < 500) break
    from += 500
  }
  return all
}

async function main() {
  console.log('Fetching all items...')
  const items = await fetchAll()
  console.log(`Fetched ${items.length} items\n`)

  // Find entrees with < 100 calories
  const lowCal = items.filter(i => {
    if (i.category !== 'entree') return false
    const nd = i.nutritional_data?.[0]
    if (!nd || nd.calories === null) return false
    return nd.calories > 0 && nd.calories < 100
  })

  console.log(`Low-calorie entrees (<100 cal): ${lowCal.length}`)

  // Categorize them
  const stillBeverage: Item[] = []
  const stillDessert: Item[] = []
  const tooLowForEntree: Item[] = []
  const possiblyCorrect: Item[] = []

  for (const item of lowCal) {
    const n = item.name.toLowerCase()

    // Beverages that slipped through category fix
    if (/\b(tea|coffee|juice|water|soda|beer|wine|cocktail|drink|lemonade|chai|matcha|boba)\b/i.test(n) ||
        /\b(shot|glass|pour|neat|rocks)\b/i.test(n)) {
      stillBeverage.push(item)
    }
    // Dessert-like
    else if (/\b(candy|chocolate|gummy|cookie|brownie|cupcake)\b/i.test(n)) {
      stillDessert.push(item)
    }
    // Condiments/extras that aren't entrees
    else if (/\b(sauce|dip|dressing|topping|extra|add|side|syrup|spread|butter)\b/i.test(n)) {
      tooLowForEntree.push(item)
    }
    // Small items that could legitimately be low-cal
    else if (/\b(edamame|miso|broth|cup|small|kid)\b/i.test(n) && (item.nutritional_data[0].calories ?? 0) >= 50) {
      possiblyCorrect.push(item)
    }
    else {
      tooLowForEntree.push(item)
    }
  }

  const show = (label: string, group: Item[], max: number) => {
    if (group.length === 0) return
    console.log(`\n  ${label} (${group.length})`)
    console.log(`  ${'─'.repeat(60)}`)
    for (const item of group.slice(0, max)) {
      const nd = item.nutritional_data[0]
      const r = item.restaurant as any
      console.log(`    ${nd.calories}cal | ${item.name} [${item.category}] | ${r?.name ?? '?'} @ ${r?.park?.name ?? '?'} | conf=${nd.confidence_score}`)
    }
    if (group.length > max) console.log(`    ... and ${group.length - max} more`)
  }

  show('Still beverages (need category fix)', stillBeverage, 30)
  show('Still desserts (need category fix)', stillDessert, 20)
  show('Condiments/extras (not real entrees)', tooLowForEntree, 40)
  show('Possibly correct (small/light items)', possiblyCorrect, 20)

  // Also check: how many entrees now exist at each calorie level?
  const entrees = items.filter(i => i.category === 'entree' && i.nutritional_data?.[0]?.calories)
  const calBuckets = new Map<string, number>()
  for (const item of entrees) {
    const cal = item.nutritional_data[0].calories!
    let bucket: string
    if (cal < 50) bucket = '0-49'
    else if (cal < 100) bucket = '50-99'
    else if (cal < 200) bucket = '100-199'
    else if (cal < 300) bucket = '200-299'
    else if (cal < 500) bucket = '300-499'
    else bucket = '500+'
    calBuckets.set(bucket, (calBuckets.get(bucket) ?? 0) + 1)
  }
  console.log('\nEntree calorie distribution:')
  for (const bucket of ['0-49', '50-99', '100-199', '200-299', '300-499', '500+']) {
    console.log(`  ${bucket.padEnd(10)} ${calBuckets.get(bucket) ?? 0}`)
  }
}

main().catch(console.error)
