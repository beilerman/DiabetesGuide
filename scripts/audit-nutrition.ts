import { readFileSync, writeFileSync } from 'fs'

interface NutData {
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
  is_vegetarian: boolean
  is_fried: boolean
  description: string | null
  restaurant: { name: string; park: { name: string } }
  nutritional_data: NutData[]
}

interface Flag {
  item: string
  location: string
  pass: number
  issue: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  current: string
  suggested: string
  category: string
}

const items: Item[] = JSON.parse(readFileSync('audit-dump.json', 'utf-8'))
const flags: Flag[] = []

function n(item: Item): NutData | null {
  return item.nutritional_data?.[0] ?? null
}

function loc(item: Item): string {
  const r = item.restaurant as any
  return `${r?.name ?? '?'} (${r?.park?.name ?? '?'})`
}

function pctCal(macro_g: number, calPerG: number, totalCal: number): number {
  if (totalCal <= 0) return 0
  return (macro_g * calPerG / totalCal) * 100
}

// ============================================================
// PASS 1: INTERNAL CONSISTENCY
// ============================================================
console.log('=== PASS 1: INTERNAL CONSISTENCY ===\n')

for (const item of items) {
  const nd = n(item)
  if (!nd) continue
  const cal = nd.calories ?? 0
  const carbs = nd.carbs ?? 0
  const fat = nd.fat ?? 0
  const protein = nd.protein ?? 0
  const sugar = nd.sugar ?? 0
  const fiber = nd.fiber ?? 0
  const sodium = nd.sodium ?? 0
  const name = item.name
  const location = loc(item)
  const desc = (item.description || '').toLowerCase()
  const nameLower = name.toLowerCase()

  // 1A: Caloric math
  const estCal = protein * 4 + carbs * 4 + fat * 9
  if (cal > 50 && estCal > 50) {
    const ratio = cal / estCal
    if (ratio < 0.5 || ratio > 2.0) {
      // Extreme mismatch
      flags.push({
        item: name, location, pass: 1, category: 'caloric-math',
        severity: 'HIGH',
        issue: `Extreme caloric math mismatch: stated ${cal} cal vs calculated ${estCal} (ratio ${ratio.toFixed(2)})`,
        current: `cal=${cal}, P=${protein}g, C=${carbs}g, F=${fat}g`,
        suggested: `Recalculate: either cal should be ~${estCal} or macros need adjustment`
      })
    } else if (ratio < 0.75 || ratio > 1.35) {
      flags.push({
        item: name, location, pass: 1, category: 'caloric-math',
        severity: 'MEDIUM',
        issue: `Caloric math off by ${Math.abs(Math.round((1 - ratio) * 100))}%: stated ${cal} vs calculated ${estCal}`,
        current: `cal=${cal}, P=${protein}g, C=${carbs}g, F=${fat}g`,
        suggested: `Verify macros sum to stated calories`
      })
    }
  }

  // 1B: Macro ratio plausibility
  if (cal > 100) {
    const fatPct = pctCal(fat, 9, cal)
    const carbPct = pctCal(carbs, 4, cal)
    const protPct = pctCal(protein, 4, cal)

    // Fried foods should be >25% fat
    if (item.is_fried && fatPct < 20 && fat > 0) {
      flags.push({
        item: name, location, pass: 1, category: 'macro-ratio',
        severity: 'MEDIUM',
        issue: `Fried item with only ${fatPct.toFixed(0)}% cal from fat (expected >25%)`,
        current: `fat=${fat}g (${fatPct.toFixed(0)}% of ${cal} cal)`,
        suggested: `Verify fat content — frying typically adds significant fat`
      })
    }

    // Desserts should be >35% carbs
    if (item.category === 'dessert' && carbPct < 30 && carbs > 0) {
      flags.push({
        item: name, location, pass: 1, category: 'macro-ratio',
        severity: 'LOW',
        issue: `Dessert with only ${carbPct.toFixed(0)}% cal from carbs (expected >35%)`,
        current: `carbs=${carbs}g (${carbPct.toFixed(0)}% of ${cal} cal)`,
        suggested: `Verify carb content for a dessert item`
      })
    }

    // Meat-heavy items should have decent protein
    if (/turkey leg|chicken dinner|grilled (chicken|steak|salmon|fish)|ribeye|rib.eye|filet|tenderloin|pork chop/i.test(nameLower) && protPct < 15 && protein > 0) {
      flags.push({
        item: name, location, pass: 1, category: 'macro-ratio',
        severity: 'MEDIUM',
        issue: `Protein-dominant dish with only ${protPct.toFixed(0)}% cal from protein (expected >20%)`,
        current: `protein=${protein}g (${protPct.toFixed(0)}% of ${cal} cal)`,
        suggested: `Verify protein — grilled meats should be protein-heavy`
      })
    }
  }

  // 1C: Sodium plausibility
  if (cal > 200) {
    // Savory entrees with very low sodium
    if (item.category === 'entree' && sodium > 0 && sodium < 200) {
      flags.push({
        item: name, location, pass: 1, category: 'sodium',
        severity: 'LOW',
        issue: `Savory entree with only ${sodium}mg sodium — suspiciously low for theme park food`,
        current: `sodium=${sodium}mg`,
        suggested: `Typical theme park entree: 800-2000mg sodium`
      })
    }

    // Desserts with very high sodium (unless pretzel/salted caramel)
    if (item.category === 'dessert' && sodium > 1500 && !/pretzel|salted|salt|caramel/.test(nameLower + ' ' + desc)) {
      flags.push({
        item: name, location, pass: 1, category: 'sodium',
        severity: 'MEDIUM',
        issue: `Dessert with ${sodium}mg sodium — high unless salted/pretzel component`,
        current: `sodium=${sodium}mg`,
        suggested: `Verify — typical dessert: 200-600mg sodium`
      })
    }
  }

  // 1D: Sugar/fiber <= carbs
  if (sugar > carbs && carbs > 0) {
    flags.push({
      item: name, location, pass: 1, category: 'sugar-carbs',
      severity: 'HIGH',
      issue: `Sugar (${sugar}g) > total carbs (${carbs}g) — impossible`,
      current: `sugar=${sugar}g, carbs=${carbs}g`,
      suggested: `Sugar must be ≤ carbs. Likely sugar=${Math.round(carbs * 0.3)}g or carbs needs increase`
    })
  }
  if (fiber > carbs && carbs > 0) {
    flags.push({
      item: name, location, pass: 1, category: 'fiber-carbs',
      severity: 'HIGH',
      issue: `Fiber (${fiber}g) > total carbs (${carbs}g) — impossible`,
      current: `fiber=${fiber}g, carbs=${carbs}g`,
      suggested: `Fiber must be ≤ carbs`
    })
  }
}

