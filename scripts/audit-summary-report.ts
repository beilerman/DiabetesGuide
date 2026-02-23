import { readFileSync } from 'fs'

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

const flags: Flag[] = JSON.parse(readFileSync('audit-report.json', 'utf-8'))

console.log('═══════════════════════════════════════════════════════════════')
console.log('         DATABASE NUTRITION DATA QUALITY AUDIT REPORT')
console.log('═══════════════════════════════════════════════════════════════\n')

const highFlags = flags.filter(f => f.severity === 'HIGH')
const medFlags = flags.filter(f => f.severity === 'MEDIUM')
const lowFlags = flags.filter(f => f.severity === 'LOW')

console.log(`Total flags: ${flags.length}`)
console.log(`  HIGH severity:   ${highFlags.length}`)
console.log(`  MEDIUM severity: ${medFlags.length}`)
console.log(`  LOW severity:    ${lowFlags.length}\n`)

console.log('═══════════════════════════════════════════════════════════════')
console.log('                  CRITICAL ISSUES TO FIX')
console.log('═══════════════════════════════════════════════════════════════\n')

// 1. SUGAR > CARBS (impossible)
console.log('1. SUGAR > CARBS (Impossible - 46 items)\n')
console.log('   These violate biological constraints and MUST be fixed:\n')
const sugarFlags = highFlags.filter(f => f.category === 'sugar-carbs')
for (const f of sugarFlags) {
  const match = f.current.match(/sugar=(\d+)g, carbs=(\d+)g/)
  if (match) {
    const sugar = parseInt(match[1])
    const carbs = parseInt(match[2])
    console.log(`   - ${f.item}`)
    console.log(`     Location: ${f.location}`)
    console.log(`     Current: sugar=${sugar}g, carbs=${carbs}g`)
    console.log(`     Fix: sugar should be ≤ ${carbs}g (likely swap or typo)\n`)
  }
}

// 2. EXTREME CALORIC UNDERCOUNT
console.log('\n2. EXTREME CALORIC UNDERCOUNT (4 items)\n')
console.log('   Stated calories < 50% of calculated from macros:\n')
const undercount = highFlags.filter(f =>
  f.issue.includes('ratio 0.') && parseFloat(f.issue.match(/ratio (0\.\d+)/)?.[1] || '1') < 0.5
)
for (const f of undercount) {
  const match = f.current.match(/cal=(\d+), P=(\d+)g, C=(\d+)g, F=(\d+)g/)
  if (match) {
    const [_, cal, p, c, fat] = match
    const calculated = parseInt(p) * 4 + parseInt(c) * 4 + parseInt(fat) * 9
    console.log(`   - ${f.item}`)
    console.log(`     Location: ${f.location}`)
    console.log(`     Current: ${cal} cal (but macros calculate to ${calculated} cal)`)
    console.log(`     Current: P=${p}g, C=${c}g, F=${fat}g`)
    console.log(`     Fix: Either calories should be ~${calculated} OR macros are wrong\n`)
  }
}

// 3. FALSE POSITIVES FROM REGEX SUBSTRING MATCHING
console.log('\n═══════════════════════════════════════════════════════════════')
console.log('              FALSE POSITIVES (Audit Script Issues)')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log('3. PLAUSIBILITY FLAGS DUE TO SUBSTRING MATCHING (506 items)\n')
console.log('   These are mostly FALSE POSITIVES from the audit regex patterns:\n')

const plausFlags = highFlags.filter(f => f.category === 'plausibility')
const falsePositivePatterns = [
  { pattern: /beer/i, reason: 'Matches "Beer-battered", "Root Beer", food items with beer as ingredient' },
  { pattern: /wine/i, reason: 'Matches "Red Wine-braised", "Wine-marinated", food items with wine as ingredient' },
  { pattern: /coffee/i, reason: 'Matches "Coffee Cake", "Coffee-rubbed", "Cocoa Coffee Crusted"' },
  { pattern: /cocktail/i, reason: 'Matches "Shrimp Cocktail", "Fruit Cocktail" (not alcoholic drinks)' },
  { pattern: /water/i, reason: 'Matches "Watermelon", items with water as ingredient' },
]

const fpExamples = new Map<string, Flag[]>()
for (const fp of falsePositivePatterns) {
  fpExamples.set(fp.reason, [])
}

for (const f of plausFlags) {
  for (const fp of falsePositivePatterns) {
    if (fp.pattern.test(f.item) && !fpExamples.get(fp.reason)!.find(x => x.item === f.item)) {
      fpExamples.get(fp.reason)!.push(f)
    }
  }
}

for (const [reason, examples] of fpExamples) {
  if (examples.length > 0) {
    console.log(`   ${reason}:`)
    for (const f of examples.slice(0, 5)) {
      console.log(`     - ${f.item} (${f.location})`)
    }
    if (examples.length > 5) {
      console.log(`     ... and ${examples.length - 5} more`)
    }
    console.log()
  }
}

