/**
 * Fix MEDIUM accuracy findings from Feb 27 audit.
 *
 * Phase 3: Zero-protein meat items (8 items)
 *   - 7 Shrimp Cocktails: set protein=20g (standard 4oz shrimp serving)
 *   - 1 Root Beer-brined Pork: set protein=25g (standard pulled pork serving)
 *
 * Phase 4: Fat=0 and calorie-sync issues (~20 items)
 *   - 4 Chocolate Milks (Thirsty River Bar, Burning Blade, Oak & Star, Meteor):
 *     set protein=8, fat=5 (standard chocolate milk macros)
 *   - Fat=0 items where macros don't explain stated calories:
 *     estimate fat as (stated_cal - P*4 - C*4) / 9
 *
 * Usage: npx tsx scripts/fix-medium-batch.ts [--dry-run]
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

function loadEnv(): Record<string, string> {
  const content = readFileSync(resolve(ROOT, '.env.local'), 'utf-8')
  const vars: Record<string, string> = {}
  content.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) vars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
    }
  })
  return vars
}

const env = loadEnv()
const url = env['VITE_SUPABASE_URL'] || env['SUPABASE_URL']
const key = env['SUPABASE_SERVICE_ROLE_KEY']
if (!url || !key) { console.error('Missing env vars'); process.exit(1) }

const supabase = createClient(url, key)
const DRY_RUN = process.argv.includes('--dry-run')

interface Fix {
  namePattern: string | RegExp
  restaurant?: string | RegExp
  update: Record<string, number>
  reason: string
  /** Only apply if current value matches this condition */
  condition?: (nd: any) => boolean
}

const fixes: Fix[] = [
  // === Phase 3: Zero-protein meat items ===

  // Shrimp Cocktail variants (6 restaurants + 1 Jalapeno Pickled variant)
  // Standard 4oz shrimp serving: ~20g protein, ~1g fat, ~0g carbs, ~100 cal
  {
    namePattern: /shrimp cocktail/i,
    update: { protein: 20 },
    condition: (nd) => nd.protein === 0,
    reason: 'Shrimp cocktail must have protein; standard 4oz shrimp = 20g protein',
  },

  // Root Beer-brined Pork — meat dish with 0g protein
  // Standard pulled pork serving: ~25g protein
  {
    namePattern: 'Root Beer-brined Pork',
    update: { protein: 25 },
    condition: (nd) => nd.protein === 0,
    reason: 'Pork dish must have protein; standard serving = 25g protein',
  },

  // === Phase 4: Chocolate milk macro fixes ===
  // These are at parks that serve kids' chocolate milk with 0g protein/fat
  // Standard chocolate milk (8oz): ~8g protein, ~5g fat, ~26g carbs, ~190 cal
  {
    namePattern: /^chocolate milk$/i,
    restaurant: /Thirsty River|Burning Blade|Oak & Star|Meteor/i,
    update: { protein: 8, fat: 5 },
    condition: (nd) => (nd.protein === 0 || nd.fat === 0),
    reason: 'Chocolate milk: standard 8oz = 8g protein, 5g fat',
  },
]

// Simple alcoholic beverage detection for fat-gap filtering
const ALCOHOL_NAME_PATTERN = /\b(beer|ale|lager|stout|ipa|wine|merlot|chardonnay|cabernet|pinot|prosecco|champagne|margarita|mojito|daiquiri|martini|manhattan|cocktail|bourbon|whiskey|vodka|rum|tequila|gin|sake|sangria|spritz|aperol|negroni|paloma|mai\s*tai|old\s*fashioned|mule|sour|collins|highball|flight|on\s*the\s*rocks|hard\s*cider|hard\s*seltzer|mimosa|bellini)\b/i
const ALCOHOL_NEGATIVE = /\b(batter(?:ed)?|bread(?:ed)?|sauce|glaze|glazed|crust(?:ed)?|brined|braised|marinated|infused|root\s*beer|ginger\s*beer|ginger\s*ale|butterbeer|shrimp\s*cocktail|fruit\s*cocktail)\b/i

function isLikelyDrink(item: any): boolean {
  if (item.category === 'beverage') return true
  const name = item.name?.toLowerCase() || ''
  if (ALCOHOL_NAME_PATTERN.test(name) && !ALCOHOL_NEGATIVE.test(name)) return true
  // Bar/lounge/cantina restaurants
  const rName = item.restaurant?.name?.toLowerCase() || ''
  if (/\b(bar|lounge|cantina|pub|tavern|grog|grotto)\b/.test(rName)) return true
  return false
}

async function fetchAllItems(): Promise<any[]> {
  const all: any[] = []
  let page = 0
  while (true) {
    const { data, error } = await supabase
      .from('menu_items')
      .select('id, name, category, restaurant:restaurants(name, park:parks(name)), nutritional_data(id, calories, carbs, fat, protein, sugar, fiber, sodium, cholesterol, confidence_score)')
      .range(page * 500, (page + 1) * 500 - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 500) break
    page++
  }
  return all
}

