import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function debug() {
  // Get the specific item we saw in the browser
  const { data: item } = await sb
    .from('menu_items')
    .select(`
      id, name, category,
      restaurant:restaurants(name, park:parks(name)),
      nutritional_data(id, calories, carbs, fat, protein, sugar, fiber, sodium, source, confidence_score)
    `)
    .eq('name', 'Chili Cheese Hot Dog Combo')
    .limit(5);

  console.log('Chili Cheese Hot Dog Combo items:');
  for (const i of item || []) {
    const rest = (i.restaurant as any);
    const park = rest?.park as any;
    const nd = i.nutritional_data as any;
    console.log(`\n${i.name} @ ${rest?.name} (${park?.name})`);
    console.log(`  Nutrition data:`, nd);
  }

  // Get all Universal items with hot dog in name
  const { data: hotdogs } = await sb
    .from('menu_items')
    .select(`
      id, name,
      restaurant:restaurants!inner(name, park:parks!inner(name)),
      nutritional_data(calories, carbs)
    `)
    .ilike('name', '%hot dog%')
    .eq('restaurant.park.name', 'Universal Studios Florida')
    .limit(10);

  console.log(`\n\nUniversal Studios Florida hot dogs:`);
  for (const item of hotdogs || []) {
    const rest = (item.restaurant as any);
    const nd = item.nutritional_data as any;
    console.log(`${item.name} @ ${rest?.name}: ${nd?.calories || 'null'} cal, ${nd?.carbs || 'null'}g carbs`);
  }
}

debug();
