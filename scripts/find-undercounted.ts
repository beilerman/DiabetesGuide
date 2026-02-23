import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findUndercounted() {
  console.log('=== Finding Undercounted Items ===\n');

  // Hot dogs with <300 calories
  console.log('--- Hot Dogs with <300 calories ---');
  const { data: hotdogs } = await sb
    .from('menu_items')
    .select('id, name, restaurant:restaurants(name), nutritional_data(calories, carbs, fat, protein)')
    .ilike('name', '%hot dog%')
    .order('name');

  let count = 0;
  for (const item of hotdogs || []) {
    const nd = item.nutritional_data as any;
    if (nd && nd.calories < 300 && nd.calories > 0) {
      console.log(`${nd.calories} cal, ${nd.carbs}g carbs | ${item.name} (${(item.restaurant as any)?.name})`);
      count++;
    }
  }
  console.log(`Found ${count} undercounted hot dogs\n`);

  // Burgers/sandwiches with <25g carbs
  console.log('--- Burgers/Sandwiches with <25g carbs ---');
  const { data: bunItems } = await sb
    .from('menu_items')
    .select('id, name, restaurant:restaurants(name), nutritional_data(calories, carbs, fat, protein)')
    .or('name.ilike.%burger%,name.ilike.%sandwich%')
    .order('name');

  count = 0;
  for (const item of bunItems || []) {
    const nd = item.nutritional_data as any;
    if (nd && nd.carbs > 0 && nd.carbs < 25 && nd.calories > 100) {
      console.log(`${nd.calories} cal, ${nd.carbs}g carbs | ${item.name} (${(item.restaurant as any)?.name})`);
      count++;
    }
  }
  console.log(`Found ${count} undercounted burgers/sandwiches\n`);

  // Chili items with <200 calories
  console.log('--- Chili items with <200 calories ---');
  const { data: chili } = await sb
    .from('menu_items')
    .select('id, name, restaurant:restaurants(name), nutritional_data(calories, carbs, fat, protein)')
    .ilike('name', '%chili%')
    .order('name');

  count = 0;
  for (const item of chili || []) {
    const nd = item.nutritional_data as any;
    if (nd && nd.calories < 200 && nd.calories > 0) {
      console.log(`${nd.calories} cal, ${nd.carbs}g carbs | ${item.name} (${(item.restaurant as any)?.name})`);
      count++;
    }
  }
  console.log(`Found ${count} undercounted chili items\n`);

  // Items with buns but <20g carbs (very suspicious)
  console.log('--- Bun items with <20g carbs (very suspicious) ---');
  const keywords = ['%dog%', '%burger%', '%sandwich%', '%wrap%', '%sub%', '%hoagie%'];

  for (const keyword of keywords) {
    const { data: items } = await sb
      .from('menu_items')
      .select('id, name, restaurant:restaurants(name), nutritional_data(calories, carbs)')
      .ilike('name', keyword)
      .order('name');

    for (const item of items || []) {
      const nd = item.nutritional_data as any;
      if (nd && nd.carbs > 0 && nd.carbs < 20 && nd.calories > 100) {
        console.log(`${nd.calories} cal, ${nd.carbs}g carbs | ${item.name} (${(item.restaurant as any)?.name})`);
        count++;
      }
    }
  }
  console.log(`Found ${count} very suspicious bun items\n`);
}

findUndercounted();
