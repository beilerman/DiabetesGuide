import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

const url = process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const sb = createClient(url, key)

async function dump() {
  const all: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from('menu_items')
      .select('id, name, category, is_vegetarian, is_fried, description, restaurant:restaurants(name, park:parks(name)), nutritional_data(calories, carbs, fat, sugar, protein, fiber, sodium, cholesterol, source, confidence_score)')
      .range(from, from + 499)
    if (error) { console.error(error); break }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 500) break
    from += 500
  }
  writeFileSync('audit-dump.json', JSON.stringify(all, null, 2))
  console.log('Dumped ' + all.length + ' items')
}
dump()
