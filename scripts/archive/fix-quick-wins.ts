import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const DRY_RUN = !process.argv.includes('--apply')

interface NutRow {
  id: string
  menu_item_id: string
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
}

interface Item {
  id: string
  name: string
  category: string
  description: string | null
  is_fried: boolean
  restaurant: { name: string; park: { name: string } }
  nutritional_data: NutRow[]
}

async function fetchAll(): Promise<Item[]> {
  const all: Item[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from('menu_items')
      .select('id, name, category, description, is_fried, restaurant:restaurants(name, park:parks(name)), nutritional_data(id, menu_item_id, calories, carbs, fat, sugar, protein, fiber, sodium, cholesterol, source, confidence_score)')
      .range(from, from + 499)
    if (error) { console.error(error); break }
    if (!data || data.length === 0) break
    all.push(...(data as unknown as Item[]))
    if (data.length < 500) break
    from += 500
  }
  return all
}

async function update(id: string, fields: Record<string, number | null>) {
  if (DRY_RUN) return
  const { error } = await sb.from('nutritional_data').update(fields).eq('id', id)
  if (error) console.error('  UPDATE FAILED', id, error.message)
}

// ─── Sodium:calorie ratio approach ──────────────────────────────────────
// Normal ratio: 0.5-3.0 mg sodium per calorie. >6.0 is clearly wrong.
// Soups can be salty: allow up to 5.0. Beverages allow 0.
function maxSodiumRatio(name: string, category: string): number {
  const n = name.toLowerCase()
  if (/soup|chowder|gumbo|bisque|broth|ramen|pho/i.test(n)) return 5.0
  if (/wings|buffalo/i.test(n)) return 4.0
  if (/pickle|soy|teriyaki/i.test(n)) return 5.0
  if (category === 'beverage') return 3.0
  if (category === 'dessert') return 3.0
  return 4.0 // general food max ratio
}

// Typical sodium:calorie ratios by food type for corrections
function typicalSodiumRatio(name: string, category: string): number {
  const n = name.toLowerCase()
  if (/soup|chowder|gumbo|bisque|broth|ramen|pho/i.test(n)) return 3.5
  if (/wings|buffalo/i.test(n)) return 3.0
  if (/pizza|flatbread/i.test(n)) return 2.2
  if (/burger|sandwich|wrap/i.test(n)) return 2.0
  if (/fries|tots|nachos/i.test(n)) return 2.5
  if (category === 'beverage') return 0.3
  if (category === 'dessert') return 0.5
  if (category === 'side' || category === 'snack') return 2.0
  return 1.8 // general entree
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (use --apply to write) ===' : '=== APPLYING FIXES ===')
  console.log('Fetching all items...')
  const items = await fetchAll()
  console.log(`Fetched ${items.length} items\n`)

  let sodiumFixes = 0
  let sugarFixes = 0
  let fiberFixes = 0
  const sodiumItems: string[] = []
  const sugarItems: string[] = []
  const fiberItems: string[] = []

  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd) continue

    const r = item.restaurant as any
    const park = r?.park?.name ?? '?'
    const rest = r?.name ?? '?'
    const cal = nd.calories ?? 0
    const changes: Record<string, number | null> = {}

    // ─── FIX 1: Extreme sodium (ratio-based) ──────────────────────────
    if (nd.sodium !== null && cal > 0) {
      const ratio = nd.sodium / cal
      const maxRatio = maxSodiumRatio(item.name, item.category)
      if (ratio > maxRatio && nd.sodium > 3000) {
        // Correct using typical ratio for this food type
        const typicalRatio = typicalSodiumRatio(item.name, item.category)
        const corrected = Math.round(cal * typicalRatio)

        changes.sodium = corrected
        sodiumFixes++
        const msg = `  SODIUM: ${nd.sodium}mg → ${corrected}mg (ratio ${ratio.toFixed(1)} → ${typicalRatio}) | ${item.name} [${cal}cal] | ${rest} @ ${park}`
        sodiumItems.push(msg)
        console.log(msg)
      }
    }

    // ─── FIX 2: Sugar > Carbs ───────────────────────────────────────
    if (nd.sugar !== null && nd.carbs !== null && nd.sugar > nd.carbs && nd.carbs >= 0) {
      const oldSugar = nd.sugar
      // Cap sugar to carbs (sugar is a subset of carbs)
      changes.sugar = nd.carbs
      sugarFixes++
      const msg = `  SUGAR>CARBS: sugar ${oldSugar}g → ${nd.carbs}g (carbs=${nd.carbs}g) | ${item.name} | ${rest} @ ${park}`
      sugarItems.push(msg)
      console.log(msg)
    }

    // ─── FIX 3: Fiber > Carbs ───────────────────────────────────────
    if (nd.fiber !== null && nd.carbs !== null && nd.fiber > nd.carbs && nd.carbs >= 0) {
      const oldFiber = nd.fiber
      // Fiber can't exceed carbs; set to 10% of carbs
      changes.fiber = Math.round(nd.carbs * 0.1)
      fiberFixes++
      const msg = `  FIBER>CARBS: fiber ${oldFiber}g → ${changes.fiber}g (carbs=${nd.carbs}g) | ${item.name} | ${rest} @ ${park}`
      fiberItems.push(msg)
      console.log(msg)
    }

    // Apply changes
    if (Object.keys(changes).length > 0) {
      // Cap confidence at current level (don't increase)
      const conf = Math.min(nd.confidence_score ?? 40, 40)
      await update(nd.id, { ...changes, confidence_score: conf })
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(70)}`)
  console.log(`  SUMMARY`)
  console.log(`${'═'.repeat(70)}`)
  console.log(`  Sodium fixes:     ${sodiumFixes}`)
  console.log(`  Sugar>Carbs fixes: ${sugarFixes}`)
  console.log(`  Fiber>Carbs fixes: ${fiberFixes}`)
  console.log(`  Total:            ${sodiumFixes + sugarFixes + fiberFixes}`)
  console.log(`${'═'.repeat(70)}`)
  if (DRY_RUN) console.log('\n  Run with --apply to write changes to database')
}

main().catch(console.error)
