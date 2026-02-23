/**
 * Fix Animal Kingdom data quality issues:
 *
 * 1. Rename restaurants with "- All-Day Updated" suffix
 * 2. Standardize Dinoland land name to "DinoLand U.S.A."
 * 3. Fix beverages miscategorized as "entree" → "beverage"
 * 4. Fix Angry Orchard items miscategorized as "dessert" → "beverage"
 *
 * Usage:
 *   npx tsx scripts/fix-ak-issues.ts --dry-run
 *   npx tsx scripts/fix-ak-issues.ts
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Set env vars'); process.exit(1) }
const sb = createClient(url, key)

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  const { data: park } = await sb.from('parks').select('id')
    .ilike('name', '%Animal Kingdom%').single()
  if (!park) { console.error('Park not found'); process.exit(1) }

  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Park: Disney's Animal Kingdom (${park.id})\n`)

  let totalFixes = 0

  // === 1. Rename restaurants ===
  console.log('=== 1. Restaurant Renames ===')
  const renames: [string, string][] = [
    ['Caravan Road - All-Day Updated', 'Caravan Road'],
    ['Isle of Java - All-Day Updated', 'Isle of Java'],
  ]
  for (const [oldName, newName] of renames) {
    const { data: rest } = await sb.from('restaurants').select('id, name')
      .eq('park_id', park.id).eq('name', oldName).single()
    if (rest) {
      console.log(`  RENAME: "${oldName}" → "${newName}"`)
      if (!DRY_RUN) {
        await sb.from('restaurants').update({ name: newName }).eq('id', rest.id)
      }
      totalFixes++
    } else {
      console.log(`  SKIP: "${oldName}" not found`)
    }
  }

  // === 2. Standardize Dinoland land name ===
  console.log('\n=== 2. Dinoland Land Name Standardization ===')
  const { data: dinoRests } = await sb.from('restaurants').select('id, name, land')
    .eq('park_id', park.id).ilike('land', '%Dino%')
  for (const r of dinoRests ?? []) {
    if (r.land !== 'DinoLand U.S.A.') {
      console.log(`  FIX: "${r.name}" land "${r.land}" → "DinoLand U.S.A."`)
      if (!DRY_RUN) {
        await sb.from('restaurants').update({ land: 'DinoLand U.S.A.' }).eq('id', r.id)
      }
      totalFixes++
    }
  }

  // === 3. Fix beverages miscategorized as "entree" ===
  console.log('\n=== 3. Beverages Miscategorized as Entree ===')

  // Get all AK restaurants
  const { data: allRests } = await sb.from('restaurants').select('id').eq('park_id', park.id)
  const restIds = (allRests ?? []).map(r => r.id)

  // Get all entrees
  const { data: entrees } = await sb.from('menu_items').select('id, name, category')
    .in('restaurant_id', restIds).eq('category', 'entree')

  // Beverage detection — match clear beverage names but exclude food items
  const beveragePattern = /\b(wine|beer|ale|lager|cider|cocktail|margarita|sangria|mimosa|bellini|spritz|prosecco|champagne|merlot|chardonnay|cabernet|pinot|moscato|riesling|sauvignon|malbec|zinfandel|rosé|rose|sake|soju|hard seltzer|white claw|corona|budweiser|heineken|angry orchard|michelob|stella artois|modelo|dos equis|blue moon|sierra nevada|lagunitas|fireball|bourbon|whiskey|vodka|rum|tequila|gin|scotch|brandy|port|sherry|vermouth|absinthe|amaretto|kahlua|baileys|jagermeister|campari|aperol|espresso martini|mojito|daiquiri|piña colada|pina colada|mai tai|cosmopolitan|manhattan|old fashioned|negroni|paloma|sidecar|lemonade|iced tea|cold brew|coffee|tea|juice|smoothie|soda|sprite|coke|pepsi|fanta|root beer|ginger ale|tonic|water|milk|hot chocolate|chai|punch)\b/i

  // Exclude items that are clearly food
  const foodExclude = /\b(battered|braised|glazed|infused|crusted|rubbed|marinated|brined|reduction|sauce|chicken|pork|beef|fish|shrimp|steak|burger|sandwich|wrap|bowl|plate|platter|salad|soup|pasta|rice|noodle|fries|tots|nachos|wings|ribs|brisket|pulled|smoked|grilled|fried|roasted|baked|seared|pan-seared|cake|cookie|brownie|bread|muffin|croissant)\b/i

  let beverageFixes = 0
  for (const item of entrees ?? []) {
    if (beveragePattern.test(item.name) && !foodExclude.test(item.name)) {
      console.log(`  FIX: [entree→beverage] ${item.name}`)
      if (!DRY_RUN) {
        await sb.from('menu_items').update({ category: 'beverage' }).eq('id', item.id)
      }
      beverageFixes++
      totalFixes++
    }
  }
  console.log(`  Total: ${beverageFixes} entrees → beverage`)

  // === 4. Fix Angry Orchard items miscategorized as "dessert" ===
  console.log('\n=== 4. Angry Orchard: Dessert → Beverage ===')
  const { data: angryDesserts } = await sb.from('menu_items').select('id, name, category')
    .ilike('name', '%Angry Orchard%').eq('category', 'dessert')
  for (const item of angryDesserts ?? []) {
    console.log(`  FIX: [dessert→beverage] ${item.name}`)
    if (!DRY_RUN) {
      await sb.from('menu_items').update({ category: 'beverage' }).eq('id', item.id)
    }
    totalFixes++
  }

  // Also fix Angry Orchard items that are "entree"
  const { data: angryEntrees } = await sb.from('menu_items').select('id, name, category')
    .ilike('name', '%Angry Orchard%').eq('category', 'entree')
  for (const item of angryEntrees ?? []) {
    console.log(`  FIX: [entree→beverage] ${item.name}`)
    if (!DRY_RUN) {
      await sb.from('menu_items').update({ category: 'beverage' }).eq('id', item.id)
    }
    totalFixes++
  }

  // === 5. Fix other obvious category issues (Honey Bee, Safari Amber as entree) ===
  console.log('\n=== 5. Additional Category Fixes ===')
  const additionalBevNames = [
    'Honey Bee',         // cocktail at Dawa Bar
    'Safari Amber',      // beer at Dawa Bar
    'Old Elephant Foot IPA', // beer
    'Lost on Safari',    // cocktail
    'Ngumu Jungle Juice', // cocktail
    'Tiger Eye Gold Ale', // beer
  ]
  for (const name of additionalBevNames) {
    const { data: items } = await sb.from('menu_items').select('id, name, category')
      .in('restaurant_id', restIds).eq('name', name).neq('category', 'beverage')
    for (const item of items ?? []) {
      console.log(`  FIX: [${item.category}→beverage] ${item.name}`)
      if (!DRY_RUN) {
        await sb.from('menu_items').update({ category: 'beverage' }).eq('id', item.id)
      }
      totalFixes++
    }
  }

  console.log(`\n========== SUMMARY ==========`)
  console.log(`  Total fixes: ${totalFixes}`)
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
}

main().catch(err => { console.error(err); process.exit(1) })
