import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const sb = createClient(url, key)

async function fix() {
  // Fix Coffee Cake Cookie — incorrectly zeroed by coffee regex (it's a cookie, not coffee)
  const { data: cookies } = await sb.from('menu_items')
    .select('id, name, nutritional_data(id)')
    .ilike('name', '%Coffee Cake Cookie%')
  for (const c of cookies ?? []) {
    const nd = (c as any).nutritional_data?.[0]
    if (!nd) continue
    // Gideon's cookies are famously half-pound: ~900 cal
    await sb.from('nutritional_data').update({
      calories: 900, carbs: 100, fat: 50, protein: 12, sugar: 55, fiber: 2, sodium: 450, confidence_score: 60
    }).eq('id', nd.id)
    console.log(`Fixed: ${c.name}`)
  }

  // Fix Coffee-rubbed Rib-Eye Beef Puff — incorrectly zeroed by coffee regex
  const { data: puffs } = await sb.from('menu_items')
    .select('id, name, nutritional_data(id)')
    .ilike('name', '%Coffee-rubbed Rib-Eye%')
  for (const p of puffs ?? []) {
    const nd = (p as any).nutritional_data?.[0]
    if (!nd) continue
    await sb.from('nutritional_data').update({
      calories: 450, carbs: 25, fat: 30, protein: 20, sugar: 3, fiber: 1, sodium: 680, confidence_score: 45
    }).eq('id', nd.id)
    console.log(`Fixed: ${p.name}`)
  }

  // Also fix some vegetarian false positives from Fix 5 that matched on description keywords
  // BBQ Jackfruit Sandwich — jackfruit IS vegetarian
  const { data: jackfruit } = await sb.from('menu_items')
    .select('id, name')
    .ilike('name', '%Jackfruit%')
  for (const j of jackfruit ?? []) {
    await sb.from('menu_items').update({ is_vegetarian: true }).eq('id', j.id)
    console.log(`Fixed vegetarian: ${j.name} → true (jackfruit is plant-based)`)
  }

  // DOLE Whip Mango and Chamoy Float — DOLE Whip IS vegetarian (chamoy triggered false positive)
  const { data: dole } = await sb.from('menu_items')
    .select('id, name')
    .ilike('name', '%DOLE Whip Mango%')
  for (const d of dole ?? []) {
    await sb.from('menu_items').update({ is_vegetarian: true }).eq('id', d.id)
    console.log(`Fixed vegetarian: ${d.name} → true`)
  }
}

fix().catch(console.error)
