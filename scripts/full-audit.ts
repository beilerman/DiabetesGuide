import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const items: any[] = JSON.parse(readFileSync(join(__dirname, '..', 'audit-dump.json'), 'utf-8'))

interface AuditFlag {
  item: string
  restaurant: string
  park: string
  pass: number
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  issue: string
  details: string
  currentValue?: string
  suggestedValue?: string
}

const flags: AuditFlag[] = []

function base(item: any) {
  const nd = item.nutritional_data?.[0]
  return {
    name: item.name,
    restaurant: item.restaurant?.name || 'Unknown',
    park: item.restaurant?.park?.name || 'Unknown',
    cal: nd?.calories ?? null,
    carbs: nd?.carbs ?? null,
    fat: nd?.fat ?? null,
    protein: nd?.protein ?? null,
    sugar: nd?.sugar ?? null,
    fiber: nd?.fiber ?? null,
    sodium: nd?.sodium ?? null,
    cholesterol: nd?.cholesterol ?? null,
    category: item.category,
    isFried: item.is_fried,
    isVeg: item.is_vegetarian,
    description: item.description || '',
  }
}

function flag(item: any, pass: number, severity: 'HIGH' | 'MEDIUM' | 'LOW', issue: string, details: string, currentValue?: string, suggestedValue?: string) {
  const b = base(item)
  flags.push({ item: b.name, restaurant: b.restaurant, park: b.park, pass, severity, issue, details, currentValue, suggestedValue })
}

// ============================================================
// Food type detection for plausibility checks
// ============================================================
function detectFoodType(name: string, desc: string, category: string): string[] {
  const n = (name + ' ' + desc).toLowerCase()
  const types: string[] = []

  if (/burger|cheeseburger/.test(n)) types.push('burger')
  if (/pizza/.test(n)) types.push('pizza')
  if (/salad/.test(n) && !/chicken salad sandwich/.test(n)) types.push('salad')
  if (/taco/.test(n)) types.push('taco')
  if (/wrap|burrito/.test(n)) types.push('wrap')
  if (/sandwich|sub |hoagie|panini/.test(n)) types.push('sandwich')
  if (/hot dog|corn dog/.test(n)) types.push('hotdog')
  if (/chicken tender|chicken strip|chicken nugget|chicken finger/.test(n)) types.push('chicken_tenders')
  if (/wing/.test(n) && !/buffalo wing sauce/.test(n)) types.push('wings')
  if (/nachos/.test(n)) types.push('nachos')
  if (/fries|french fries|tots|totchos/.test(n)) types.push('fries')
  if (/steak|filet|ribeye|sirloin|new york strip|porterhouse/.test(n)) types.push('steak')
  if (/salmon|fish|mahi|sea bass|cod|tuna|shrimp|lobster|crab/.test(n) && !/fish.*chips/.test(n)) types.push('seafood')
  if (/fish.*chips|fish.*fries|fish n chips/.test(n)) types.push('fish_and_chips')
  if (/pasta|spaghetti|fettuccine|penne|linguine|mac.*cheese/.test(n)) types.push('pasta')
  if (/soup|chowder|bisque|gumbo/.test(n)) types.push('soup')
  if (/rice bowl|poke bowl|grain bowl/.test(n)) types.push('bowl')
  if (/turkey leg/.test(n)) types.push('turkey_leg')
  if (/pretzel(?!.*dog)/.test(n)) types.push('pretzel')
  if (/churro/.test(n)) types.push('churro')
  if (/cupcake/.test(n)) types.push('cupcake')
  if (/cake|cheesecake/.test(n) && !/cake pop|pancake|funnel cake/.test(n)) types.push('cake')
  if (/cookie/.test(n)) types.push('cookie')
  if (/brownie/.test(n)) types.push('brownie')
  if (/ice cream|sundae|gelato/.test(n)) types.push('ice_cream')
  if (/dole whip|soft serve/.test(n)) types.push('frozen_treat')
  if (/funnel cake/.test(n)) types.push('funnel_cake')
  if (/donut|doughnut/.test(n)) types.push('donut')
  if (/smoothie|shake|milkshake|frappuccino/.test(n)) types.push('shake')
  if (/\b(beer|ale|lager|ipa|stout|pilsner|draft|draught)\b/.test(n) && !/butterbeer|ginger beer|root beer|beer.?batter|beer cheese/.test(n)) types.push('beer')
  if (/\b(wine|sangria|champagne|prosecco|mimosa)\b/.test(n) && !/wine sauce|wine reduction|wine.?brais|wine glaze|red wine-/.test(n)) types.push('wine')
  if (/\b(cocktail|margarita|daiquiri|martini|mojito|mai tai|pina colada|hurricane)\b/.test(n) && !/sauce|glaze/.test(n)) types.push('cocktail')
  if (/butterbeer/.test(n)) types.push('butterbeer')
  if (/\b(coffee|latte|espresso|cappuccino|americano|cold brew)\b/.test(n) && !/coffee.?cake|coffee.?rub|toffee/.test(n)) types.push('coffee')
  if (/\b(tea|chai)\b/.test(n) && !/steak|tender|team|teal/.test(n)) types.push('tea')
  if (/\b(soda|coca.cola|sprite|fanta)\b/.test(n) && !/cocktail/.test(n)) types.push('soft_drink')
  if (/\b(lemonade|agua fresca)\b/.test(n)) types.push('soft_drink')
  if (/\bjuice\b/.test(n) && !/sauce|jus\b/.test(n)) types.push('soft_drink')
  if (/\bwater\b/.test(n) && !/watermelon|water chestnut|cold water/.test(n) && types.length === 0) types.push('water')
  if (/quesadilla/.test(n)) types.push('quesadilla')
  if (/ribs/.test(n)) types.push('ribs')
  if (/pork|pulled pork|kalua/.test(n) && types.length === 0) types.push('pork')
  if (/chicken(?!.*tender|.*strip|.*nugget|.*finger|.*wing)/.test(n) && types.length === 0) types.push('chicken')
  if (/egg roll|spring roll/.test(n)) types.push('egg_roll')
  if (/popcorn(?!.*chicken)/.test(n)) types.push('popcorn')
  if (/bread|roll|biscuit|croissant|muffin|scone/.test(n) && types.length === 0) types.push('bread')
  if (/shave ice|shaved ice|snow cone/.test(n)) types.push('shave_ice')

  if (category === 'dessert' && types.length === 0) types.push('dessert_generic')
  if (category === 'beverage' && types.length === 0) types.push('beverage_generic')
  if (category === 'entree' && types.length === 0) types.push('entree_generic')
  if (category === 'side' && types.length === 0) types.push('side_generic')
  if (category === 'snack' && types.length === 0) types.push('snack_generic')

  return types
}

