import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function auditLowValues() {
  console.log('=== Auditing Suspiciously Low Values ===\n');

  // Entrees with <200 calories (excluding salads, soups)
  console.log('--- Entrees with <200 calories ---');
  const { data: entrees } = await sb
    .from('menu_items')
    .select('id, name, category, restaurant:restaurants(name, park:parks(name)), nutritional_data(calories, carbs, fat, protein)')
    .eq('category', 'entree')
    .order('nutritional_data(calories)');

  let count = 0;
  for (const item of entrees || []) {
    const nd = item.nutritional_data as any;
    const name = item.name.toLowerCase();
    // Skip salads, soups, and obviously low-cal items
    if (nd && nd.calories < 200 && nd.calories > 0 &&
        !name.includes('salad') &&
        !name.includes('soup') &&
        !name.includes('water') &&
        !name.includes('coffee') &&
        !name.includes('tea')) {
      const rest = (item.restaurant as any);
      const park = rest?.park as any;
      console.log(`${nd.calories} cal, ${nd.carbs}g carbs, ${nd.fat}g fat, ${nd.protein}g protein | ${item.name} @ ${rest?.name} (${park?.name})`);
      count++;
      if (count >= 20) break; // Limit output
    }
  }
  console.log(`Found ${count}+ low-calorie entrees\n`);

  // Items where carbs * 4 + protein * 4 + fat * 9 >> calories (missing portion multiplier)
  console.log('--- Items with macro math indicating under-multiplication ---');
  const { data: allItems } = await sb
    .from('menu_items')
    .select('id, name, category, restaurant:restaurants(name, park:parks(name)), nutritional_data(calories, carbs, fat, protein)')
    .neq('category', 'beverage') // Skip beverages (alcohol throws off the math)
    .limit(5000);

  count = 0;
  for (const item of allItems || []) {
    const nd = item.nutritional_data as any;
    if (nd && nd.calories > 0 && nd.carbs > 0 && nd.protein >= 0 && nd.fat >= 0) {
      const calculatedCal = nd.carbs * 4 + nd.protein * 4 + nd.fat * 9;
      const ratio = calculatedCal / nd.calories;

      // If calculated calories are 2x+ actual, this suggests under-counting
      if (ratio > 2.0 && nd.calories < 300) {
        const rest = (item.restaurant as any);
        const park = rest?.park as any;
        console.log(`${nd.calories} cal (calc: ${Math.round(calculatedCal)}) | ${item.name} @ ${rest?.name} (${park?.name})`);
        console.log(`  Macros: ${nd.carbs}g C, ${nd.protein}g P, ${nd.fat}g F`);
        count++;
        if (count >= 20) break;
      }
    }
  }
  console.log(`Found ${count}+ items with macro math issues\n`);

  // Specific Disney Springs check - all categories
  console.log('--- Disney Springs: Items <150 cal that might be undercounted ---');
  const { data: dsItems } = await sb
    .from('menu_items')
    .select(`
      id, name, category,
      restaurant:restaurants!inner(name, park:parks!inner(name)),
      nutritional_data(calories, carbs, fat, protein, confidence_score)
    `)
    .eq('restaurant.park.name', 'Disney Springs')
    .order('nutritional_data(calories)');

  count = 0;
  for (const item of dsItems || []) {
    const nd = item.nutritional_data as any;
    const name = item.name.toLowerCase();
    if (nd && nd.calories < 150 && nd.calories > 0 &&
        item.category !== 'beverage' &&
        !name.includes('water') &&
        !name.includes('coffee') &&
        !name.includes('espresso') &&
        !name.includes('tea') &&
        !name.includes('sauce') &&
        !name.includes('dip') &&
        !name.includes('shot')) {
      const rest = (item.restaurant as any);
      console.log(`${nd.calories} cal, ${nd.carbs}g carbs (conf: ${nd.confidence_score}) | [${item.category}] ${item.name} @ ${rest?.name}`);
      count++;
      if (count >= 30) break;
    }
  }
  console.log(`Found ${count}+ potentially undercounted Disney Springs items`);
}

auditLowValues();
