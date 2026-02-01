import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const supabase = createClient(url, key)

const ALLERGEN_KEYWORDS: Record<string, { keywords: string[]; severity: 'contains' | 'may_contain' }[]> = {
  'milk': [
    { keywords: ['cheese', 'cream', 'butter', 'milk', 'yogurt', 'ice cream', 'queso', 'béchamel', 'alfredo', 'mozzarella', 'cheddar', 'provolone', 'parmesan', 'whipped'], severity: 'contains' },
  ],
  'wheat': [
    { keywords: ['bread', 'bun', 'wrap', 'tortilla', 'pasta', 'noodle', 'breaded', 'fried', 'churro', 'cake', 'cookie', 'brownie', 'pretzel', 'croissant', 'panini', 'flatbread', 'pita', 'waffle', 'pancake'], severity: 'contains' },
  ],
  'eggs': [
    { keywords: ['egg', 'mayo', 'mayonnaise', 'aioli', 'custard', 'meringue', 'hollandaise', 'quiche', 'frittata'], severity: 'contains' },
  ],
  'soy': [
    { keywords: ['soy', 'tofu', 'edamame', 'teriyaki', 'miso'], severity: 'may_contain' },
  ],
  'peanuts': [
    { keywords: ['peanut', 'peanut butter'], severity: 'contains' },
  ],
  'tree_nuts': [
    { keywords: ['almond', 'cashew', 'pecan', 'walnut', 'hazelnut', 'pistachio', 'macadamia', 'praline'], severity: 'contains' },
  ],
  'fish': [
    { keywords: ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'mahi', 'grouper', 'snapper', 'bass', 'trout', 'anchov'], severity: 'contains' },
  ],
  'shellfish': [
    { keywords: ['shrimp', 'crab', 'lobster', 'clam', 'mussel', 'oyster', 'scallop', 'crawfish', 'calamari', 'squid'], severity: 'contains' },
  ],
}

async function enrich() {
  // Fetch all menu items
  const { data: items, error: itemsErr } = await supabase
    .from('menu_items')
    .select('id, name, description')
  if (itemsErr) { console.error('Failed to fetch menu items:', itemsErr); process.exit(1) }

  // Fetch existing allergen records to skip duplicates
  const { data: existing, error: existErr } = await supabase
    .from('allergens')
    .select('menu_item_id, allergen_type')
  if (existErr) { console.error('Failed to fetch allergens:', existErr); process.exit(1) }

  const existingSet = new Set(
    (existing ?? []).map((r: { menu_item_id: string; allergen_type: string }) => `${r.menu_item_id}::${r.allergen_type}`)
  )

  const toInsert: { menu_item_id: string; allergen_type: string; severity: string }[] = []
  const itemsWithAllergens = new Set<string>()

  for (const item of items ?? []) {
    const text = `${item.name} ${item.description ?? ''}`.toLowerCase()

    for (const [allergen, rules] of Object.entries(ALLERGEN_KEYWORDS)) {
      const key = `${item.id}::${allergen}`
      if (existingSet.has(key)) continue

      for (const rule of rules) {
        const matched = rule.keywords.some(kw => text.includes(kw))
        if (matched) {
          toInsert.push({ menu_item_id: item.id, allergen_type: allergen, severity: rule.severity })
          itemsWithAllergens.add(item.id)
          break
        }
      }
    }
  }

  if (toInsert.length > 0) {
    // Batch insert in chunks of 500
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500)
      const { error } = await supabase.from('allergens').insert(chunk)
      if (error) console.error('Insert error:', error)
    }
  }

  console.log(`Inferred ${toInsert.length} allergen records for ${itemsWithAllergens.size} items`)
}

enrich().catch(console.error)