// Plausible calorie ranges by food type (theme park portions)
const CALORIE_RANGES: Record<string, [number, number]> = {
  burger: [450, 1400],
  pizza: [250, 900],  // per slice or personal
  salad: [100, 700],
  taco: [150, 500],   // per taco, usually 2-3 served
  wrap: [400, 900],
  sandwich: [350, 1000],
  hotdog: [300, 800],
  chicken_tenders: [400, 1000],
  wings: [400, 1200],
  nachos: [500, 1400],
  fries: [200, 700],
  steak: [400, 1200],
  seafood: [200, 800],
  fish_and_chips: [600, 1200],
  pasta: [400, 1200],
  soup: [150, 500],
  bowl: [350, 800],
  turkey_leg: [800, 1300],
  pretzel: [300, 700],
  churro: [200, 500],
  cupcake: [350, 800],
  cake: [300, 800],
  cookie: [200, 600],
  brownie: [300, 700],
  ice_cream: [200, 700],
  frozen_treat: [150, 450],
  funnel_cake: [600, 1200],
  donut: [250, 600],
  shake: [300, 900],
  beer: [100, 300],
  wine: [100, 200],
  cocktail: [150, 500],
  butterbeer: [200, 500],
  coffee: [5, 500],
  tea: [0, 200],
  soft_drink: [0, 400],
  water: [0, 10],
  quesadilla: [350, 800],
  ribs: [600, 1400],
  pork: [300, 900],
  chicken: [300, 900],
  egg_roll: [150, 400],
  popcorn: [300, 700],
  bread: [150, 500],
  shave_ice: [100, 350],
}

// ============================================================
// PASS 1: Internal Consistency
// ============================================================
console.log('=== PASS 1: Internal Consistency ===')
let pass1Flags = 0

