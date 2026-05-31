/**
 * Comprehensive nutrition data quality audit for food scientist review.
 * Identifies items needing attention based on multiple quality criteria.
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local
const envPath = resolve(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const envVars: Record<string, string> = {}
envContent.split('\n').forEach(line => {
  const trimmed = line.trim()
  if (trimmed && !trimmed.startsWith('#')) {
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) envVars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
  }
})

const url = envVars['SUPABASE_URL'] || process.env.SUPABASE_URL
const key = envVars['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

interface NutritionRow {
  id: string
  menu_item_id: string
  calories: number | null
  carbs: number | null
  fat: number | null
  protein: number | null
  sugar: number | null
  fiber: number | null
  sodium: number | null
  source: string | null
  confidence_score: number | null
  menu_item: {
    id: string
    name: string
    description: string | null
    category: string
    is_fried: boolean
    restaurant: {
      name: string
      park: { name: string }
    }
  }
}

interface AuditIssue {
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
  priority: 'critical' | 'high' | 'medium' | 'low'
}

function detectIssues(row: NutritionRow): { issues: string[], priority: 'critical' | 'high' | 'medium' | 'low' } {
  const issues: string[] = []
  const mi = row.menu_item
  const name = mi?.name?.toLowerCase() || ''
  const desc = mi?.description?.toLowerCase() || ''
  const cat = mi?.category || ''

  // Critical: No calories at all
  if (row.calories === null || row.calories === 0) {
    // Skip if it's a legitimately zero-cal item
    const zeroCal = /^(diet |sugar.?free|zero.?calorie|plain tea|green tea|black tea|earl grey|hot tea|iced tea|americano|espresso|black coffee)/i
    if (!zeroCal.test(name)) {
      issues.push('Missing calories')
    }
  }

  // High: Caloric math doesn't add up (P*4 + C*4 + F*9 should be close to stated calories)
  if (row.calories && row.protein !== null && row.carbs !== null && row.fat !== null) {
    const computed = (row.protein * 4) + (row.carbs * 4) + (row.fat * 9)
    const diff = Math.abs(row.calories - computed)
    const ratio = diff / row.calories

    // Allow more variance for alcohol (adds ~7 cal/g)
    const isAlcohol = /beer|wine|cocktail|margarita|martini|whiskey|vodka|rum|bourbon|scotch|tequila|sangria|mimosa|bellini|mojito|daiquiri/i.test(name)

    if (!isAlcohol && ratio > 0.35) {
      issues.push(`Caloric math off by ${Math.round(ratio * 100)}%`)
    }
  }

  // High: Sugar > Carbs (impossible)
  if (row.sugar !== null && row.carbs !== null && row.sugar > row.carbs) {
    issues.push('Sugar exceeds carbs')
  }

  // High: Fiber > Carbs (impossible)
  if (row.fiber !== null && row.carbs !== null && row.fiber > row.carbs) {
    issues.push('Fiber exceeds carbs')
  }

  // Medium: Suspiciously low for category
  if (row.calories && row.calories > 0) {
    const tooLow: Record<string, number> = {
      burger: 350,
      pizza: 200,
      sandwich: 250,
      burrito: 350,
      nachos: 300,
      'fried chicken': 300,
      steak: 300,
      pasta: 250,
      'mac and cheese': 250,
      'ice cream': 150,
      sundae: 250,
      cupcake: 250,
      brownie: 200,
      cookie: 100,
      donut: 150,
      churro: 150,
      pretzel: 200,
    }

    for (const [food, minCal] of Object.entries(tooLow)) {
      if (name.includes(food) && row.calories < minCal) {
        issues.push(`${food} only ${row.calories} cal (expected >${minCal})`)
      }
    }
  }

  // Medium: Suspiciously high for category
  if (row.calories && row.calories > 0) {
    const tooHigh: Record<string, number> = {
      side: 800,
      appetizer: 1200,
      salad: 1000,
      soup: 600,
      cookie: 600,
      muffin: 700,
      scone: 600,
      'ice cream': 800,  // single scoop
      coffee: 400,  // unless it's a fancy frappuccino
    }

    for (const [food, maxCal] of Object.entries(tooHigh)) {
      // More specific matching to avoid false positives
      if (cat === food || (name.includes(food) && !name.includes('platter') && !name.includes('combo'))) {
        if (row.calories > maxCal) {
          issues.push(`${food} at ${row.calories} cal (expected <${maxCal})`)
        }
      }
    }
  }

  // Medium: Fried item with low fat
  if (mi?.is_fried && row.fat !== null && row.fat < 10) {
    issues.push('Fried item has low fat')
  }

  // Medium: Dessert with no sugar data
  if (cat === 'dessert' && row.sugar === null) {
    issues.push('Dessert missing sugar data')
  }

  // Low: Missing macros
  if (row.protein === null) issues.push('Missing protein')
  if (row.carbs === null) issues.push('Missing carbs')
  if (row.fat === null) issues.push('Missing fat')
  if (row.sodium === null) issues.push('Missing sodium')

  // Low: Very low confidence score
  if (row.confidence_score !== null && row.confidence_score < 35) {
    issues.push(`Low confidence: ${row.confidence_score}`)
  }

  // Determine priority
  let priority: 'critical' | 'high' | 'medium' | 'low' = 'low'
  if (issues.some(i => i.includes('Missing calories'))) {
    priority = 'critical'
  } else if (issues.some(i => i.includes('math off') || i.includes('exceeds'))) {
    priority = 'high'
  } else if (issues.some(i => i.includes('only') || i.includes('Fried') || i.includes('Dessert'))) {
    priority = 'medium'
  }

  return { issues, priority }
}

async function main() {
  console.log('Fetching all nutrition data with menu item details...\n')

  let allRows: NutritionRow[] = []
  let from = 0
  const batchSize = 1000

  while (true) {
    const { data: batch, error } = await supabase
      .from('nutritional_data')
      .select(`
        id,
        menu_item_id,
        calories,
        carbs,
        fat,
        protein,
        sugar,
        fiber,
        sodium,
        source,
        confidence_score,
        menu_item:menu_items(
          id,
          name,
          description,
          category,
          is_fried,
          restaurant:restaurants(
            name,
            park:parks(name)
          )
        )
      `)
      .range(from, from + batchSize - 1)

    if (error) {
      console.error('Fetch error:', error)
      break
    }
    if (!batch?.length) break

    // Normalize nested arrays
    const normalized = batch.map(row => {
      const mi = Array.isArray(row.menu_item) ? row.menu_item[0] : row.menu_item
      const rest = mi?.restaurant
      const restNorm = Array.isArray(rest) ? rest[0] : rest
      const park = restNorm?.park
      const parkNorm = Array.isArray(park) ? park[0] : park

      return {
        ...row,
        menu_item: {
          ...mi,
          restaurant: {
            ...restNorm,
            park: parkNorm
          }
        }
      }
    })

    allRows = allRows.concat(normalized as NutritionRow[])
    if (batch.length < batchSize) break
    from += batchSize
  }

  console.log(`Total items: ${allRows.length}\n`)

  // Generate statistics
  const stats = {
    total: allRows.length,
    withCalories: allRows.filter(r => r.calories && r.calories > 0).length,
    withCarbs: allRows.filter(r => r.carbs !== null).length,
    withProtein: allRows.filter(r => r.protein !== null).length,
    withFat: allRows.filter(r => r.fat !== null).length,
    withSugar: allRows.filter(r => r.sugar !== null).length,
    withFiber: allRows.filter(r => r.fiber !== null).length,
    withSodium: allRows.filter(r => r.sodium !== null).length,
    bySource: {} as Record<string, number>,
    byConfidence: {} as Record<string, number>,
  }

  for (const row of allRows) {
    const src = row.source || 'unknown'
    stats.bySource[src] = (stats.bySource[src] || 0) + 1

    const conf = row.confidence_score
    const confBucket = conf === null ? 'null' :
      conf >= 70 ? '70+' :
      conf >= 50 ? '50-69' :
      conf >= 40 ? '40-49' :
      conf >= 30 ? '30-39' : '<30'
    stats.byConfidence[confBucket] = (stats.byConfidence[confBucket] || 0) + 1
  }

  console.log('=== COVERAGE STATISTICS ===')
  console.log(`Items with calories: ${stats.withCalories} (${(stats.withCalories / stats.total * 100).toFixed(1)}%)`)
  console.log(`Items with carbs: ${stats.withCarbs} (${(stats.withCarbs / stats.total * 100).toFixed(1)}%)`)
  console.log(`Items with protein: ${stats.withProtein} (${(stats.withProtein / stats.total * 100).toFixed(1)}%)`)
  console.log(`Items with fat: ${stats.withFat} (${(stats.withFat / stats.total * 100).toFixed(1)}%)`)
  console.log(`Items with sugar: ${stats.withSugar} (${(stats.withSugar / stats.total * 100).toFixed(1)}%)`)
  console.log(`Items with sodium: ${stats.withSodium} (${(stats.withSodium / stats.total * 100).toFixed(1)}%)`)

  console.log('\n=== BY SOURCE ===')
  for (const [src, count] of Object.entries(stats.bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`${src}: ${count} (${(count / stats.total * 100).toFixed(1)}%)`)
  }

  console.log('\n=== BY CONFIDENCE SCORE ===')
  for (const [conf, count] of Object.entries(stats.byConfidence).sort((a, b) => b[1] - a[1])) {
    console.log(`${conf}: ${count} (${(count / stats.total * 100).toFixed(1)}%)`)
  }

  // Find issues
  console.log('\n=== DETECTING ISSUES ===')

  const itemsWithIssues: AuditIssue[] = []

  for (const row of allRows) {
    const { issues, priority } = detectIssues(row)
    if (issues.length > 0) {
      itemsWithIssues.push({
        id: row.id,
        menu_item_id: row.menu_item_id,
        name: row.menu_item?.name || 'Unknown',
        description: row.menu_item?.description || null,
        category: row.menu_item?.category || 'unknown',
        restaurant: row.menu_item?.restaurant?.name || 'Unknown',
        park: row.menu_item?.restaurant?.park?.name || 'Unknown',
        calories: row.calories,
        carbs: row.carbs,
        fat: row.fat,
        protein: row.protein,
        sugar: row.sugar,
        fiber: row.fiber,
        sodium: row.sodium,
        confidence_score: row.confidence_score,
        source: row.source,
        issues,
        priority,
      })
    }
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
  itemsWithIssues.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  const criticalCount = itemsWithIssues.filter(i => i.priority === 'critical').length
  const highCount = itemsWithIssues.filter(i => i.priority === 'high').length
  const mediumCount = itemsWithIssues.filter(i => i.priority === 'medium').length
  const lowCount = itemsWithIssues.filter(i => i.priority === 'low').length

  console.log(`\nItems with issues: ${itemsWithIssues.length}`)
  console.log(`  Critical: ${criticalCount}`)
  console.log(`  High: ${highCount}`)
  console.log(`  Medium: ${mediumCount}`)
  console.log(`  Low: ${lowCount}`)

  // Save to file
  const outPath = resolve(__dirname, '..', 'data', 'nutrition-audit.json')
  writeFileSync(outPath, JSON.stringify(itemsWithIssues, null, 2))
  console.log(`\nSaved ${itemsWithIssues.length} items to data/nutrition-audit.json`)

  // Show sample of critical/high issues
  console.log('\n=== SAMPLE CRITICAL ISSUES ===')
  itemsWithIssues
    .filter(i => i.priority === 'critical')
    .slice(0, 20)
    .forEach(i => {
      console.log(`${i.name} @ ${i.restaurant} (${i.park})`)
      console.log(`  Issues: ${i.issues.join(', ')}`)
      console.log(`  Current: ${i.calories} cal, ${i.carbs}g carbs, ${i.fat}g fat, ${i.protein}g protein`)
    })

  console.log('\n=== SAMPLE HIGH ISSUES ===')
  itemsWithIssues
    .filter(i => i.priority === 'high')
    .slice(0, 20)
    .forEach(i => {
      console.log(`${i.name} @ ${i.restaurant} (${i.park})`)
      console.log(`  Issues: ${i.issues.join(', ')}`)
      console.log(`  Current: ${i.calories} cal, ${i.carbs}g carbs, ${i.fat}g fat, ${i.protein}g protein`)
    })
}

main().catch(console.error)
