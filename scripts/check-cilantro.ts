import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Find Cilantro Urban Eatery
  const { data: restaurant, error: restError } = await supabase
    .from('restaurants')
    .select('id, name, park:parks(name)')
    .ilike('name', '%cilantro%')
    .single();

  if (restError) {
    console.log('Restaurant not found:', restError.message);
    return;
  }

  console.log('Restaurant:', restaurant.name);
  console.log('Park:', restaurant.park.name);
  console.log('\nCurrent menu items (7 items):');

  // Get current menu items
  const { data: items, error: itemsError } = await supabase
    .from('menu_items')
    .select('name, description, price, category')
    .eq('restaurant_id', restaurant.id)
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (itemsError) {
    console.log('Error fetching items:', itemsError.message);
    return;
  }

  items?.forEach((item, i) => {
    console.log(`\n${i + 1}. ${item.name}`);
    console.log(`   Category: ${item.category}`);
    console.log(`   Price: $${item.price}`);
    if (item.description) {
      console.log(`   Description: ${item.description}`);
    }
  });
}

main();
