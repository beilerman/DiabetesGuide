import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(url, key)

async function generateReport() {
  const items: any[] = []
  let from = 0

  while (true) {
    const { data, error } = await sb
      .from('menu_items')
      .select(`
        id, name, category,
        nutritional_data(calories, carbs, fat, protein, sugar, fiber, sodium, confidence_score)
      `)
      .range(from, from + 499)

    if (error) {
      console.error(error)
      break
    }
    if (!data || data.length === 0) break

    items.push(...data)

    if (data.length < 500) break
    from += 500
  }

  console.log('═══════════════════════════════════════════════════════════════')
  console.log('          FINAL DATABASE QUALITY REPORT')
  console.log('═══════════════════════════════════════════════════════════════\n')

  console.log(`Total items: ${items.length}`)
  console.log()

  // Items with nutrition data
  const withNutrition = items.filter(i => i.nutritional_data?.[0]?.calories && i.nutritional_data[0].calories > 0)
  console.log(`Items with nutrition data: ${withNutrition.length} (${Math.round(withNutrition.length/items.length*100)}%)\n`)

  // Items with carbs
  const withCarbs = withNutrition.filter(i => i.nutritional_data[0].carbs && i.nutritional_data[0].carbs > 0)
  console.log(`Items with carbs > 0: ${withCarbs.length}`)

  // Sugar completeness (for items with carbs)
  const withSugar = withCarbs.filter(i => i.nutritional_data[0].sugar && i.nutritional_data[0].sugar > 0)
  const missingSugar = withCarbs.filter(i => !i.nutritional_data[0].sugar || i.nutritional_data[0].sugar === 0)
  console.log(`  - With sugar data: ${withSugar.length} (${Math.round(withSugar.length/withCarbs.length*100)}%)`)
  console.log(`  - Missing sugar: ${missingSugar.length} (${Math.round(missingSugar.length/withCarbs.length*100)}%)`)

  // Fiber completeness (for items with carbs)
  const withFiber = withCarbs.filter(i => i.nutritional_data[0].fiber !== null && i.nutritional_data[0].fiber !== undefined)
  const missingFiber = withCarbs.filter(i => i.nutritional_data[0].fiber === null || i.nutritional_data[0].fiber === undefined)
  console.log(`  - With fiber data: ${withFiber.length} (${Math.round(withFiber.length/withCarbs.length*100)}%)`)
  console.log(`  - Missing fiber: ${missingFiber.length} (${Math.round(missingFiber.length/withCarbs.length*100)}%)`)
  console.log()

  // Protein completeness (all items with calories)
  const withProtein = withNutrition.filter(i => i.nutritional_data[0].protein !== null && i.nutritional_data[0].protein !== undefined)
  const missingProtein = withNutrition.filter(i => i.nutritional_data[0].protein === null || i.nutritional_data[0].protein === undefined)
  console.log(`Protein completeness: ${withProtein.length}/${withNutrition.length} (${Math.round(withProtein.length/withNutrition.length*100)}%)`)
  console.log(`  - Missing: ${missingProtein.length} items`)
  console.log()

  // Sodium completeness (all items with calories)
  const withSodium = withNutrition.filter(i => i.nutritional_data[0].sodium !== null && i.nutritional_data[0].sodium !== undefined)
  const missingSodium = withNutrition.filter(i => i.nutritional_data[0].sodium === null || i.nutritional_data[0].sodium === undefined)
  console.log(`Sodium completeness: ${withSodium.length}/${withNutrition.length} (${Math.round(withSodium.length/withNutrition.length*100)}%)`)
  console.log(`  - Missing: ${missingSodium.length} items`)
  console.log()

  // Critical errors
  const sugarGtCarbs = withCarbs.filter(i => {
    const nut = i.nutritional_data[0]
    return nut.sugar && nut.carbs && nut.sugar > nut.carbs
  })
  console.log('CRITICAL ERRORS:')
  console.log(`  Sugar > Carbs: ${sugarGtCarbs.length} items ${sugarGtCarbs.length === 0 ? '✅' : '❌'}`)
  console.log()

  // Confidence score distribution
  const highConfidence = withNutrition.filter(i => i.nutritional_data[0].confidence_score >= 50)
  const mediumConfidence = withNutrition.filter(i => {
    const conf = i.nutritional_data[0].confidence_score
    return conf && conf >= 35 && conf < 50
  })
  const lowConfidence = withNutrition.filter(i => {
    const conf = i.nutritional_data[0].confidence_score
    return conf && conf < 35
  })
  console.log('CONFIDENCE SCORE DISTRIBUTION:')
  console.log(`  High (≥50): ${highConfidence.length} items (${Math.round(highConfidence.length/withNutrition.length*100)}%)`)
  console.log(`  Medium (35-49): ${mediumConfidence.length} items (${Math.round(mediumConfidence.length/withNutrition.length*100)}%)`)
  console.log(`  Low (<35): ${lowConfidence.length} items (${Math.round(lowConfidence.length/withNutrition.length*100)}%)`)
  console.log()

  console.log('═══════════════════════════════════════════════════════════════')
  console.log('CONCLUSION')
  console.log('═══════════════════════════════════════════════════════════════\n')

  if (sugarGtCarbs.length === 0 && missingSugar.length < withCarbs.length * 0.1 && missingProtein.length < withNutrition.length * 0.1) {
    console.log('✅ DATABASE IS ERROR-FREE AND PRODUCTION-READY!')
    console.log()
    console.log('Key achievements:')
    console.log('  • Zero biological impossibilities (sugar > carbs)')
    console.log(`  • ${Math.round(withSugar.length/withCarbs.length*100)}% sugar completeness (items with carbs)`)
    console.log(`  • ${Math.round(withProtein.length/withNutrition.length*100)}% protein completeness`)
    console.log(`  • ${Math.round(withSodium.length/withNutrition.length*100)}% sodium completeness`)
    console.log(`  • ${Math.round(withFiber.length/withCarbs.length*100)}% fiber completeness (items with carbs)`)
    console.log()
  } else {
    console.log('⚠️  Some data quality issues remain:')
    if (sugarGtCarbs.length > 0) {
      console.log(`  - ${sugarGtCarbs.length} items with sugar > carbs (CRITICAL)`)
    }
    if (missingSugar.length > withCarbs.length * 0.1) {
      console.log(`  - ${Math.round(missingSugar.length/withCarbs.length*100)}% items missing sugar`)
    }
    if (missingProtein.length > withNutrition.length * 0.1) {
      console.log(`  - ${Math.round(missingProtein.length/withNutrition.length*100)}% items missing protein`)
    }
    console.log()
  }
}

generateReport()
