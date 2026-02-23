import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function auditAll() {
  const results: string[] = [];
  results.push('=== COMPREHENSIVE SUSPICIOUS VALUES AUDIT ===\n');

  // Get ALL menu items with nutrition
  const { data: items } = await sb
    .from('menu_items')
    .select(`
      id, name, category, description,
      restaurant:restaurants(id, name, park:parks(name)),
      nutritional_data(calories, carbs, fat, protein, sugar, fiber, sodium, confidence_score, source)
    `)
    .not('nutritional_data', 'is', null)
    .limit(15000);

  if (!items) {
    console.log('No items found');
    return;
  }

  console.log(`Loaded ${items.length} items, analyzing...`);

  const suspicious: any[] = [];

  for (const item of items) {
    const nd = item.nutritional_data as any;
    const rest = (item.restaurant as any);
    const park = rest?.park as any;

    if (!nd || !nd.calories) continue;

    const name = item.name.toLowerCase();
    const desc = (item.description || '').toLowerCase();

    // Skip obviously low-cal items
    if (name.includes('water') || name.includes('diet') ||
        name.includes('coffee') && !name.includes('frappe') && !name.includes('latte') ||
        name.includes('tea') && !name.includes('sweet') ||
        name.includes('espresso')) {
      continue;
    }

    let issues: string[] = [];

    // Check 1: Bun items (burger, sandwich, hot dog, wrap) with <25g carbs
    if ((name.includes('burger') || name.includes('sandwich') ||
         name.includes('hot dog') || name.includes('wrap') ||
         name.includes('sub') || name.includes('hoagie')) &&
        nd.carbs < 25 && nd.calories > 100) {
      issues.push(`BUN_LOW_CARBS: ${nd.carbs}g (expect 30-60g for bun alone)`);
    }

    // Check 2: Hot dogs <300 cal
    if (name.includes('hot dog') && nd.calories < 300 && nd.calories > 50) {
      issues.push(`HOTDOG_LOW_CAL: ${nd.calories} cal (expect 300-500)`);
    }

    // Check 3: Chili items <200 cal (excluding just sauce/topping)
    if (name.includes('chili') && !name.includes('sauce') && !name.includes('oil') &&
        nd.calories < 200 && nd.calories > 50) {
      issues.push(`CHILI_LOW_CAL: ${nd.calories} cal (expect 250-400)`);
    }

    // Check 4: Burgers <400 cal
    if (name.includes('burger') && !name.includes('veggie') && !name.includes('impossible') &&
        nd.calories < 400 && nd.calories > 100) {
      issues.push(`BURGER_LOW_CAL: ${nd.calories} cal (expect 500-800)`);
    }

    // Check 5: Pizza <250 cal per slice
    if ((name.includes('pizza') || item.category === 'entree' && desc.includes('pizza')) &&
        !name.includes('bread') && nd.calories < 250 && nd.calories > 50) {
      issues.push(`PIZZA_LOW_CAL: ${nd.calories} cal (expect 250-400 per slice)`);
    }

    // Check 6: Macro math way off (calculated >> stated, suggesting under-multiplication)
    if (nd.carbs && nd.protein !== null && nd.fat !== null) {
      const calcCal = nd.carbs * 4 + nd.protein * 4 + nd.fat * 9;
      const ratio = calcCal / nd.calories;
      if (ratio > 2.5 && nd.calories > 50 && nd.calories < 400) {
        issues.push(`MACRO_MATH: ${nd.calories} cal stated, ${Math.round(calcCal)} calculated (${ratio.toFixed(1)}x)`);
      }
    }

    if (issues.length > 0) {
      suspicious.push({
        name: item.name,
        restaurant: rest?.name,
        park: park?.name,
        category: item.category,
        calories: nd.calories,
        carbs: nd.carbs,
        fat: nd.fat,
        protein: nd.protein,
        confidence: nd.confidence_score,
        source: nd.source,
        issues: issues.join('; ')
      });
    }
  }

  results.push(`\nFound ${suspicious.length} suspicious items:\n`);
  results.push('=' .repeat(120) + '\n');

  for (const item of suspicious) {
    results.push(`${item.name} @ ${item.restaurant} (${item.park})\n`);
    results.push(`  ${item.calories} cal, ${item.carbs}g carbs, ${item.fat}g fat, ${item.protein}g protein\n`);
    results.push(`  [${item.category}] conf: ${item.confidence}, source: ${item.source}\n`);
    results.push(`  ISSUES: ${item.issues}\n`);
    results.push('-'.repeat(120) + '\n');
  }

  const output = results.join('');
  writeFileSync('audit/suspicious-values.txt', output);
  console.log(output);
  console.log(`\nWrote results to audit/suspicious-values.txt`);
}

auditAll();
