import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkSpecific() {
  // Get total count
  const { count } = await sb
    .from('menu_items')
    .select('*', { count: 'exact', head: true });
  console.log(`Total items in database: ${count}\n`);

  const searches = [
    { pattern: '%chili%hot%dog%', desc: 'Chili hot dogs' },
    { pattern: '%chili%cheese%dog%', desc: 'Chili cheese dogs' },
    { pattern: '%loaded%hot%dog%', desc: 'Loaded hot dogs' },
    { pattern: '%bacon%burger%', desc: 'Bacon burgers' },
    { pattern: '%chili%dog%', desc: 'Any chili dogs' },
  ];

  for (const search of searches) {
    const { data } = await sb
      .from('menu_items')
      .select('name, restaurant:restaurants(name), nutritional_data(calories, carbs, fat, protein)')
      .ilike('name', search.pattern)
      .limit(20);

    if (data && data.length > 0) {
      console.log(`${search.desc}:`);
      for (const item of data) {
        const nd = item.nutritional_data as any;
        const rest = (item.restaurant as any);
        console.log(`  ${nd?.calories || 'null'} cal, ${nd?.carbs || 'null'}g carbs | ${item.name} @ ${rest?.name}`);
      }
      console.log('');
    }
  }

  // Also check for items with buns and low carbs
  console.log('Burgers/sandwiches/dogs with <30g carbs:');
  const { data: bunItems } = await sb
    .from('menu_items')
    .select('name, restaurant:restaurants(name), nutritional_data(calories, carbs)')
    .or('name.ilike.%burger%,name.ilike.%sandwich%,name.ilike.%hot dog%')
    .lt('nutritional_data.carbs', 30)
    .gt('nutritional_data.calories', 100)
    .limit(30);

  if (bunItems) {
    for (const item of bunItems) {
      const nd = item.nutritional_data as any;
      const rest = (item.restaurant as any);
      console.log(`  ${nd.calories} cal, ${nd.carbs}g carbs | ${item.name} @ ${rest?.name}`);
    }
  }
}

checkSpecific();
