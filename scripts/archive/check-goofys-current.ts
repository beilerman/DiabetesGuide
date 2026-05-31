import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(url, key);

async function checkCurrent() {
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id, name, park:parks(name)')
    .ilike('name', '%Goofy%Candy%')
    .single();

  if (restaurant) {
    const { data: items } = await supabase
      .from('menu_items')
      .select('name, description, price, category')
      .eq('restaurant_id', restaurant.id)
      .order('name');

    console.log('Restaurant:', restaurant.name);
    console.log('Park:', restaurant.park.name);
    console.log('Current items in DB:', items?.length || 0);
    console.log('\nItems:');
    items?.forEach(item => {
      console.log(`- ${item.name} (${item.category}) - $${item.price} - ${item.description || 'No description'}`);
    });
  } else {
    console.log('Restaurant not found');
  }
}

checkCurrent();