// ============================================================
// PASS 2: EXTERNAL PLAUSIBILITY (heuristic estimation)
// ============================================================
console.log('=== PASS 2: EXTERNAL PLAUSIBILITY ===\n')

// Define expected ranges for common food types
interface FoodProfile {
  pattern: RegExp
  calRange: [number, number]
  carbRange: [number, number]
  fatRange: [number, number]
  proteinRange: [number, number]
  label: string
}

const profiles: FoodProfile[] = [
  { pattern: /cheeseburger|hamburger|burger(?!.*impossible)/i, calRange: [500, 1400], carbRange: [30, 80], fatRange: [25, 70], proteinRange: [20, 60], label: 'burger' },
  { pattern: /cheese pizza|pepperoni pizza|pizza/i, calRange: [400, 1200], carbRange: [40, 100], fatRange: [15, 50], proteinRange: [15, 45], label: 'pizza' },
  { pattern: /hot dog|corn dog/i, calRange: [300, 900], carbRange: [25, 60], fatRange: [15, 50], proteinRange: [10, 30], label: 'hot dog' },
  { pattern: /turkey leg/i, calRange: [800, 1200], carbRange: [0, 10], fatRange: [40, 70], proteinRange: [80, 160], label: 'turkey leg' },
  { pattern: /funnel cake/i, calRange: [600, 1200], carbRange: [70, 150], fatRange: [25, 60], proteinRange: [5, 20], label: 'funnel cake' },
  { pattern: /churro/i, calRange: [200, 600], carbRange: [30, 80], fatRange: [10, 30], proteinRange: [2, 10], label: 'churro' },
  { pattern: /cupcake/i, calRange: [350, 800], carbRange: [45, 120], fatRange: [15, 40], proteinRange: [3, 10], label: 'cupcake' },
  { pattern: /dole whip|soft.serve/i, calRange: [150, 400], carbRange: [30, 80], fatRange: [0, 15], proteinRange: [0, 8], label: 'frozen treat' },
  { pattern: /pretzel(?!.*pretzel kitchen)/i, calRange: [300, 700], carbRange: [50, 120], fatRange: [5, 25], proteinRange: [5, 20], label: 'pretzel' },
  { pattern: /mac.*cheese|mac n cheese/i, calRange: [400, 1000], carbRange: [35, 80], fatRange: [20, 55], proteinRange: [15, 35], label: 'mac & cheese' },
  { pattern: /chicken tender|chicken finger|chicken strip|chicken nugget/i, calRange: [400, 1000], carbRange: [20, 60], fatRange: [20, 50], proteinRange: [25, 55], label: 'chicken tenders' },
  { pattern: /nachos|totchos/i, calRange: [500, 1300], carbRange: [40, 100], fatRange: [25, 70], proteinRange: [15, 45], label: 'nachos' },
  { pattern: /caesar salad/i, calRange: [300, 700], carbRange: [15, 40], fatRange: [20, 45], proteinRange: [15, 40], label: 'caesar salad' },
  { pattern: /brownie/i, calRange: [300, 800], carbRange: [40, 100], fatRange: [15, 45], proteinRange: [3, 12], label: 'brownie' },
  { pattern: /milkshake|shake/i, calRange: [400, 1100], carbRange: [50, 130], fatRange: [15, 50], proteinRange: [8, 20], label: 'milkshake' },
  { pattern: /latte|cold brew|cappuccino/i, calRange: [5, 500], carbRange: [0, 60], fatRange: [0, 20], proteinRange: [0, 15], label: 'coffee drink' },
  { pattern: /beer(?!.*butter)/i, calRange: [100, 350], carbRange: [5, 30], fatRange: [0, 2], proteinRange: [0, 5], label: 'beer' },
  { pattern: /wine/i, calRange: [100, 250], carbRange: [2, 15], fatRange: [0, 1], proteinRange: [0, 2], label: 'wine' },
  { pattern: /margarita|cocktail|mojito|sangria/i, calRange: [150, 500], carbRange: [15, 60], fatRange: [0, 5], proteinRange: [0, 3], label: 'cocktail' },
  { pattern: /water(?!.*melon)/i, calRange: [0, 10], carbRange: [0, 0], fatRange: [0, 0], proteinRange: [0, 0], label: 'water' },
  { pattern: /ribs|rib plate|bbq.*rib/i, calRange: [600, 1400], carbRange: [15, 60], fatRange: [30, 70], proteinRange: [30, 70], label: 'ribs' },
  { pattern: /doughnut|donut/i, calRange: [250, 700], carbRange: [30, 90], fatRange: [10, 35], proteinRange: [3, 10], label: 'doughnut' },
  { pattern: /ice cream|sundae/i, calRange: [250, 1200], carbRange: [30, 130], fatRange: [10, 55], proteinRange: [3, 15], label: 'ice cream/sundae' },
  { pattern: /cookie/i, calRange: [200, 1000], carbRange: [25, 120], fatRange: [10, 50], proteinRange: [2, 15], label: 'cookie' },
  { pattern: /wrap|burrito/i, calRange: [350, 1000], carbRange: [30, 80], fatRange: [15, 50], proteinRange: [15, 45], label: 'wrap/burrito' },
  { pattern: /sandwich|panini|sub/i, calRange: [350, 1200], carbRange: [30, 80], fatRange: [15, 55], proteinRange: [15, 50], label: 'sandwich' },
  { pattern: /steak|filet|ribeye|rib.eye|prime rib/i, calRange: [400, 1200], carbRange: [0, 30], fatRange: [20, 65], proteinRange: [30, 80], label: 'steak' },
  { pattern: /salmon|sea bass|fish(?!.*finger)/i, calRange: [300, 900], carbRange: [5, 40], fatRange: [15, 50], proteinRange: [25, 60], label: 'fish entree' },
]

