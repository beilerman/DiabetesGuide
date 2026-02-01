import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const { data, error } = await sb
    .from('menu_items')
    .select('id, name, description, nutritional_data(id, sugar, protein, fiber, sodium)')

  if (error) { console.error(error); process.exit(1) }

  const unmatched = data!.filter((r: any) => {
    const n = Array.isArray(r.nutritional_data) ? r.nutritional_data[0] : r.nutritional_data
    return n && n.sugar == null && n.protein == null && n.fiber == null && n.sodium == null
  })

  for (const r of unmatched) {
    console.log(`${r.name} ||| ${r.description || ''}`)
  }
  console.log(`---\nTotal unmatched: ${unmatched.length}`)
}

main().catch(console.error)
