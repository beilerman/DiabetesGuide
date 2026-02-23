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
console.log('           ADDITIONAL FIXABLE ISSUES ANALYSIS')
console.log('═══════════════════════════════════════════════════════════════\n')

// ============================================================================
// 1. FOOD ITEMS WITH MISSING FAT DATA
// ============================================================================
console.log('1. FOOD ITEMS WITH MISSING FAT/PROTEIN DATA\n')
console.log('   Items showing P=0g and/or F=0g but high calories:\n')

const missingMacros = flags.filter(f =>
  f.severity === 'HIGH' &&
  f.category === 'caloric-math' &&
  f.current.includes('F=0g') &&
  !/beer|wine|margarita|cocktail|sangria|ale|lager|ipa|bloody mary|bellini|pilsner|punch|freeze|mojito|daiquiri|spritz|mimosa|frose|mule|julep|sour|martini/i.test(f.item)
)

for (const f of missingMacros.slice(0, 15)) {
  const match = f.current.match(/cal=(\d+), P=(\d+)g, C=(\d+)g, F=(\d+)g/)
  if (match) {
    const [_, cal, p, c, fat] = match
    console.log(`   - ${f.item}`)
    console.log(`     ${cal} cal but P=${p}g, C=${c}g, F=${fat}g`)
    console.log(`     Location: ${f.location}`)
    console.log()
  }
}
console.log(`   Total: ${missingMacros.length} items\n`)

// ============================================================================
// 2. JAMBA SMOOTHIES - POSSIBLY OVER-CORRECTED
// ============================================================================
console.log('2. JAMBA SMOOTHIES - POSSIBLY OVER-CORRECTED\n')
console.log('   We set these to 20% sugar of carbs, but fruit smoothies\n')
console.log('   naturally have 60-80% of carbs as sugar:\n')

const jambaItems = [
  'Aloha Pineapple, Medium',
  'Strawberry Surf Rider, Medium',
  'Mega Mango, Medium',
  'Greens \'N Ginger, Medium'
]

for (const item of jambaItems) {
  console.log(`   - ${item}`)
  console.log(`     We corrected: sugar=90g → 18g (20% of ~90g carbs)`)
  console.log(`     Should be: ~54-65g sugar (60-70% of carbs for fruit smoothie)`)
  console.log()
}

// ============================================================================
// 3. MEDIUM SEVERITY PLAUSIBILITY ISSUES
// ============================================================================
console.log('3. MEDIUM SEVERITY PLAUSIBILITY OUTLIERS\n')
console.log('   Items outside expected ranges (may be over-multiplied):\n')

const medPlaus = flags.filter(f => f.severity === 'MEDIUM' && f.category === 'plausibility')

// Group by issue type
const overCalories = medPlaus.filter(f => /above expected.*cal/.test(f.issue))
const underCalories = medPlaus.filter(f => /below expected.*cal/.test(f.issue))

console.log(`   Over expected calories: ${overCalories.length} items`)
for (const f of overCalories.slice(0, 10)) {
  console.log(`   - ${f.item}`)
  console.log(`     ${f.issue}`)
  console.log()
}

console.log(`\n   Under expected calories: ${underCalories.length} items`)
for (const f of underCalories.slice(0, 5)) {
  console.log(`   - ${f.item}`)
  console.log(`     ${f.issue}`)
  console.log()
}

// ============================================================================
// 4. LOW SODIUM IN ENTREES
// ============================================================================
console.log('4. SUSPICIOUSLY LOW SODIUM IN ENTREES\n')
console.log('   Theme park food typically has 800-2000mg sodium:\n')

const lowSodium = flags.filter(f =>
  f.category === 'sodium' &&
  f.issue.includes('suspiciously low')
)

console.log(`   Total: ${lowSodium.length} items with <200mg sodium`)
for (const f of lowSodium.slice(0, 10)) {
  console.log(`   - ${f.item}: ${f.current}`)
}
console.log()

// ============================================================================
// 5. ITEMS WITH ALL NULLS FOR MICRONUTRIENTS
// ============================================================================
console.log('5. ITEMS MISSING ALL MICRONUTRIENTS\n')
console.log('   Items with calories but no sugar/protein/sodium/fiber:\n')

// This would need to query the actual database, but we can estimate from the audit
console.log('   (Would need DB query - estimated 1000+ items from audit Pass 3 data)\n')

// ============================================================================
// SUMMARY & RECOMMENDATIONS
// ============================================================================
console.log('═══════════════════════════════════════════════════════════════')
console.log('                    RECOMMENDATIONS')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log('PRIORITY 1 (Quick Wins):')
console.log('  ✓ Fix Jamba smoothies sugar values (4 items)')
console.log('    - Change from 20% to 60-70% of carbs')
console.log('    - Fruit smoothies naturally high in sugar\n')

console.log('PRIORITY 2 (Data Quality):')
console.log('  ✓ Fill missing fat data for food items (~10-15 items)')
console.log('    - Fried Jumbo Shrimp, Baked Stuffed Shrimp, etc.')
console.log('    - Estimate fat from caloric gap\n')

console.log('PRIORITY 3 (Comprehensive):')
console.log('  ✓ Review MEDIUM severity plausibility outliers (219 items)')
console.log('    - Some may be legitimately over-multiplied')
console.log('    - Spot-check high-cal outliers\n')

console.log('PRIORITY 4 (Enhancement):')
console.log('  ✓ Fill missing micronutrients (sodium, fiber) for items with calories')
console.log('    - Use food-type-based estimates')
console.log('    - Would improve diet tracking accuracy\n')

console.log('PRIORITY 5 (Low Impact):')
console.log('  ✓ Fix low sodium values in entrees (443 items)')
console.log('    - May be accurate for some items (plain grilled meat)')
console.log('    - Theme park food usually heavily seasoned\n')