for (const item of items) {
  const nd = n(item)
  if (!nd) continue
  const cal = nd.calories ?? 0
  const carbs = nd.carbs ?? 0
  const fat = nd.fat ?? 0
  const protein = nd.protein ?? 0
  if (cal === 0) continue

  for (const p of profiles) {
    if (!p.pattern.test(item.name)) continue

    const location = loc(item)
    const issues: string[] = []

    if (cal < p.calRange[0] * 0.75) issues.push(`cal ${cal} well below expected ${p.calRange[0]}-${p.calRange[1]} for ${p.label}`)
    if (cal > p.calRange[1] * 1.25) issues.push(`cal ${cal} well above expected ${p.calRange[0]}-${p.calRange[1]} for ${p.label}`)
    if (carbs > 0 && carbs < p.carbRange[0] * 0.6) issues.push(`carbs ${carbs}g below expected ${p.carbRange[0]}-${p.carbRange[1]}g for ${p.label}`)
    if (carbs > p.carbRange[1] * 1.4) issues.push(`carbs ${carbs}g above expected ${p.carbRange[0]}-${p.carbRange[1]}g for ${p.label}`)
    if (fat > 0 && fat < p.fatRange[0] * 0.5) issues.push(`fat ${fat}g below expected ${p.fatRange[0]}-${p.fatRange[1]}g for ${p.label}`)
    if (fat > p.fatRange[1] * 1.5) issues.push(`fat ${fat}g above expected ${p.fatRange[0]}-${p.fatRange[1]}g for ${p.label}`)
    if (protein > 0 && protein < p.proteinRange[0] * 0.5) issues.push(`protein ${protein}g below expected ${p.proteinRange[0]}-${p.proteinRange[1]}g for ${p.label}`)
    if (protein > p.proteinRange[1] * 1.5) issues.push(`protein ${protein}g above expected ${p.proteinRange[0]}-${p.proteinRange[1]}g for ${p.label}`)

    if (issues.length > 0) {
      flags.push({
        item: item.name, location, pass: 2, category: 'plausibility',
        severity: issues.some(i => /well below|well above/.test(i)) ? 'HIGH' : 'MEDIUM',
        issue: issues.join('; '),
        current: `cal=${cal}, C=${carbs}g, F=${fat}g, P=${protein}g`,
        suggested: `Expected for ${p.label}: cal ${p.calRange[0]}-${p.calRange[1]}, C ${p.carbRange[0]}-${p.carbRange[1]}g, F ${p.fatRange[0]}-${p.fatRange[1]}g, P ${p.proteinRange[0]}-${p.proteinRange[1]}g`
      })
    }
    break // only match first profile
  }
}