function matches(item: any, fix: Fix): boolean {
  const name = item.name
  if (typeof fix.namePattern === 'string') {
    if (name !== fix.namePattern) return false
  } else {
    if (!fix.namePattern.test(name)) return false
  }

  if (fix.restaurant) {
    const rName = item.restaurant?.name || ''
    if (typeof fix.restaurant === 'string') {
      if (!rName.includes(fix.restaurant)) return false
    } else {
      if (!fix.restaurant.test(rName)) return false
    }
  }

  return true
}

async function main() {
  console.log(`\n=== Fix MEDIUM Accuracy Findings ===`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`)

  const items = await fetchAllItems()
  console.log(`Fetched ${items.length} items\n`)

  const fixedIds = new Set<string>()
  let success = 0
  let skipped = 0
  let errors = 0

  // --- Named fixes ---
  console.log('--- Named fixes ---')
  for (const fix of fixes) {
    const matched = items.filter(i => matches(i, fix))

    if (matched.length === 0) {
      const nameStr = typeof fix.namePattern === 'string' ? fix.namePattern : fix.namePattern.source
      console.log(`  SKIP: "${nameStr}" @ ${fix.restaurant || 'any'} — not found`)
      skipped++
      continue
    }

    for (const item of matched) {
      const nd = item.nutritional_data?.[0]
      if (!nd) continue
      if (fixedIds.has(nd.id)) continue

      // Check condition if provided
      if (fix.condition && !fix.condition(nd)) continue

      const changes: string[] = []
      for (const [k, v] of Object.entries(fix.update)) {
        if (nd[k] !== v) changes.push(`${k}: ${nd[k]}→${v}`)
      }

      if (changes.length === 0) continue

      if (DRY_RUN) {
        console.log(`  [DRY] ${item.name} @ ${item.restaurant?.name}: ${changes.join(', ')} — ${fix.reason}`)
        fixedIds.add(nd.id)
        success++
      } else {
        const { error } = await supabase
          .from('nutritional_data')
          .update({ ...fix.update, confidence_score: 45 })
          .eq('id', nd.id)

        if (error) {
          console.error(`  FAIL: ${item.name} — ${error.message}`)
          errors++
        } else {
          console.log(`  OK: ${item.name} @ ${item.restaurant?.name}: ${changes.join(', ')} — ${fix.reason}`)
          fixedIds.add(nd.id)
          success++
        }
      }
    }
  }

  // --- Fat estimation for FOOD items with fat=0 but stated calories >> macro estimate ---
  // Excludes beverages and alcoholic drinks (calorie gap from alcohol, not fat)
  console.log('\n--- Fat=0 calorie gap fixes (food items only) ---')
  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd) continue
    if (fixedIds.has(nd.id)) continue

    // Skip beverages and likely alcoholic items — their calorie gap is from alcohol
    if (isLikelyDrink(item)) continue

    // Only fix items where fat=0, calories > 0, and protein/carbs are present
    if (nd.fat !== 0 || nd.fat === null) continue
    if (nd.calories === null || nd.calories <= 0) continue
    if (nd.protein === null || nd.carbs === null) continue

    const macroEst = nd.protein * 4 + nd.carbs * 4
    const calGap = nd.calories - macroEst

    // Only fix if the gap suggests meaningful fat content (>= 5g = 45 cal)
    // and the deviation is >= 20% (would trigger MEDIUM finding)
    if (calGap < 45) continue
    const estimatedFat = Math.round(calGap / 9)
    if (estimatedFat < 5) continue

    // Check deviation would be MEDIUM or worse
    const currentEst = macroEst + 0 * 9 // fat=0
    const deviation = Math.abs(nd.calories - currentEst) / Math.max(currentEst, 1) * 100
    if (deviation < 20) continue

    // Sanity check: estimated fat shouldn't be absurdly high
    if (estimatedFat > 150) continue

    const changes = [`fat: 0→${estimatedFat}`]

    if (DRY_RUN) {
      console.log(`  [DRY] ${item.name} @ ${item.restaurant?.name}: ${changes.join(', ')} — fat estimated from calorie gap (stated=${nd.calories}, P*4+C*4=${macroEst}, gap=${calGap})`)
      fixedIds.add(nd.id)
      success++
    } else {
      const { error } = await supabase
        .from('nutritional_data')
        .update({ fat: estimatedFat, confidence_score: 40 })
        .eq('id', nd.id)

      if (error) {
        console.error(`  FAIL: ${item.name} — ${error.message}`)
        errors++
      } else {
        console.log(`  OK: ${item.name} @ ${item.restaurant?.name}: ${changes.join(', ')} — fat estimated from calorie gap`)
        fixedIds.add(nd.id)
        success++
      }
    }
  }

  console.log(`\n=== Summary ===`)
  console.log(`Updated: ${success}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Errors: ${errors}`)
  console.log(`Unique items fixed: ${fixedIds.size}`)
  if (DRY_RUN) console.log('(DRY RUN — no changes made)')
}

main().catch(console.error)
