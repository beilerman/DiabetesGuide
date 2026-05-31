import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

async function check() {
  // Items with actual calories
  const { count: withCal } = await supabase.from('nutritional_data')
    .select('*', { count: 'exact', head: true }).gt('calories', 0)

  // Items with zero calories (or null)
  const { count: zeroCal } = await supabase.from('nutritional_data')
    .select('*', { count: 'exact', head: true }).or('calories.eq.0,calories.is.null')

  // AI estimated items
  const { count: ai } = await supabase.from('nutritional_data')
    .select('*', { count: 'exact', head: true })
    .eq('confidence_score', 35)

  // Source distribution - need pagination
  let allSources: any[] = []
  let offset = 0
  while (true) {
    const { data } = await supabase.from('nutritional_data')
      .select('source').range(offset, offset + 999)
    if (!data?.length) break
    allSources = allSources.concat(data)
    if (data.length < 1000) break
    offset += 1000
  }
  const sourceCounts: Record<string, number> = { 'null': 0 }
  allSources.forEach(d => {
    const src = d.source || 'null'
    sourceCounts[src] = (sourceCounts[src] || 0) + 1
  })

  // Sample items with no nutrition
  const { data: zeroItems } = await supabase.from('nutritional_data')
    .select('*, menu_item:menu_items(name)')
    .or('calories.eq.0,calories.is.null')
    .limit(10)

  console.log('=== Nutrition Data Quality ===')
  console.log(`Items with calories > 0: ${withCal}`)
  console.log(`Items with zero/null calories: ${zeroCal}`)
  console.log(`AI estimated (conf=35): ${ai}`)
  console.log('')
  console.log('By source:')
  Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).forEach(([src, cnt]) => {
    console.log(`  ${src}: ${cnt}`)
  })
  console.log('')
  console.log('Sample items with zero/null calories:')
  zeroItems?.forEach(item => {
    const name = Array.isArray(item.menu_item) ? item.menu_item[0]?.name : item.menu_item?.name
    console.log(`  - ${name}: ${item.calories} cal`)
  })
}

check()