// ============================================================
// PASS 3: SYSTEMATIC PATTERNS
// ============================================================
console.log('=== PASS 3: SYSTEMATIC PATTERNS ===\n')

// 3A: Suspiciously round numbers
for (const item of items) {
  const nd = n(item)
  if (!nd || !nd.calories) continue
  const cal = nd.calories
  const carbs = nd.carbs ?? 0
  const fat = nd.fat ?? 0
  const protein = nd.protein ?? 0

  // Check if ALL four values are multiples of 5 or 10
  if (cal % 10 === 0 && carbs % 5 === 0 && fat % 5 === 0 && protein % 5 === 0 && cal > 100) {
    // Additional check: all are multiples of 10
    if (cal % 50 === 0 && carbs % 10 === 0 && fat % 10 === 0 && protein % 10 === 0) {
      flags.push({
        item: item.name, location: loc(item), pass: 3, category: 'round-numbers',
        severity: 'LOW',
        issue: `All macros are very round numbers — likely estimated, not measured`,
        current: `cal=${cal}, C=${carbs}g, F=${fat}g, P=${protein}g`,
        suggested: `Flag as estimate — confidence should be low`
      })
    }
  }
}

// 3B: Duplicate nutritional profiles
const profileMap = new Map<string, Item[]>()
for (const item of items) {
  const nd = n(item)
  if (!nd || !nd.calories) continue
  const key = `${nd.calories}|${nd.carbs}|${nd.fat}|${nd.protein}`
  if (!profileMap.has(key)) profileMap.set(key, [])
  profileMap.get(key)!.push(item)
}