for (const item of items) {
  const b = base(item)
  if (b.cal == null) continue

  // 1a. Caloric math
  if (b.protein != null && b.carbs != null && b.fat != null) {
    const calculated = (b.protein * 4) + (b.carbs * 4) + (b.fat * 9)
    const diff = Math.abs(calculated - b.cal)
    const pctDiff = b.cal > 0 ? diff / b.cal : 0

    if (pctDiff > 0.25 && diff > 50) {
      const direction = calculated > b.cal ? 'CALCULATED > STATED (possible data entry error or missing macro)' : 'CALCULATED < STATED (possible alcohol calories or missing macros)'
      flag(item, 1, diff > 200 ? 'HIGH' : 'MEDIUM', 'caloric-math',
        `Calculated=${calculated} vs Stated=${b.cal} (${(pctDiff*100).toFixed(0)}% diff). ${direction}`,
        `${b.cal} cal`, `~${calculated} cal from macros`)
      pass1Flags++
    }
  }

  // 1b. Macro ratio plausibility
  if (b.cal > 0 && b.fat != null && b.carbs != null && b.protein != null) {
    const fatPct = (b.fat * 9) / b.cal * 100
    const carbPct = (b.carbs * 4) / b.cal * 100
    const protPct = (b.protein * 4) / b.cal * 100

    // Fried foods should be >25% fat
    if (b.isFried && fatPct < 20 && b.cal > 100) {
      flag(item, 1, 'MEDIUM', 'macro-ratio-fried',
        `Fried item but only ${fatPct.toFixed(0)}% fat calories. Expected >25%.`,
        `${b.fat}g fat (${fatPct.toFixed(0)}%)`)
      pass1Flags++
    }

    // Desserts should be >35% carbs
    if (b.category === 'dessert' && carbPct < 30 && b.cal > 100) {
      flag(item, 1, 'LOW', 'macro-ratio-dessert',
        `Dessert but only ${carbPct.toFixed(0)}% carb calories. Expected >35%.`,
        `${b.carbs}g carbs (${carbPct.toFixed(0)}%)`)
      pass1Flags++
    }

    // Grilled meats should be >20% protein
    const meatTypes = ['steak', 'turkey_leg', 'chicken', 'ribs', 'seafood', 'pork']
    const foodTypes = detectFoodType(b.name, b.description, b.category)
    if (meatTypes.some(t => foodTypes.includes(t)) && protPct < 15 && b.cal > 200) {
      flag(item, 1, 'MEDIUM', 'macro-ratio-protein',
        `Meat item but only ${protPct.toFixed(0)}% protein calories. Expected >20%.`,
        `${b.protein}g protein (${protPct.toFixed(0)}%)`)
      pass1Flags++
    }
  }

  // 1c. Sodium-calorie relationship
  if (b.sodium != null && b.cal != null && b.cal > 0) {
    // Savory entree under 200mg sodium is suspicious
    if (['entree', 'snack'].includes(b.category) && b.sodium < 150 && b.cal > 300 && !b.description.toLowerCase().includes('sweet')) {
      flag(item, 1, 'MEDIUM', 'low-sodium-savory',
        `Savory item with only ${b.sodium}mg sodium at ${b.cal} cal. Theme park food typically >400mg.`,
        `${b.sodium}mg sodium`)
      pass1Flags++
    }
    // Dessert over 1000mg
    if (b.category === 'dessert' && b.sodium > 1000) {
      const n = b.name.toLowerCase()
      if (!/pretzel|salted caramel|sea salt|bacon/.test(n)) {
        flag(item, 1, 'HIGH', 'high-sodium-dessert',
          `Dessert with ${b.sodium}mg sodium seems too high unless salted/pretzel component.`,
          `${b.sodium}mg sodium`)
        pass1Flags++
      }
    }
    // Extreme sodium (>3000mg)
    if (b.sodium > 3000) {
      flag(item, 1, 'HIGH', 'extreme-sodium',
        `${b.sodium}mg sodium is extremely high. Even large theme park entrees rarely exceed 3000mg.`,
        `${b.sodium}mg sodium`)
      pass1Flags++
    }
  }

  // 1d. Sugar/fiber vs carbs
  if (b.sugar != null && b.carbs != null && b.sugar > b.carbs) {
    flag(item, 1, 'HIGH', 'sugar-exceeds-carbs',
      `Sugar (${b.sugar}g) > total carbs (${b.carbs}g). Impossible.`,
      `sugar=${b.sugar}g, carbs=${b.carbs}g`, `sugar ≤ ${b.carbs}g`)
    pass1Flags++
  }
  if (b.fiber != null && b.carbs != null && b.fiber > b.carbs) {
    flag(item, 1, 'HIGH', 'fiber-exceeds-carbs',
      `Fiber (${b.fiber}g) > total carbs (${b.carbs}g). Impossible.`,
      `fiber=${b.fiber}g, carbs=${b.carbs}g`, `fiber ≤ ${b.carbs}g`)
    pass1Flags++
  }

  // 1e. Zero or negative values
  if (b.cal < 0 || (b.fat != null && b.fat < 0) || (b.carbs != null && b.carbs < 0) || (b.protein != null && b.protein < 0)) {
    flag(item, 1, 'HIGH', 'negative-values',
      `Negative nutritional value detected.`,
      `cal=${b.cal}, fat=${b.fat}, carbs=${b.carbs}, protein=${b.protein}`)
    pass1Flags++
  }

  // 1f. Calories suspiciously low for category
  if (b.cal > 0 && b.cal < 20 && b.category === 'entree') {
    flag(item, 1, 'HIGH', 'implausibly-low-cal',
      `Entree with only ${b.cal} calories is implausible.`,
      `${b.cal} cal`)
    pass1Flags++
  }
}
console.log(`Pass 1 complete: ${pass1Flags} flags`)

