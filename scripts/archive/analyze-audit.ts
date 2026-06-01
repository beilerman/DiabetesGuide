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

// Group HIGH severity by category
const highFlags = flags.filter(f => f.severity === 'HIGH')
const categories = new Map<string, Flag[]>()

for (const flag of highFlags) {
  if (!categories.has(flag.category)) {
    categories.set(flag.category, [])
  }
  categories.get(flag.category)!.push(flag)
}

console.log('=== HIGH SEVERITY ISSUES BY CATEGORY ===\n')

for (const [cat, items] of [...categories.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${cat}: ${items.length} issues`)

  // Show first 3 examples
  for (let i = 0; i < Math.min(3, items.length); i++) {
    const f = items[i]
    console.log(`  - ${f.item}`)
    console.log(`    Issue: ${f.issue}`)
    console.log(`    Current: ${f.current}`)
  }
  console.log()
}

// Specific patterns to look for
console.log('=== SPECIFIC PROBLEMATIC PATTERNS ===\n')

// 1. Alcoholic drinks (expected caloric gap)
const alcoholFlags = highFlags.filter(f =>
  /beer|wine|margarita|cocktail|sangria|ale|lager|ipa|old fashioned|mai tai/i.test(f.item)
)
console.log(`Alcoholic drinks with caloric math flags: ${alcoholFlags.length}`)
console.log('  (These are EXPECTED - alcohol has 7 cal/g not in P*4+C*4+F*9 formula)\n')

// 2. Sugar > Carbs (impossible)
const sugarFlags = highFlags.filter(f => f.category === 'sugar-carbs')
console.log(`Sugar > Carbs (impossible): ${sugarFlags.length}`)
for (const f of sugarFlags.slice(0, 10)) {
  console.log(`  - ${f.item}: ${f.current}`)
}
console.log()

// 3. Extreme caloric undercount
const undercount = highFlags.filter(f =>
  f.issue.includes('ratio 0.') && parseFloat(f.issue.match(/ratio (0\.\d+)/)?.[1] || '1') < 0.5
)
console.log(`Extreme caloric undercount (stated < 50% of calculated): ${undercount.length}`)
for (const f of undercount.slice(0, 10)) {
  console.log(`  - ${f.item}: ${f.current}`)
}
console.log()

// 4. Extreme caloric overcount
const overcount = highFlags.filter(f =>
  f.issue.includes('ratio') && parseFloat(f.issue.match(/ratio (\d+\.\d+)/)?.[1] || '1') > 2.5
)
console.log(`Extreme caloric overcount (stated > 2.5x calculated): ${overcount.length}`)
for (const f of overcount.slice(0, 10)) {
  console.log(`  - ${f.item}: ${f.current}`)
}
console.log()

// 5. Plausibility outliers
const plausFlags = highFlags.filter(f => f.category === 'plausibility')
console.log(`Plausibility outliers: ${plausFlags.length}`)
for (const f of plausFlags.slice(0, 10)) {
  console.log(`  - ${f.item}`)
  console.log(`    Issue: ${f.issue}`)
}
console.log()