for (const [key, dupes] of profileMap) {
  if (dupes.length < 2) continue
  // Check if the items are actually different foods (not variants of same dish)
  const names = dupes.map(d => d.name.toLowerCase().replace(/customized bowl:?\s*/g, '').trim())
  const uniqueRoots = new Set(names.map(n => n.split(' ').slice(0, 3).join(' ')))
  if (uniqueRoots.size > 1) {
    // Actually different foods with identical nutrition
    const [cal, carbs, fat, protein] = key.split('|')
    for (const d of dupes) {
      flags.push({
        item: d.name, location: loc(d), pass: 3, category: 'duplicate-profile',
        severity: 'LOW',
        issue: `Shares identical nutrition profile with ${dupes.length - 1} other different item(s): ${dupes.filter(x => x !== d).map(x => x.name).slice(0, 2).join(', ')}`,
        current: `cal=${cal}, C=${carbs}g, F=${fat}g, P=${protein}g`,
        suggested: `Verify — different foods shouldn't have identical macros`
      })
    }
  }
}

// 3C: Category ranking violations
const categories = ['entree', 'dessert', 'beverage', 'snack', 'side']
for (const cat of categories) {
  const catItems = items.filter(i => i.category === cat && n(i)?.calories)
    .sort((a, b) => (n(b)!.calories ?? 0) - (n(a)!.calories ?? 0))

  // Flag extreme outliers within category
  if (catItems.length < 5) continue
  const cals = catItems.map(i => n(i)!.calories!)
  const median = cals[Math.floor(cals.length / 2)]
  const q1 = cals[Math.floor(cals.length * 0.75)]
  const q3 = cals[Math.floor(cals.length * 0.25)]
  const iqr = q3 - q1

  for (const item of catItems) {
    const cal = n(item)!.calories!
    if (cal > q3 + 2 * iqr || cal < q1 - 2 * iqr) {
      if (cal < 10 && cat !== 'beverage') {
        flags.push({
          item: item.name, location: loc(item), pass: 3, category: 'category-outlier',
          severity: 'HIGH',
          issue: `${cat} with only ${cal} cal — extreme outlier (category median: ${median})`,
          current: `cal=${cal}`,
          suggested: `Verify — possibly missing or corrupted data`
        })
      }
    }
  }

  // Specific ranking checks
  if (cat === 'beverage') {
    for (const item of catItems) {
      const cal = n(item)!.calories!
      const nameLower = item.name.toLowerCase()
      if (/water/.test(nameLower) && cal > 20) {
        flags.push({
          item: item.name, location: loc(item), pass: 3, category: 'category-ranking',
          severity: 'MEDIUM',
          issue: `Water with ${cal} calories`,
          current: `cal=${cal}`,
          suggested: `Water should be 0 cal`
        })
      }
    }
  }
}

