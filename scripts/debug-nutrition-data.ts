import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function debug() {
  // Check a specific chili cheese hot dog
  const { data: items } = await sb
    .from('menu_items')
    .select('id, name, nutritional_data(id, calories, carbs)')
    .ilike('name', '%Chili-Cheese%Hot Dog%')
    .limit(5);

  console.log('Chili Cheese Hot Dogs:');
  for (const item of items || []) {
    console.log(`\n${item.name}:`);
    console.log(`  menu_item_id: ${item.id}`);
    console.log(`  nutritional_data:`, item.nutritional_data);
  }

  // Check how many items have NO nutritional_data record at all
  const { count: noNdCount } = await sb
    .from('menu_items')
    .select('*', { count: 'exact', head: true })
    .is('nutritional_data', null);

  console.log(`\n\nItems with NO nutritional_data record: ${noNdCount}`);

  // Check how many have nutritional_data but null calories
  const { data: nullCalItems } = await sb
    .from('nutritional_data')
    .select('id, menu_item_id, calories')
    .is('calories', null)
    .limit(10);

  console.log(`\nNutritional_data records with null calories (first 10):`, nullCalItems?.length);
  if (nullCalItems) {
    for (const nd of nullCalItems) {
      console.log(`  nd_id: ${nd.id}, menu_item_id: ${nd.menu_item_id}, calories: ${nd.calories}`);
    }
  }
}

debug();