// ============================================================
// PASS 2: External Plausibility
// ============================================================
console.log('\n=== PASS 2: External Plausibility ===')
let pass2Flags = 0

for (const item of items) {
  const b = base(item)
  if (b.cal == null || b.cal === 0) continue

  const foodTypes = detectFoodType(b.name, b.description, b.category)

  for (const ft of foodTypes) {
    const range = CALORIE_RANGES[ft]
    if (!range) continue

    if (b.cal < range[0] * 0.7) {
      flag(item, 2, b.cal < range[0] * 0.5 ? 'HIGH' : 'MEDIUM', 'below-range',
        `${ft}: ${b.cal} cal is below plausible range [${range[0]}-${range[1]}] for theme park portion.`,
        `${b.cal} cal`, `Expected ≥${range[0]} cal`)
      pass2Flags++
      break  // Only flag once per item for range
    }

    if (b.cal > range[1] * 1.3) {
      flag(item, 2, b.cal > range[1] * 1.5 ? 'HIGH' : 'MEDIUM', 'above-range',
        `${ft}: ${b.cal} cal exceeds plausible range [${range[0]}-${range[1]}] for theme park portion.`,
        `${b.cal} cal`, `Expected ≤${range[1]} cal`)
      pass2Flags++
      break
    }
  }

  // Specific benchmarks for common items
  const n = b.name.toLowerCase()

  // Brewed coffee should be <10 cal (black) or up to 50 with cream/sugar
  if (/^(brewed |hot )?coffee$/.test(n) && b.cal > 80) {
    flag(item, 2, 'HIGH', 'benchmark-coffee',
      `Plain coffee at ${b.cal} cal. Black coffee is ~5 cal, even with cream/sugar <50.`,
      `${b.cal} cal`, `5-50 cal`)
    pass2Flags++
  }

  // Water should be 0 cal
  if (/^(bottled |spring |sparkling )?water$/.test(n) && b.cal > 5) {
    flag(item, 2, 'HIGH', 'benchmark-water',
      `Water at ${b.cal} cal. Should be 0.`,
      `${b.cal} cal`, `0 cal`)
    pass2Flags++
  }

  // Edamame typically 120-200 cal
  if (/^edamame$/.test(n) && (b.cal > 400 || b.cal < 80)) {
    flag(item, 2, 'MEDIUM', 'benchmark-edamame',
      `Edamame at ${b.cal} cal. Typical serving is 120-200 cal.`,
      `${b.cal} cal`, `120-200 cal`)
    pass2Flags++
  }

  // Side salad typically 50-200 cal
  if (/^(side |garden |house )?salad$/.test(n) && b.cal > 500) {
    flag(item, 2, 'MEDIUM', 'benchmark-salad',
      `Simple salad at ${b.cal} cal seems high. Expect 50-200 without heavy toppings.`,
      `${b.cal} cal`, `50-200 cal`)
    pass2Flags++
  }

  // Fresh fruit cup typically 60-150 cal
  if (/fresh fruit|fruit cup|fruit platter/.test(n) && b.cal > 400) {
    flag(item, 2, 'MEDIUM', 'benchmark-fruit',
      `Fruit at ${b.cal} cal seems high. Fresh fruit cup typically 60-150 cal.`,
      `${b.cal} cal`, `60-150 cal`)
    pass2Flags++
  }
}
console.log(`Pass 2 complete: ${pass2Flags} flags`)

