import type { Item, AuditFinding, AuditPassResult } from './types.js'
import { THRESHOLDS } from './thresholds.js'
import { nd } from './utils.js'

/**
 * Completeness check pass.
 * Validates data coverage at the park and restaurant level:
 *   - parks with fewer than MIN_RESTAURANTS_PER_PARK restaurants
 *   - restaurants with fewer than MIN_ITEMS_PER_RESTAURANT items
 *   - parks with more than MAX_NULL_CALORIE_PCT% null-calorie items
 *   - items with confidence_score below MIN_CONFIDENCE_SCORE
 */
export function checkCompleteness(items: Item[]): AuditPassResult {
  const findings: AuditFinding[] = []
  const stats: Record<string, number> = { parks: 0, restaurants: 0, items: items.length }

  // Group items: park -> restaurant -> items[]
  const parkMap = new Map<string, Map<string, Item[]>>()

  for (const item of items) {
    const parkName = item.restaurant?.park?.name ?? 'Unknown Park'
    const restName = item.restaurant?.name ?? 'Unknown Restaurant'

    if (!parkMap.has(parkName)) {
      parkMap.set(parkName, new Map())
    }
    const restMap = parkMap.get(parkName)!
    if (!restMap.has(restName)) {
      restMap.set(restName, [])
    }
    restMap.get(restName)!.push(item)
  }

  stats.parks = parkMap.size

  let totalRestaurants = 0
  for (const [parkName, restMap] of parkMap) {
    totalRestaurants += restMap.size

    // Check 1: sparse park (< MIN_RESTAURANTS_PER_PARK restaurants)
    if (restMap.size < THRESHOLDS.MIN_RESTAURANTS_PER_PARK) {
      findings.push({
        item: '',
        restaurant: '',
        park: parkName,
        checkName: 'sparse_park',
        severity: 'HIGH',
        message: `Park has only ${restMap.size} restaurant(s), minimum is ${THRESHOLDS.MIN_RESTAURANTS_PER_PARK}`,
        currentValue: String(restMap.size),
        suggestedValue: String(THRESHOLDS.MIN_RESTAURANTS_PER_PARK),
        autoFixable: false,
      })
    }

    // Check 2: sparse restaurants (< MIN_ITEMS_PER_RESTAURANT items)
    for (const [restName, restItems] of restMap) {
      if (restItems.length < THRESHOLDS.MIN_ITEMS_PER_RESTAURANT) {
        findings.push({
          item: '',
          restaurant: restName,
          park: parkName,
          checkName: 'sparse_restaurant',
          severity: 'MEDIUM',
          message: `Restaurant has only ${restItems.length} item(s), minimum is ${THRESHOLDS.MIN_ITEMS_PER_RESTAURANT}`,
          currentValue: String(restItems.length),
          suggestedValue: String(THRESHOLDS.MIN_ITEMS_PER_RESTAURANT),
          autoFixable: false,
        })
      }
    }

    // Check 3: null calorie coverage
    const allParkItems: Item[] = []
    for (const restItems of restMap.values()) {
      allParkItems.push(...restItems)
    }

    const nullCalorieCount = allParkItems.filter((item) => {
      const n = nd(item)
      return n === null || n.calories === null || n.calories === 0
    }).length

    const nullPct = allParkItems.length > 0
      ? (nullCalorieCount / allParkItems.length) * 100
      : 0

    if (nullPct > THRESHOLDS.MAX_NULL_CALORIE_PCT) {
      findings.push({
        item: '',
        restaurant: '',
        park: parkName,
        checkName: 'null_calorie_coverage',
        severity: 'HIGH',
        message: `${nullCalorieCount}/${allParkItems.length} items (${nullPct.toFixed(1)}%) have null/zero calories, maximum is ${THRESHOLDS.MAX_NULL_CALORIE_PCT}%`,
        currentValue: `${nullPct.toFixed(1)}%`,
        suggestedValue: `<=${THRESHOLDS.MAX_NULL_CALORIE_PCT}%`,
        autoFixable: false,
      })
    }

    // Check 4: low confidence items
    const lowConfidenceItems = allParkItems.filter((item) => {
      const n = nd(item)
      return n !== null && n.confidence_score !== null && n.confidence_score < THRESHOLDS.MIN_CONFIDENCE_SCORE
    })

    if (lowConfidenceItems.length > 0) {
      findings.push({
        item: '',
        restaurant: '',
        park: parkName,
        checkName: 'low_confidence',
        severity: 'MEDIUM',
        message: `${lowConfidenceItems.length} item(s) have confidence_score below ${THRESHOLDS.MIN_CONFIDENCE_SCORE}`,
        currentValue: String(lowConfidenceItems.length),
        autoFixable: false,
      })
    }
  }

  stats.restaurants = totalRestaurants

  return {
    pass: 'completeness',
    findings,
    autoFixes: [],
    stats,
  }
}

// CLI entry point
if (process.argv[1]?.endsWith('completeness.ts') || process.argv[1]?.endsWith('completeness.js')) {
  import('./utils.js').then(async ({ createSupabaseClient, fetchAllItems, rootPath }) => {
    const { writeFileSync } = await import('fs')

    console.log('Fetching all items from Supabase...')
    const supabase = createSupabaseClient()
    const items = await fetchAllItems(supabase)
    console.log(`Fetched ${items.length} items`)

    const result = checkCompleteness(items)

    const highCount = result.findings.filter((f) => f.severity === 'HIGH').length
    const medCount = result.findings.filter((f) => f.severity === 'MEDIUM').length
    const lowCount = result.findings.filter((f) => f.severity === 'LOW').length

    console.log('\n--- Completeness Check Results ---')
    console.log(`Parks:       ${result.stats.parks}`)
    console.log(`Restaurants: ${result.stats.restaurants}`)
    console.log(`Items:       ${result.stats.items}`)
    console.log(`Findings: ${result.findings.length} (HIGH: ${highCount}, MEDIUM: ${medCount}, LOW: ${lowCount})`)

    const outPath = rootPath('audit', 'completeness-results.json')
    writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n', 'utf-8')
    console.log(`\nResults written to ${outPath}`)
  })
}
