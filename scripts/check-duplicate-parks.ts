import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const supabase = createClient(url, key)

async function main() {
  const { data: parks } = await supabase
    .from('parks')
    .select('id, name, location')
    .order('name')

  if (!parks) return

  // Find potential duplicates by fuzzy name match
  console.log('=== Potential Duplicate Parks ===\n')

  const seen = new Map<string, typeof parks>()
  for (const park of parks) {
    // Normalize: lowercase, strip "Disney's", "'s", "Park", "Theme Park"
    const norm = park.name.toLowerCase()
      .replace(/disney'?s?\s*/g, '')
      .replace(/\s*(theme\s+)?park$/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    if (!seen.has(norm)) seen.set(norm, [])
    seen.get(norm)!.push(park)
  }

  let dupeCount = 0
  for (const [norm, group] of seen) {
    if (group.length > 1) {
      dupeCount++
      console.log(`Group "${norm}":`)
      for (const p of group) {
        // Count restaurants
        const { count } = await supabase
          .from('restaurants')
          .select('id', { count: 'exact', head: true })
          .eq('park_id', p.id)

        // Count items
        const { data: rests } = await supabase
          .from('restaurants')
          .select('id')
          .eq('park_id', p.id)

        let itemCount = 0
        for (const r of rests ?? []) {
          const { count: ic } = await supabase
            .from('menu_items')
            .select('id', { count: 'exact', head: true })
            .eq('restaurant_id', r.id)
          itemCount += ic ?? 0
        }

        console.log(`  - "${p.name}" [${p.location}] — ${count} restaurants, ${itemCount} items — ID: ${p.id}`)
      }
      console.log('')
    }
  }

  if (dupeCount === 0) {
    console.log('No duplicate parks found.')
  } else {
    console.log(`Found ${dupeCount} potential duplicate group(s).`)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