// ============================================================
// PASS 3: Systematic Patterns
// ============================================================
console.log('\n=== PASS 3: Systematic Patterns ===')
let pass3Flags = 0

// 3a. Suspiciously round numbers
for (const item of items) {
  const b = base(item)
  if (b.cal == null || b.cal === 0) continue

  const vals = [b.cal, b.carbs, b.fat, b.protein].filter(v => v != null && v > 0)
  if (vals.length >= 3) {
    const allRound = vals.every(v => v! % 5 === 0)
    const allVeryRound = vals.every(v => v! % 10 === 0)
    if (allVeryRound && b.cal > 50) {
      flag(item, 3, 'LOW', 'round-numbers',
        `All values divisible by 10: cal=${b.cal}, carbs=${b.carbs}, fat=${b.fat}, protein=${b.protein}. May be rough estimate.`)
      pass3Flags++
    }
  }
}

// 3b. Duplicate nutritional profiles
const profileMap = new Map<string, any[]>()
for (const item of items) {
  const b = base(item)
  if (b.cal == null || b.cal === 0) continue
  const key = `${b.cal}-${b.carbs}-${b.fat}-${b.protein}-${b.sugar}-${b.sodium}`
  if (!profileMap.has(key)) profileMap.set(key, [])
  profileMap.get(key)!.push(item)
}

for (const [key, group] of profileMap) {
  if (group.length >= 2) {
    // Check if items are meaningfully different
    const names = group.map((i: any) => i.name)
    const uniqueNames = new Set(names.map((n: string) => n.toLowerCase().replace(/[^a-z]/g, '')))
    if (uniqueNames.size > 1) {
      // Different items with same nutrition
      const b = base(group[0])
      const nameList = names.slice(0, 5).join(', ')
      flag(group[0], 3, group.length > 3 ? 'HIGH' : 'MEDIUM', 'duplicate-profile',
        `${group.length} different items share identical profile (cal=${b.cal}, carbs=${b.carbs}, fat=${b.fat}, protein=${b.protein}): ${nameList}${group.length > 5 ? '...' : ''}`)
      pass3Flags++
    }
  }
}

// 3c. Category ranking violations
const categoryItems = new Map<string, any[]>()
for (const item of items) {
  const b = base(item)
  if (b.cal == null) continue
  const cat = b.category || 'unknown'
  if (!categoryItems.has(cat)) categoryItems.set(cat, [])
  categoryItems.get(cat)!.push({ ...b, _item: item })
}

for (const [cat, catItems] of categoryItems) {
  const sorted = catItems.sort((a: any, b: any) => b.cal - a.cal)

  // Check beverages: water/tea/coffee should not rank above milkshakes
  if (cat === 'beverage') {
    for (let i = 0; i < Math.min(sorted.length, 20); i++) {
      const n = sorted[i].name.toLowerCase()
      if (/^(water|unsweetened.*tea|hot tea|brewed coffee|black coffee)/.test(n) && sorted[i].cal > 100) {
        flag(sorted[i]._item, 3, 'HIGH', 'category-ranking',
          `"${sorted[i].name}" is a low-cal beverage but has ${sorted[i].cal} cal, ranking above expected.`)
        pass3Flags++
      }
    }
  }

  // Check entrees: salads shouldn't outrank burgers often
  if (cat === 'entree') {
    for (const ci of sorted.slice(0, 30)) {
      if (/\bsalad\b/i.test(ci.name) && ci.cal > 1000 && !/loaded|crispy|fried|taco/i.test(ci.name)) {
        flag(ci._item, 3, 'MEDIUM', 'category-ranking',
          `Salad "${ci.name}" at ${ci.cal} cal ranks in top entrees. Verify portion/toppings.`)
        pass3Flags++
      }
    }
  }
}