// 3D: Missing data patterns
const parkMissing = new Map<string, { total: number; missingSodium: number; missingSugar: number; missingProtein: number; missingFiber: number }>()
for (const item of items) {
  const nd = n(item)
  if (!nd) continue
  const park = (item.restaurant as any)?.park?.name ?? 'Unknown'
  if (!parkMissing.has(park)) parkMissing.set(park, { total: 0, missingSodium: 0, missingSugar: 0, missingProtein: 0, missingFiber: 0 })
  const pm = parkMissing.get(park)!
  pm.total++
  if (nd.sodium == null || nd.sodium === 0) pm.missingSodium++
  if (nd.sugar == null || nd.sugar === 0) pm.missingSugar++
  if (nd.protein == null || nd.protein === 0) pm.missingProtein++
  if (nd.fiber == null || nd.fiber === 0) pm.missingFiber++
}

console.log('Missing Data by Park:')
for (const [park, pm] of [...parkMissing.entries()].sort((a, b) => b[1].total - a[1].total)) {
  const sodiumPct = Math.round(pm.missingSodium / pm.total * 100)
  const sugarPct = Math.round(pm.missingSugar / pm.total * 100)
  const proteinPct = Math.round(pm.missingProtein / pm.total * 100)
  if (sodiumPct > 30 || sugarPct > 30 || proteinPct > 30) {
    console.log(`  ${park} (${pm.total} items): sodium missing ${sodiumPct}%, sugar missing ${sugarPct}%, protein missing ${proteinPct}%`)
  }
}

// ============================================================
// OUTPUT SUMMARY
// ============================================================
console.log('\n=== AUDIT SUMMARY ===\n')

// Deduplicate flags by item+issue
const seen = new Set<string>()
const uniqueFlags = flags.filter(f => {
  const key = `${f.item}|||${f.issue}`
  if (seen.has(key)) return false
  seen.add(key)
  return true
})

// Sort by severity
const severityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }
uniqueFlags.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

const highFlags = uniqueFlags.filter(f => f.severity === 'HIGH')
const medFlags = uniqueFlags.filter(f => f.severity === 'MEDIUM')
const lowFlags = uniqueFlags.filter(f => f.severity === 'LOW')

console.log(`Total flags: ${uniqueFlags.length}`)
console.log(`  HIGH severity: ${highFlags.length}`)
console.log(`  MEDIUM severity: ${medFlags.length}`)
console.log(`  LOW severity: ${lowFlags.length}`)

console.log('\n--- HIGH SEVERITY FLAGS (require correction) ---\n')
for (const f of highFlags) {
  console.log(`ITEM: ${f.item}`)
  console.log(`  Location: ${f.location}`)
  console.log(`  Pass ${f.pass} [${f.category}]: ${f.issue}`)
  console.log(`  Current: ${f.current}`)
  console.log(`  Suggested: ${f.suggested}`)
  console.log()
}

console.log('\n--- MEDIUM SEVERITY FLAGS (should verify) ---\n')
for (const f of medFlags) {
  console.log(`ITEM: ${f.item}`)
  console.log(`  Location: ${f.location}`)
  console.log(`  Pass ${f.pass} [${f.category}]: ${f.issue}`)
  console.log(`  Current: ${f.current}`)
  console.log(`  Suggested: ${f.suggested}`)
  console.log()
}

console.log('\n--- LOW SEVERITY FLAGS (informational) ---\n')
for (const f of lowFlags.slice(0, 30)) {
  console.log(`ITEM: ${f.item}`)
  console.log(`  Location: ${f.location}`)
  console.log(`  Pass ${f.pass} [${f.category}]: ${f.issue}`)
  console.log()
}
if (lowFlags.length > 30) console.log(`  ... and ${lowFlags.length - 30} more LOW severity flags`)

// Write full report
writeFileSync('audit-report.json', JSON.stringify(uniqueFlags, null, 2))
console.log('\nFull report written to audit-report.json')

// Category breakdown
console.log('\n--- FLAGS BY CATEGORY ---')
const catCounts = new Map<string, number>()
for (const f of uniqueFlags) {
  catCounts.set(f.category, (catCounts.get(f.category) ?? 0) + 1)
}
for (const [cat, count] of [...catCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${count}`)
}
