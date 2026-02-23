import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Set env vars'); process.exit(1) }
const sb = createClient(url, key)

async function main() {
  const { data: park } = await sb.from('parks').select('id').ilike('name', '%Animal Kingdom%').single()
  if (!park) { console.error('Park not found'); process.exit(1) }
  console.log('Park ID:', park.id)

  // 1. Restaurants with 'Updated' in name
  const { data: renamed } = await sb.from('restaurants').select('id, name, land')
    .eq('park_id', park.id).ilike('name', '%Updated%')
  console.log('\n=== Restaurants needing rename ===')
  for (const r of renamed ?? []) console.log(`  "${r.name}" (${r.land}) [${r.id}]`)

  // 2. Land inconsistency
  const { data: dinoland } = await sb.from('restaurants').select('id, name, land')
    .eq('park_id', park.id).ilike('land', '%Dino%')
  console.log('\n=== Dinoland land values ===')
  for (const r of dinoland ?? []) console.log(`  "${r.name}" → land="${r.land}" [${r.id}]`)

  // 3. Dawa Bar category issues
  const { data: dawaRests } = await sb.from('restaurants').select('id, name')
    .eq('park_id', park.id).ilike('name', '%Dawa%')
  if (dawaRests?.length) {
    const { data: dawaItems } = await sb.from('menu_items').select('id, name, category')
      .eq('restaurant_id', dawaRests[0].id).order('category')
    console.log('\n=== Dawa Bar items by category ===')
    for (const i of dawaItems ?? []) console.log(`  [${i.category}] ${i.name} (${i.id})`)
  }

  // 4. Angry Orchard as dessert
  const { data: angry } = await sb.from('menu_items').select('id, name, category, restaurant_id')
    .ilike('name', '%Angry Orchard%')
  console.log('\n=== Angry Orchard items ===')
  for (const a of angry ?? []) console.log(`  [${a.category}] ${a.name} (${a.id})`)

  // 5. Check all AK beverages miscategorized as entree
  const { data: allRests } = await sb.from('restaurants').select('id').eq('park_id', park.id)
  const restIds = (allRests ?? []).map(r => r.id)
  const { data: entrees } = await sb.from('menu_items').select('id, name, category, restaurant_id')
    .in('restaurant_id', restIds).eq('category', 'entree')
  const beverageWords = /\b(wine|beer|ale|lager|cider|cocktail|margarita|sangria|mimosa|bellini|spritz|prosecco|champagne|merlot|chardonnay|cabernet|pinot|moscato|riesling|sauvignon|malbec|zinfandel|rosé|rose|sake|soju|hard seltzer|white claw|corona|budweiser|heineken|angry orchard|michelob|stella artois|modelo|dos equis|blue moon|sierra nevada|lagunitas|fireball|bourbon|whiskey|vodka|rum|tequila|gin|scotch|brandy|port|sherry|vermouth|absinthe|amaretto|kahlua|baileys|jagermeister|campari|aperol|espresso martini|mojito|daiquiri|piña colada|pina colada|mai tai|cosmopolitan|manhattan|old fashioned|negroni|paloma|sidecar|lemonade|iced tea|cold brew|coffee|tea|juice|smoothie|soda|sprite|coke|pepsi|fanta|root beer|ginger ale|tonic|water|milk|hot chocolate|chai)\b/i

  console.log('\n=== AK entrees that look like beverages ===')
  const miscat: any[] = []
  for (const item of entrees ?? []) {
    if (beverageWords.test(item.name) && !item.name.match(/battered|braised|glazed|infused|crusted|rubbed|marinated|brined|reduction|sauce|chicken|pork|beef|fish|shrimp|steak|burger|sandwich|wrap|bowl|plate|platter|salad|soup|pasta|rice|noodle|fries|tots|nachos|wings|ribs|brisket|pulled|smoked|grilled|fried|roasted|baked|seared|pan-seared/i)) {
      miscat.push(item)
      console.log(`  [entree→beverage] ${item.name} (${item.id})`)
    }
  }

  // 6. Check desserts that look like beverages
  const { data: desserts } = await sb.from('menu_items').select('id, name, category, restaurant_id')
    .in('restaurant_id', restIds).eq('category', 'dessert')
  console.log('\n=== AK desserts that look like beverages ===')
  for (const item of desserts ?? []) {
    if (beverageWords.test(item.name) && !item.name.match(/cake|cookie|brownie|sundae|pie|tart|cobbler|crisp|crumble|pudding|mousse|cheesecake|ice cream|gelato|sorbet|popsicle|cupcake|macaron|pastry|donut|doughnut|churro|funnel|float|parfait|whi(p|pped)/i)) {
      console.log(`  [dessert→beverage?] ${item.name} (${item.id})`)
    }
  }

  // 7. Check for meat entrees with very low calories
  console.log('\n=== AK meat entrees — checking for low-cal issues ===')
  const { data: meatItems } = await sb.from('menu_items')
    .select('id, name, category, restaurant_id, nutritional_data(calories, protein, carbs, fat)')
    .in('restaurant_id', restIds)
    .eq('category', 'entree')

  const meatWords = /\b(chicken|beef|pork|steak|ribs|brisket|turkey|lamb|duck|fish|salmon|shrimp|lobster|crab|burger|hot dog|sausage|bacon|ham|meatball|pulled|smoked|grilled|bbq|barbecue)\b/i
  for (const item of meatItems ?? []) {
    const nd = (item as any).nutritional_data?.[0] ?? (item as any).nutritional_data
    if (nd && meatWords.test(item.name) && nd.calories > 0 && nd.calories < 100) {
      console.log(`  LOW CAL: ${item.name} — ${nd.calories} cal, ${nd.protein}g P (${item.id})`)
    }
  }

  // 8. Check starch items with 0 carbs
  console.log('\n=== AK starch items with 0 carbs ===')
  const starchWords = /\b(rice|bread|naan|roll|bun|fries|potato|tots|pretzel|corn|tortilla|wrap|pasta|noodle|waffle|pancake|biscuit|croissant|muffin)\b/i
  const { data: allItems } = await sb.from('menu_items')
    .select('id, name, category, nutritional_data(calories, carbs)')
    .in('restaurant_id', restIds)
  for (const item of allItems ?? []) {
    const nd = (item as any).nutritional_data?.[0] ?? (item as any).nutritional_data
    if (nd && starchWords.test(item.name) && nd.calories > 0 && (nd.carbs === 0 || nd.carbs === null)) {
      console.log(`  0 CARBS: ${item.name} [${item.category}] — ${nd.calories} cal, ${nd.carbs}g C (${item.id})`)
    }
  }
}

main().catch(err => { console.error(err); process.exit(1) })
