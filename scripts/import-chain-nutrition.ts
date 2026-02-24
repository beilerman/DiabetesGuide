import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const DRY_RUN = !process.argv.includes('--apply')

interface ChainData {
  chain_name: string
  restaurant_names?: string[]
  park_name?: string
  source_url: string
  items: Array<{
    name: string
    category?: string
    calories: number
    carbs: number
    fat: number
    protein: number
    sugar?: number
    fiber?: number
    sodium?: number
    cholesterol?: number
  }>
}

interface DbItem {
  id: string
  name: string
  category: string
  restaurant_id: string
  nutritional_data: Array<{
    id: string
    calories: number | null
    confidence_score: number | null
    source: string
  }>
}

// Normalize names for fuzzy matching
function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/\s*[-–—]\s*/g, ' ')
    .replace(/\s*\(.*?\)\s*/g, ' ')  // remove parentheticals
    .replace(/\s+/g, ' ')
    .trim()
}

// Score how well two names match (0-1)
function matchScore(dbName: string, chainName: string): number {
  const a = normalize(dbName)
  const b = normalize(chainName)

  // Exact match
  if (a === b) return 1.0

  // One contains the other
  if (a.includes(b) || b.includes(a)) return 0.9

  // Word overlap
  const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 2))
  const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 2))
  const overlap = [...wordsA].filter(w => wordsB.has(w)).length
  const total = Math.max(wordsA.size, wordsB.size)
  if (total === 0) return 0

  return overlap / total
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (use --apply to write) ===' : '=== APPLYING CHAIN NUTRITION ===')

  // Load all chain data files
  const chainsDir = join(process.cwd(), 'data', 'chains')
  const files = readdirSync(chainsDir).filter(f => f.endsWith('.json'))

  let totalMatched = 0
  let totalUpdated = 0
  let totalSkipped = 0

  for (const file of files) {
    const chain: ChainData = JSON.parse(readFileSync(join(chainsDir, file), 'utf-8'))
    console.log(`\n${'═'.repeat(70)}`)
    console.log(`  ${chain.chain_name} (${chain.items.length} items in data file)`)
    console.log(`${'═'.repeat(70)}`)

    // Find matching restaurants in DB
    const chainNameLower = chain.chain_name.toLowerCase()
    const { data: restaurants } = await sb.from('restaurants')
      .select('id, name, park:parks(name)')
      .ilike('name', `%${chainNameLower}%`)

    if (!restaurants?.length) {
      // Try restaurant_names if provided
      if (chain.restaurant_names?.length) {
        const allRests = []
        for (const rn of chain.restaurant_names) {
          const { data } = await sb.from('restaurants')
            .select('id, name, park:parks(name)')
            .ilike('name', `%${rn}%`)
          if (data?.length) allRests.push(...data)
        }
        if (!allRests.length) {
          console.log('  No matching restaurants found in DB')
          continue
        }
        (restaurants as any[]).push(...allRests)
      } else {
        console.log('  No matching restaurants found in DB')
        continue
      }
    }

    // Deduplicate restaurants by ID
    const uniqueRests = [...new Map((restaurants as any[]).map(r => [r.id, r])).values()]
    console.log(`  Found ${uniqueRests.length} restaurant(s): ${uniqueRests.map((r: any) => `${r.name} @ ${r.park?.name}`).join(', ')}`)

    // Get all items from these restaurants
    const dbItems: DbItem[] = []
    for (const r of uniqueRests) {
      const { data } = await sb.from('menu_items')
        .select('id, name, category, restaurant_id, nutritional_data(id, calories, confidence_score, source)')
        .eq('restaurant_id', r.id)
      if (data?.length) dbItems.push(...(data as unknown as DbItem[]))
    }

    console.log(`  ${dbItems.length} items in DB`)

    // Match chain items to DB items
    let matched = 0, updated = 0, skipped = 0, noMatch = 0

    for (const chainItem of chain.items) {
      // Find best matching DB item
      let bestMatch: DbItem | null = null
      let bestScore = 0

      for (const dbItem of dbItems) {
        const score = matchScore(dbItem.name, chainItem.name)
        if (score > bestScore) {
          bestScore = score
          bestMatch = dbItem
        }
      }

      if (!bestMatch || bestScore < 0.5) {
        noMatch++
        continue
      }

      matched++
      const nd = bestMatch.nutritional_data?.[0]
      if (!nd) {
        noMatch++
        continue
      }

      // Skip if already high confidence (official data already imported)
      if ((nd.confidence_score ?? 0) >= 85) {
        skipped++
        continue
      }

      // Update with chain official data
      const fields: Record<string, number | string> = {
        calories: chainItem.calories,
        carbs: chainItem.carbs,
        fat: chainItem.fat,
        protein: chainItem.protein,
        confidence_score: 90,
        source: 'official',
      }
      if (chainItem.sugar !== undefined) fields.sugar = chainItem.sugar
      if (chainItem.fiber !== undefined) fields.fiber = chainItem.fiber
      if (chainItem.sodium !== undefined) fields.sodium = chainItem.sodium
      if (chainItem.cholesterol !== undefined) fields.cholesterol = chainItem.cholesterol

      updated++
      console.log(`  ✓ ${chainItem.name} → ${bestMatch.name} (score=${bestScore.toFixed(2)}, ${nd.calories ?? '?'}→${chainItem.calories}cal)`)

      if (!DRY_RUN) {
        const { error } = await sb.from('nutritional_data').update(fields).eq('id', nd.id)
        if (error) console.error(`    UPDATE FAILED: ${error.message}`)
      }
    }

    console.log(`\n  Matched: ${matched}, Updated: ${updated}, Already high-conf: ${skipped}, No match: ${noMatch}`)
    totalMatched += matched
    totalUpdated += updated
    totalSkipped += skipped
  }

  console.log(`\n${'═'.repeat(70)}`)
  console.log(`  TOTAL: ${totalMatched} matched, ${totalUpdated} updated, ${totalSkipped} already done`)
  console.log(`${'═'.repeat(70)}`)
  if (DRY_RUN) console.log('\n  Run with --apply to write changes')
}

main().catch(console.error)
