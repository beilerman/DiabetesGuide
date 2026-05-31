import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const { data: park } = await sb.from('parks').select('id,name').eq('name', "Universal's Epic Universe").single();
if (!park) { console.log('Park not found'); process.exit(1); }

const { data: restaurants } = await sb.from('restaurants').select('id,name,land').eq('park_id', park.id).order('name');
const restIds = restaurants!.map(r => r.id);
const { data: items } = await sb.from('menu_items').select('id,restaurant_id').in('restaurant_id', restIds);
const counts = new Map<string, number>();
for (const i of items!) counts.set(i.restaurant_id, (counts.get(i.restaurant_id) ?? 0) + 1);

console.log(`\n=== ${park.name} (${restaurants!.length} restaurants, ${items!.length} items) ===`);
for (const r of restaurants!) {
  const c = counts.get(r.id) ?? 0;
  console.log(`  ${String(c).padStart(3)}  ${r.name} [${r.land}]`);
}
