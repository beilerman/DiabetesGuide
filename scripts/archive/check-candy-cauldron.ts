import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCandyCauldron() {
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id, name')
    .eq('name', 'Candy Cauldron')
    .single();

  if (!restaurant) {
    console.log('Candy Cauldron not found in database');
    return;
  }

  console.log(`Restaurant: ${restaurant.name} (${restaurant.id})`);

  const { data: items } = await supabase
    .from('menu_items')
    .select('name, description, price, category')
    .eq('restaurant_id', restaurant.id);

  console.log(`\nCurrent items in DB: ${items?.length || 0}`);
  items?.forEach((item, i) => {
    console.log(`${i+1}. ${item.name} - $${item.price} - ${item.category}`);
    if (item.description) console.log(`   Description: ${item.description}`);
  });
}

checkCandyCauldron();
