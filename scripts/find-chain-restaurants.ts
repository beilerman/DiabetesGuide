import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Known chain restaurants that publish nutrition data
const CHAINS = [
  { pattern: /starbucks/i, name: 'Starbucks', hasNutrition: true },
  { pattern: /jamba/i, name: 'Jamba', hasNutrition: true },
  { pattern: /wetzel/i, name: "Wetzel's Pretzels", hasNutrition: true },
  { pattern: /auntie anne/i, name: "Auntie Anne's", hasNutrition: true },
  { pattern: /cinnabon/i, name: 'Cinnabon', hasNutrition: true },
  { pattern: /blaze pizza/i, name: 'Blaze Pizza', hasNutrition: true },
  { pattern: /chicken guy/i, name: 'Chicken Guy!', hasNutrition: true },
  { pattern: /panda express/i, name: 'Panda Express', hasNutrition: true },
  { pattern: /cold stone/i, name: 'Cold Stone Creamery', hasNutrition: true },
  { pattern: /haagen.daz/i, name: 'Häagen-Dazs', hasNutrition: true },
  { pattern: /ben.jerry/i, name: "Ben & Jerry's", hasNutrition: true },
  { pattern: /moe.*southwest/i, name: "Moe's Southwest Grill", hasNutrition: true },
  { pattern: /voodoo dough/i, name: 'Voodoo Doughnut', hasNutrition: true },
  { pattern: /sprinkles/i, name: 'Sprinkles', hasNutrition: true },
  { pattern: /planet hollywood/i, name: 'Planet Hollywood', hasNutrition: false },
  { pattern: /rainforest cafe/i, name: 'Rainforest Cafe', hasNutrition: false },
  { pattern: /t-rex/i, name: 'T-REX', hasNutrition: false },
  { pattern: /ghirardelli/i, name: 'Ghirardelli', hasNutrition: true },
  { pattern: /skyline chili/i, name: 'Skyline Chili', hasNutrition: true },
  { pattern: /larosa/i, name: "LaRosa's Pizza", hasNutrition: true },
  { pattern: /dippin.dots/i, name: "Dippin' Dots", hasNutrition: true },
  { pattern: /subway/i, name: 'Subway', hasNutrition: true },
]

async function main() {
  // Get all restaurants
  const all: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from('restaurants')
      .select('id, name, park:parks(name)')
      .range(from, from + 499)
    if (error) { console.error(error); break }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 500) break
    from += 500
  }

  console.log(`Total restaurants: ${all.length}\n`)

  // Match chains
  for (const chain of CHAINS) {
    const matches = all.filter(r => chain.pattern.test(r.name))
    if (matches.length === 0) continue

    // Count items per match
    let totalItems = 0
    let lowConfItems = 0
    for (const r of matches) {
      const { count: total } = await sb.from('menu_items')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', r.id)

      const { count: lowConf } = await sb.from('menu_items')
        .select('id, nutritional_data!inner(confidence_score)', { count: 'exact', head: true })
        .eq('restaurant_id', r.id)
        .lt('nutritional_data.confidence_score', 70)

      totalItems += total ?? 0
      lowConfItems += lowConf ?? 0
    }

    const parks = [...new Set(matches.map((r: any) => r.park?.name ?? '?'))].join(', ')
    const status = chain.hasNutrition ? '✓ Official nutrition available' : '✗ No official data'
    console.log(`${chain.name} (${matches.length} locations, ${totalItems} items, ${lowConfItems} upgradeable)`)
    console.log(`  ${status}`)
    console.log(`  Parks: ${parks}`)
    console.log()
  }
}

main().catch(console.error)