// 4. ALCOHOLIC DRINKS (EXPECTED CALORIC GAPS)
console.log('\n4. ALCOHOLIC DRINKS WITH CALORIC MATH "ERRORS" (249 items)\n')
console.log('   These are EXPECTED - alcohol has 7 cal/g not in P*4+C*4+F*9:\n')

const alcoholFlags = highFlags.filter(f =>
  f.category === 'caloric-math' &&
  /beer|wine|margarita|cocktail|sangria|ale|lager|ipa|old fashioned|mai tai|rum|vodka|whiskey|tequila/i.test(f.item)
)

console.log(`   Total: ${alcoholFlags.length} items`)
console.log(`   A standard drink has ~100 cal from alcohol alone.`)
console.log(`   Examples:`)
for (const f of alcoholFlags.slice(0, 5)) {
  const match = f.current.match(/cal=(\d+), P=(\d+)g, C=(\d+)g, F=(\d+)g/)
  if (match) {
    const [_, cal, p, c, fat] = match
    const macrosCal = parseInt(p) * 4 + parseInt(c) * 4 + parseInt(fat) * 9
    const alcoholCal = parseInt(cal) - macrosCal
    console.log(`     - ${f.item}: ${cal} cal (${macrosCal} from macros + ~${alcoholCal} from alcohol)`)
  }
}
console.log()

// 5. NON-ALCOHOL CALORIC MATH ISSUES (REAL PROBLEMS)
console.log('\n5. NON-ALCOHOLIC ITEMS WITH CALORIC MATH ISSUES (73 items)\n')
console.log('   These are REAL data quality issues:\n')

const nonAlcoholMath = highFlags.filter(f =>
  f.category === 'caloric-math' &&
  !/beer|wine|margarita|cocktail|sangria|ale|lager|ipa|old fashioned|mai tai|rum|vodka|whiskey|tequila|butterbeer|wizard.*brew/i.test(f.item)
)

console.log(`   Total: ${nonAlcoholMath.length} items`)
for (const f of nonAlcoholMath.slice(0, 20)) {
  const match = f.current.match(/cal=(\d+), P=(\d+)g, C=(\d+)g, F=(\d+)g/)
  if (match) {
    const [_, cal, p, c, fat] = match
    const calculated = parseInt(p) * 4 + parseInt(c) * 4 + parseInt(fat) * 9
    const ratio = parseInt(cal) / calculated
    console.log(`   - ${f.item}`)
    console.log(`     Location: ${f.location}`)
    console.log(`     Current: ${cal} cal vs calculated ${calculated} cal (ratio ${ratio.toFixed(2)})`)
    console.log()
  }
}
if (nonAlcoholMath.length > 20) {
  console.log(`   ... and ${nonAlcoholMath.length - 20} more\n`)
}

console.log('\n═══════════════════════════════════════════════════════════════')
console.log('                    MEDIUM SEVERITY ISSUES')
console.log('═══════════════════════════════════════════════════════════════\n')

const medCategories = new Map<string, Flag[]>()
for (const f of medFlags) {
  if (!medCategories.has(f.category)) {
    medCategories.set(f.category, [])
  }
  medCategories.get(f.category)!.push(f)
}

for (const [cat, items] of [...medCategories.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${cat}: ${items.length} items`)
}
console.log()

console.log('\n═══════════════════════════════════════════════════════════════')
console.log('                       RECOMMENDATIONS')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log('1. FIX IMMEDIATELY (50 items):')
console.log('   - Sugar > Carbs (46 items) - biological impossibility')
console.log('   - Extreme caloric undercount (4 items) - obvious data errors\n')

console.log('2. INVESTIGATE NON-ALCOHOL CALORIC MATH (73 items):')
console.log('   - Items where calories don\'t match macros')
console.log('   - Likely missing fat/protein data or decimal errors\n')

console.log('3. IGNORE FALSE POSITIVES (506 items):')
console.log('   - Audit script regex patterns match substrings')
console.log('   - "Beer-battered Fish" matched as "beer" (beverage)')
console.log('   - "Shrimp Cocktail" matched as "cocktail" (alcoholic drink)')
console.log('   - Audit script needs improvement, not data\n')

console.log('4. IGNORE ALCOHOLIC DRINKS (249 items):')
console.log('   - Caloric math gaps are EXPECTED')
console.log('   - Alcohol has 7 cal/g not in P*4+C*4+F*9 formula\n')

console.log('5. REVIEW MEDIUM SEVERITY (446 items):')
console.log('   - Lower priority but worth spot-checking')
console.log('   - Many may also be false positives\n')

console.log('═══════════════════════════════════════════════════════════════\n')
