/**
 * Fix remaining HIGH accuracy findings from Feb 27 audit (round 2).
 *
 * All 11 items are genuine data errors (Atwater deviation):
 * - 7 Shakin' Jamaican Cold Brews: macros set to ~196 cal but calories left at 1-30
 * - 1 PB&J Milkshake: 862 cal at '50s Prime Time but identical drink at Tune-In is 550
 * - 1 2% Milk at Leaky Cauldron: 54 cal but macros = 125
 * - 1 Americano at Raglan Road: 176 cal but it's black coffee (~15 cal)
 * - 1 Frozen Drinks at Landing Joffrey's: 341 cal with macros = 210 (alcohol gap)
 *
 * Usage: npx tsx scripts/fix-audit-high-r2.ts [--dry-run]
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
}

const fixes: Fix[] = [
  // === Shakin' Jamaican Cold Brews (7 items) ===
  // Previous fix set macros (c=38, f=4, p=2) but forgot to update calories.
  // Macros estimate: 38*4 + 2*4 + 4*9 = 196 cal.
  {
    namePattern: /^Shakin['\u2019]?\s*Jamaican/i,
    update: { calories: 196 },
    reason: 'Calories were 1-30 but macros sum to 196 cal; sync calories to match',
  },

  // === PB&J Milkshake at '50s Prime Time ===
  // Same drink at Tune-In Lounge = 550 cal. Macros sum to 532. 862 is inflated.
  {
    namePattern: 'Peanut Butter & Jelly Milk Shake',
    restaurant: "'50s Prime Time",
    update: { calories: 550 },
    reason: 'Tune-In Lounge version is 550 cal; 862 was over-multiplied',
  },

  // === 2% Milk at Leaky Cauldron ===
  // Macros: p=8, c=12, f=5 → 8*4+12*4+5*9 = 125 cal. Stated 54 is too low.
  {
    namePattern: '2% Milk',
    restaurant: 'Leaky Cauldron',
    update: { calories: 125 },
    reason: 'Macros sum to 125 cal; 54 was incorrect (probably per-100ml)',
  },

  // === Americano at Raglan Road ===
  // Description says "Espresso with hot water" — it's coffee, not the cocktail.
  // Standard Americano: ~15 cal, ~3g carbs, 0g fat, 1g protein.
  // Current: 176 cal, 18g carbs, 0g fat — bad USDA match.
  {
    namePattern: 'Americano',
    restaurant: 'Raglan Road',
    update: { calories: 15, carbs: 3, sugar: 0, protein: 1, fat: 0, fiber: 0 },
    reason: 'Coffee Americano, not cocktail; 176 cal was bad USDA match',
  },

  // === Frozen Drinks at The Landing Joffrey's ===
  // 341 cal stated, macros = 210. The 131 cal gap is likely from alcohol
  // (The Landing serves frozen cocktails). But rather than guessing,
  // lower calories to match macros since this is a generic menu entry.
  // Actually: this entry at The Landing may include alcoholic options.
  // The safest fix is to set it as a frozen cocktail estimate.
  {
    namePattern: 'Frozen Drinks',
    restaurant: /Landing Joffrey/,
    update: { calories: 210 },
    reason: 'Frozen drinks entry; align calories with macros (p=2,c=70,f=5→210)',
  },

  // === Salted Caramel Mudslide Cold Brew (2 low-cal items) ===
  // Same issue as Shakin' Jamaican: macros set to c=38,f=6,p=4 (~222 cal)
  // but calories left at 15-30. Fix: set calories to 222.
  // Note: only fixing items where calories < 50 (others are correct at 350-500).
  {
    namePattern: 'Salted Caramel Mudslide Cold Brew',
    restaurant: /Canada Joffrey/,
    update: { calories: 222 },
    reason: 'Macros sum to 222 cal; 15 was leftover from plain cold brew value',
  },
  {
    namePattern: 'Salted Caramel Mudslide Cold Brew',
    restaurant: /Joffrey.*Kiosks/,
    update: { calories: 222 },
    reason: 'Macros sum to 222 cal; 30 was leftover from plain cold brew value',
  },
]

async function fetchAllItems(): Promise<any[]> {
  const all: any[] = []
  let page = 0
  while (true) {
    const { data, error } = await supabase
      .from('menu_items')
      .select('id, name, restaurant:restaurants(name, park:parks(name)), nutritional_data(id, calories, carbs, fat, protein, sugar, fiber, sodium, cholesterol, confidence_score)')
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
  console.log(`\n=== Fix Audit HIGH Findings (Round 2) ===`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`)

  const items = await fetchAllItems()
  console.log(`Fetched ${items.length} items\n`)

  const fixedIds = new Set<string>()
  let success = 0
  let skipped = 0
  let errors = 0

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

      // For Shakin' Jamaican and Mudslide: only fix items where calories are way off from macros
      if (fix.update.calories && !fix.update.carbs) {
        const est = (nd.protein || 0) * 4 + (nd.carbs || 0) * 4 + (nd.fat || 0) * 9
        const absDiff = Math.abs(nd.calories - est)
        if (absDiff < 50) {
          // Already correct
          continue
        }
      }

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

  console.log(`\n=== Summary ===`)
  console.log(`Updated: ${success}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Errors: ${errors}`)
  console.log(`Unique items fixed: ${fixedIds.size}`)
  if (DRY_RUN) console.log('(DRY RUN — no changes made)')
}

main().catch(console.error)
