/**
 * Filter audit results to find items with REAL data problems
 * (not false positives like coffee having 0 calories)
 */

import { readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface AuditItem {
  id: string
  menu_item_id: string
  name: string
  description: string | null
  category: string
  restaurant: string
  park: string
  calories: number | null
  carbs: number | null
  fat: number | null
  protein: number | null
  sugar: number | null
  fiber: number | null
  sodium: number | null
  confidence_score: number | null
  source: string | null
  issues: string[]
  priority: string
}

const auditPath = resolve(__dirname, '..', 'data', 'nutrition-audit.json')
const data: AuditItem[] = JSON.parse(readFileSync(auditPath, 'utf-8'))

// Items that legitimately have ~0 calories
function isZeroCalLegit(name: string, desc: string | null): boolean {
  const n = name.toLowerCase()
  const d = (desc || '').toLowerCase()

  // Plain coffee/tea
  if (/^(coffee|tea|espresso|americano|hot tea|iced tea|earl grey|green tea|double espresso|brewed coffee|cold brew|nitro cold brew)/i.test(n)) return true

  // Unsweetened drinks
  if (n.includes('unsweetened') || n.includes('plain')) return true

  // Water (should have been removed but just in case)
  if (/water/i.test(n)) return true

  // Diet drinks
  if (/^diet |sugar.?free|zero.?calorie/i.test(n)) return true

  return false
}

// Items where caloric math being "off" is expected
function isCalMathExpected(name: string): boolean {
  const n = name.toLowerCase()

  // Alcohol - has calories from ethanol (7 cal/g) not in P+C+F formula
  if (/beer|wine|cocktail|margarita|martini|whiskey|vodka|rum|bourbon|scotch|tequila|sangria|mimosa|bellini|mojito|daiquiri|ale|lager|ipa|stout|pilsner|sangria|sake|champagne|prosecco|cognac|brandy|gin|vermouth|liqueur|moonshine|cider|mead/i.test(n)) return true

  // Coffee/tea have trace calories not from macros
  if (/coffee|tea|espresso|americano|cold brew|latte/i.test(n)) return true

  return false
}

// Find truly problematic items
const realIssues: AuditItem[] = []

for (const item of data) {
  const name = item.name
  const desc = item.description

  // Skip legitimately zero-cal items
  if (isZeroCalLegit(name, desc) && (item.calories === 0 || item.calories === null)) continue

  // Skip expected caloric math issues
  if (isCalMathExpected(name) && item.issues.every(i => i.includes('math off') || i.includes('Missing'))) continue

  // Now check for real problems:

  // 1. Food item with suspiciously low calories
  const isRealFood = ['entree', 'dessert', 'side', 'snack'].includes(item.category)
  if (isRealFood && item.calories !== null && item.calories < 50 && !isZeroCalLegit(name, desc)) {
    realIssues.push(item)
    continue
  }

  // 2. Sugar > Carbs (impossible)
  if (item.issues.some(i => i.includes('Sugar exceeds'))) {
    realIssues.push(item)
    continue
  }

  // 3. Fiber > Carbs (impossible)
  if (item.issues.some(i => i.includes('Fiber exceeds'))) {
    realIssues.push(item)
    continue
  }

  // 4. Items flagged as way too low for their type
  if (item.issues.some(i => i.includes('only') && !isCalMathExpected(name))) {
    realIssues.push(item)
    continue
  }

  // 5. Null calories on real food
  if (item.calories === null && isRealFood) {
    realIssues.push(item)
    continue
  }

  // 6. Caloric math way off on non-alcohol items
  const mathIssue = item.issues.find(i => i.includes('math off'))
  if (mathIssue && !isCalMathExpected(name)) {
    const percent = parseInt(mathIssue.match(/(\d+)%/)?.[1] || '0')
    if (percent >= 50) {
      realIssues.push(item)
      continue
    }
  }
}

// Sort by priority and then by calories (lowest first as those are most suspicious)
realIssues.sort((a, b) => {
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  const pDiff = (priorityOrder[a.priority] || 4) - (priorityOrder[b.priority] || 4)
  if (pDiff !== 0) return pDiff
  return (a.calories || 0) - (b.calories || 0)
})

console.log(`Found ${realIssues.length} items with real data problems\n`)

console.log('=== ITEMS NEEDING REVIEW ===\n')

for (let i = 0; i < Math.min(100, realIssues.length); i++) {
  const item = realIssues[i]
  console.log(`${i + 1}. ${item.name}`)
  console.log(`   Restaurant: ${item.restaurant} (${item.park})`)
  console.log(`   Category: ${item.category}`)
  console.log(`   Description: ${item.description || 'none'}`)
  console.log(`   Current: ${item.calories} cal | ${item.carbs}g C | ${item.fat}g F | ${item.protein}g P | ${item.sugar}g sugar`)
  console.log(`   Issues: ${item.issues.join(', ')}`)
  console.log(`   Confidence: ${item.confidence_score} | Source: ${item.source}`)
  console.log(`   ID: ${item.id}`)
  console.log('')
}

// Save to file for processing
const outPath = resolve(__dirname, '..', 'data', 'items-to-fix.json')
writeFileSync(outPath, JSON.stringify(realIssues, null, 2))
console.log(`\nSaved ${realIssues.length} items to data/items-to-fix.json`)