// 3d. Missing data patterns by park
const parkStats = new Map<string, { total: number, missingNutrition: number, missingSodium: number, missingSugar: number, zeroProtein: number }>()
for (const item of items) {
  const b = base(item)
  const park = b.park
  if (!parkStats.has(park)) parkStats.set(park, { total: 0, missingNutrition: 0, missingSodium: 0, missingSugar: 0, zeroProtein: 0 })
  const stats = parkStats.get(park)!
  stats.total++
  if (b.cal == null) stats.missingNutrition++
  if (b.sodium == null) stats.missingSodium++
  if (b.sugar == null) stats.missingSugar++
  if (b.protein != null && b.protein === 0 && b.cal != null && b.cal > 200 && !['dessert', 'beverage'].includes(b.category)) stats.zeroProtein++
}

console.log('\n--- Park-level data quality ---')
for (const [park, stats] of parkStats) {
  const issues: string[] = []
  if (stats.missingNutrition > 0) issues.push(`${stats.missingNutrition} missing nutrition`)
  if (stats.missingSodium > stats.total * 0.3) issues.push(`${stats.missingSodium}/${stats.total} missing sodium`)
  if (stats.missingSugar > stats.total * 0.3) issues.push(`${stats.missingSugar}/${stats.total} missing sugar`)
  if (stats.zeroProtein > 3) issues.push(`${stats.zeroProtein} savory items with 0g protein`)
  if (issues.length > 0) {
    console.log(`  ${park} (${stats.total} items): ${issues.join(', ')}`)
  }
}

// 3e. Extreme outliers (>2 std dev from category mean)
for (const [cat, catItems] of categoryItems) {
  if (catItems.length < 10) continue
  const cals = catItems.map((ci: any) => ci.cal).filter((c: number) => c > 0)
  const mean = cals.reduce((a: number, b: number) => a + b, 0) / cals.length
  const stddev = Math.sqrt(cals.reduce((a: number, c: number) => a + (c - mean) ** 2, 0) / cals.length)

  for (const ci of catItems) {
    if (ci.cal > 0 && Math.abs(ci.cal - mean) > 3 * stddev) {
      flag(ci._item, 3, 'MEDIUM', 'statistical-outlier',
        `${cat} category: ${ci.cal} cal is ${((ci.cal - mean) / stddev).toFixed(1)} std devs from mean (${Math.round(mean)}±${Math.round(stddev)}).`)
      pass3Flags++
    }
  }
}

console.log(`Pass 3 complete: ${pass3Flags} flags`)

// ============================================================
// SUMMARY
// ============================================================
console.log('\n\n========================================')
console.log('        AUDIT SUMMARY')
console.log('========================================')
console.log(`Total items audited: ${items.length}`)
console.log(`Total flags: ${flags.length}`)
console.log(`  HIGH severity: ${flags.filter(f => f.severity === 'HIGH').length}`)
console.log(`  MEDIUM severity: ${flags.filter(f => f.severity === 'MEDIUM').length}`)
console.log(`  LOW severity: ${flags.filter(f => f.severity === 'LOW').length}`)
console.log(`  Pass 1 (internal): ${flags.filter(f => f.pass === 1).length}`)
console.log(`  Pass 2 (plausibility): ${flags.filter(f => f.pass === 2).length}`)
console.log(`  Pass 3 (patterns): ${flags.filter(f => f.pass === 3).length}`)

// Sort by severity
const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 }
flags.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

// Output all flags
console.log('\n\n========================================')
console.log('        FLAGGED ITEMS (sorted by severity)')
console.log('========================================\n')

for (const f of flags) {
  console.log(`[${f.severity}] ${f.item} @ ${f.restaurant} (${f.park})`)
  console.log(`  Pass ${f.pass} | ${f.issue}`)
  console.log(`  ${f.details}`)
  if (f.currentValue) console.log(`  Current: ${f.currentValue}`)
  if (f.suggestedValue) console.log(`  Suggested: ${f.suggestedValue}`)
  console.log()
}

// Write full report to file
writeFileSync(join(__dirname, '..', 'full-audit-report.json'), JSON.stringify({
  summary: {
    totalItems: items.length,
    totalFlags: flags.length,
    highSeverity: flags.filter(f => f.severity === 'HIGH').length,
    mediumSeverity: flags.filter(f => f.severity === 'MEDIUM').length,
    lowSeverity: flags.filter(f => f.severity === 'LOW').length,
  },
  flags
}, null, 2))
console.log('\nFull report written to full-audit-report.json')
