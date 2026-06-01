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

// Get HIGH severity caloric-math issues that are NOT alcoholic drinks
const nonAlcoholMath = flags.filter(f =>
  f.severity === 'HIGH' &&
  f.category === 'caloric-math' &&
  !/beer|wine|margarita|cocktail|sangria|ale|lager|ipa|old fashioned|mai tai|rum|vodka|whiskey|tequila|butterbeer|wizard.*brew|mojito|daiquiri|spritz|bellini|mimosa|prosecco|champagne|aperol|negroni|bourbon|gin|scotch/i.test(f.item)
)

console.log('═══════════════════════════════════════════════════════════════')
console.log('   NON-ALCOHOLIC ITEMS WITH CALORIC MATH ISSUES')
console.log('═══════════════════════════════════════════════════════════════\n')
console.log(`Found ${nonAlcoholMath.length} items\n`)

// Group by severity of mismatch
const extremeOver = nonAlcoholMath.filter(f => {
  const match = f.issue.match(/ratio (\d+\.\d+)/)
  return match && parseFloat(match[1]) > 2.5
})

const extremeUnder = nonAlcoholMath.filter(f => {
  const match = f.issue.match(/ratio (0\.\d+)/)
  return match && parseFloat(match[1]) < 0.5
})

const moderate = nonAlcoholMath.filter(f => !extremeOver.includes(f) && !extremeUnder.includes(f))

console.log('═══════════════════════════════════════════════════════════════')
console.log(`EXTREME OVERCOUNTED (${extremeOver.length} items)`)
console.log('Stated calories > 2.5x calculated from macros')
console.log('═══════════════════════════════════════════════════════════════\n')

for (const f of extremeOver) {
  const match = f.current.match(/cal=(\d+), P=(\d+)g, C=(\d+)g, F=(\d+)g/)
  if (match) {
    const [_, cal, p, c, fat] = match
    const calculated = parseInt(p) * 4 + parseInt(c) * 4 + parseInt(fat) * 9
    const ratio = parseInt(cal) / calculated
    const gap = parseInt(cal) - calculated

    console.log(`📝 ${f.item}`)
    console.log(`   Location: ${f.location}`)
    console.log(`   Stated: ${cal} cal | Calculated: ${calculated} cal | Gap: +${gap} cal (${ratio.toFixed(2)}x)`)
    console.log(`   Macros: P=${p}g, C=${c}g, F=${fat}g`)
    console.log()
  }
}

console.log('═══════════════════════════════════════════════════════════════')
console.log(`EXTREME UNDERCOUNTED (${extremeUnder.length} items)`)
console.log('Stated calories < 50% of calculated from macros')
console.log('═══════════════════════════════════════════════════════════════\n')

for (const f of extremeUnder) {
  const match = f.current.match(/cal=(\d+), P=(\d+)g, C=(\d+)g, F=(\d+)g/)
  if (match) {
    const [_, cal, p, c, fat] = match
    const calculated = parseInt(p) * 4 + parseInt(c) * 4 + parseInt(fat) * 9
    const ratio = parseInt(cal) / calculated
    const gap = calculated - parseInt(cal)

    console.log(`📝 ${f.item}`)
    console.log(`   Location: ${f.location}`)
    console.log(`   Stated: ${cal} cal | Calculated: ${calculated} cal | Gap: -${gap} cal (${ratio.toFixed(2)}x)`)
    console.log(`   Macros: P=${p}g, C=${c}g, F=${fat}g`)
    console.log()
  }
}

console.log('═══════════════════════════════════════════════════════════════')
console.log(`MODERATE MISMATCH (${moderate.length} items)`)
console.log('Ratio between 0.5-2.5x (may be missing fat or minor errors)')
console.log('═══════════════════════════════════════════════════════════════\n')

for (const f of moderate.slice(0, 30)) {
  const match = f.current.match(/cal=(\d+), P=(\d+)g, C=(\d+)g, F=(\d+)g/)
  if (match) {
    const [_, cal, p, c, fat] = match
    const calculated = parseInt(p) * 4 + parseInt(c) * 4 + parseInt(fat) * 9
    const ratio = parseInt(cal) / calculated
    const gap = parseInt(cal) - calculated

    console.log(`📝 ${f.item}`)
    console.log(`   Location: ${f.location}`)
    console.log(`   Stated: ${cal} cal | Calculated: ${calculated} cal | Gap: ${gap > 0 ? '+' : ''}${gap} cal (${ratio.toFixed(2)}x)`)
    console.log(`   Macros: P=${p}g, C=${c}g, F=${fat}g`)
    console.log()
  }
}

if (moderate.length > 30) {
  console.log(`... and ${moderate.length - 30} more moderate mismatches\n`)
}

console.log('═══════════════════════════════════════════════════════════════')
console.log('ANALYSIS')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log('LIKELY CAUSES:')
console.log('1. Extreme Overcounted: Missing fat/protein data (macros show 0g)')
console.log('2. Extreme Undercounted: Decimal errors or wrong calorie value')
console.log('3. Moderate: Rounding differences, missing fiber alcohol, or portion estimates\n')

console.log('RECOMMENDATIONS:')
console.log('- Extreme overcounted: Check if fat=0 is accurate or missing data')
console.log('- Extreme undercounted: Recalculate calories from macros')
console.log('- Moderate: Likely acceptable variance, review selectively\n')
