import type { Item, AuditFinding, AutoFix, AuditPassResult, Severity } from './types.js'
import { THRESHOLDS } from './thresholds.js'
import { nd, loc, isLikelyAlcoholic } from './utils.js'

const FRIED_PASTRY_PATTERN =
  /\b(fried|crispy|pastry|pie|croissant|donut|doughnut|fritter|churro)\b/i

const MEAT_PATTERN =
  /\b(chicken|beef|pork|turkey|steak|ribs|brisket|fish|salmon|shrimp|lobster|lamb|sausage|bacon|ham)\b/i

const MACRO_FIELDS = ['calories', 'carbs', 'fat', 'protein', 'sugar', 'fiber'] as const

/**
 * Pure accuracy check pass.
 * Validates internal consistency of nutrition data:
 *   - fiber/sugar vs carbs
 *   - extreme sodium
 *   - negative macros
 *   - calorie range
 *   - Atwater factor deviation (skips alcoholic beverages)
 *   - zero fat on fried items
 *   - zero protein on meat items
 */
export function checkAccuracy(items: Item[]): AuditPassResult {
  const findings: AuditFinding[] = []
  const autoFixes: AutoFix[] = []
  const stats = { checked: 0, clean: 0, flagged: 0 }

  for (const item of items) {
    const n = nd(item)
    if (!n) continue

    stats.checked++
    const itemFindings: AuditFinding[] = []
    const itemFixes: AutoFix[] = []
    const location = loc(item)
    const restaurant = item.restaurant?.name ?? 'Unknown Restaurant'
    const park = item.restaurant?.park?.name ?? 'Unknown Park'

    // 1. fiber > carbs
    if (
      n.fiber !== null &&
      n.carbs !== null &&
      n.fiber > n.carbs
    ) {
      const suggested = Math.round(n.carbs * THRESHOLDS.FIBER_CARB_RATIO)
      itemFindings.push({
        item: item.name,
        restaurant,
        park,
        checkName: 'fiber_gt_carbs',
        severity: 'HIGH',
        message: `Fiber (${n.fiber}g) exceeds carbs (${n.carbs}g) — impossible`,
        currentValue: String(n.fiber),
        suggestedValue: String(suggested),
        autoFixable: true,
      })
      itemFixes.push({
        nutritionDataId: n.id,
        item: item.name,
        restaurant,
        park,
        field: 'fiber',
        before: n.fiber,
        after: suggested,
        reason: `fiber (${n.fiber}) > carbs (${n.carbs}); set to ${THRESHOLDS.FIBER_CARB_RATIO * 100}% of carbs`,
      })
    }

    // 2. sugar > carbs
    if (
      n.sugar !== null &&
      n.carbs !== null &&
      n.sugar > n.carbs
    ) {
      itemFindings.push({
        item: item.name,
        restaurant,
        park,
        checkName: 'sugar_gt_carbs',
        severity: 'HIGH',
        message: `Sugar (${n.sugar}g) exceeds carbs (${n.carbs}g) — impossible`,
        currentValue: String(n.sugar),
        suggestedValue: String(n.carbs),
        autoFixable: true,
      })
      itemFixes.push({
        nutritionDataId: n.id,
        item: item.name,
        restaurant,
        park,
        field: 'sugar',
        before: n.sugar,
        after: n.carbs,
        reason: `sugar (${n.sugar}) > carbs (${n.carbs}); capped to carbs`,
      })
    }

    // 3. sodium > MAX_SODIUM
    if (
      n.sodium !== null &&
      n.sodium > THRESHOLDS.MAX_SODIUM
    ) {
      const suggested = Math.round(n.sodium / THRESHOLDS.SODIUM_DIVISOR)
      itemFindings.push({
        item: item.name,
        restaurant,
        park,
        checkName: 'sodium_extreme',
        severity: 'HIGH',
        message: `Sodium (${n.sodium}mg) exceeds ${THRESHOLDS.MAX_SODIUM}mg — likely decimal place error`,
        currentValue: String(n.sodium),
        suggestedValue: String(suggested),
        autoFixable: true,
      })
      itemFixes.push({
        nutritionDataId: n.id,
        item: item.name,
        restaurant,
        park,
        field: 'sodium',
        before: n.sodium,
        after: suggested,
        reason: `sodium ${n.sodium} > ${THRESHOLDS.MAX_SODIUM}; divided by ${THRESHOLDS.SODIUM_DIVISOR}`,
      })
    }

    // 4. negative macros
    for (const field of MACRO_FIELDS) {
      const val = n[field]
      if (val !== null && val < 0) {
        itemFindings.push({
          item: item.name,
          restaurant,
          park,
          checkName: 'negative_value',
          severity: 'HIGH',
          message: `${field} is negative (${val}) — invalid`,
          currentValue: String(val),
          suggestedValue: '0',
          autoFixable: true,
        })
        itemFixes.push({
          nutritionDataId: n.id,
          item: item.name,
          restaurant,
          park,
          field,
          before: val,
          after: 0,
          reason: `${field} was negative (${val}); set to 0`,
        })
      }
    }

    // 5. calories out of range (> MAX_CALORIES) — only if not already caught by negative check
    if (
      n.calories !== null &&
      n.calories > THRESHOLDS.MAX_CALORIES
    ) {
      itemFindings.push({
        item: item.name,
        restaurant,
        park,
        checkName: 'calories_extreme',
        severity: 'HIGH',
        message: `Calories (${n.calories}) exceeds maximum plausible value of ${THRESHOLDS.MAX_CALORIES}`,
        currentValue: String(n.calories),
        autoFixable: false,
      })
    }

    // 6. Atwater deviation (skip for alcoholic beverages)
    if (
      n.calories !== null &&
      n.calories > 0 &&
      n.protein !== null &&
      n.carbs !== null &&
      n.fat !== null &&
      !isLikelyAlcoholic(item.name, item)
    ) {
      const estimate = n.protein * 4 + n.carbs * 4 + n.fat * 9
      if (estimate > 0) {
        const absDiff = Math.abs(n.calories - estimate)
        const deviation = absDiff / estimate * 100
        let severity: Severity | null = null
        if (deviation > THRESHOLDS.ATWATER_HIGH_PCT && absDiff >= THRESHOLDS.ATWATER_MIN_ABS_CAL) {
          severity = 'HIGH'
        } else if (deviation > THRESHOLDS.ATWATER_MEDIUM_PCT) {
          severity = 'MEDIUM'
        }
        if (severity) {
          itemFindings.push({
            item: item.name,
            restaurant,
            park,
            checkName: 'atwater_deviation',
            severity,
            message: `Atwater deviation ${deviation.toFixed(1)}% (stated ${n.calories} cal vs estimated ${Math.round(estimate)} cal)`,
            currentValue: String(n.calories),
            suggestedValue: String(Math.round(estimate)),
            autoFixable: false,
          })
        }
      }
    }

    // 7. fat = 0 on fried/pastry items
    if (
      n.fat !== null &&
      n.fat === 0 &&
      (item.is_fried || FRIED_PASTRY_PATTERN.test(item.name))
    ) {
      itemFindings.push({
        item: item.name,
        restaurant,
        park,
        checkName: 'zero_fat_fried',
        severity: 'MEDIUM',
        message: `Fat is 0g but item appears to be fried/pastry — likely missing data`,
        currentValue: '0',
        autoFixable: false,
      })
    }

    // 8. protein = 0 on meat items
    if (
      n.protein !== null &&
      n.protein === 0 &&
      MEAT_PATTERN.test(item.name)
    ) {
      itemFindings.push({
        item: item.name,
        restaurant,
        park,
        checkName: 'zero_protein_meat',
        severity: 'MEDIUM',
        message: `Protein is 0g but item appears to contain meat — likely missing data`,
        currentValue: '0',
        autoFixable: false,
      })
    }

    // Accumulate
    if (itemFindings.length > 0) {
      stats.flagged++
      findings.push(...itemFindings)
      autoFixes.push(...itemFixes)
    } else {
      stats.clean++
    }
  }

  return {
    pass: 'accuracy',
    findings,
    autoFixes,
    stats,
  }
}

