import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(url, key)
const parkName = process.argv[2] || 'Disney Springs'

async function main() {
  const { data: parks } = await sb.from('parks').select('id, name').ilike('name', `%${parkName}%`)
  if (!parks || parks.length === 0) {
    console.log(`No parks matching "${parkName}"`)
    process.exit(0)
  }

  for (const park of parks) {
    console.log(`\n=== ${park.name} ===\n`)

    const { data: restaurants } = await sb
      .from('restaurants')
      .select('id, name, land, cuisine_type')
      .eq('park_id', park.id)
      .order('name')

    if (!restaurants || restaurants.length === 0) {
      console.log('  No restaurants')
      continue
    }

    const sparse: { name: string; land: string | null; count: number }[] = []
    const full: { name: string; land: string | null; count: number }[] = []
    let totalItems = 0

    for (const r of restaurants) {
      const { count } = await sb.from('menu_items').select('id', { count: 'exact' }).eq('restaurant_id', r.id)
      const c = count || 0
      totalItems += c
      const entry = { name: r.name, land: r.land, count: c }
      if (c <= 5) sparse.push(entry)
      else full.push(entry)
    }

    console.log(`Total: ${restaurants.length} restaurants, ${totalItems} items\n`)

    if (sparse.length > 0) {
      console.log(`--- SPARSE (≤5 items) — ${sparse.length} restaurants ---`)
      sparse.sort((a, b) => a.count - b.count)
      for (const r of sparse) {
        console.log(`  ${r.count} items | ${r.name} | ${r.land || '(no land)'}`)
      }
      console.log('')
    }

    console.log(`--- FULL (>5 items) — ${full.length} restaurants ---`)
    full.sort((a, b) => a.count - b.count)
    for (const r of full) {
      console.log(`  ${r.count.toString().padStart(3)} items | ${r.name} | ${r.land || '(no land)'}`)
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