// CLI entry point
if (process.argv[1]?.endsWith('accuracy.ts') || process.argv[1]?.endsWith('accuracy.js')) {
  import('./utils.js').then(async ({ createSupabaseClient, fetchAllItems, rootPath }) => {
    const { writeFileSync } = await import('fs')

    console.log('Fetching all items from Supabase...')
    const supabase = createSupabaseClient()
    const items = await fetchAllItems(supabase)
    console.log(`Fetched ${items.length} items`)

    const result = checkAccuracy(items)

    const highCount = result.findings.filter((f) => f.severity === 'HIGH').length
    const medCount = result.findings.filter((f) => f.severity === 'MEDIUM').length
    const lowCount = result.findings.filter((f) => f.severity === 'LOW').length

    console.log('\n--- Accuracy Check Results ---')
    console.log(`Checked: ${result.stats.checked}`)
    console.log(`Clean:   ${result.stats.clean}`)
    console.log(`Flagged: ${result.stats.flagged}`)
    console.log(`Findings: ${result.findings.length} (HIGH: ${highCount}, MEDIUM: ${medCount}, LOW: ${lowCount})`)
    console.log(`Auto-fixes: ${result.autoFixes.length}`)

    const outPath = rootPath('audit', 'accuracy-results.json')
    writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n', 'utf-8')
    console.log(`\nResults written to ${outPath}`)
  })
}
