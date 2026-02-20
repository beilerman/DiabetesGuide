/**
 * Add descriptions for simple/common items that don't need web research
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const envVars: Record<string, string> = {}
envContent.split('\n').forEach(line => {
  const trimmed = line.trim()
  if (trimmed && !trimmed.startsWith('#')) {
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) envVars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
  }
})

const url = envVars['SUPABASE_URL'] || process.env.SUPABASE_URL
const key = envVars['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

// Descriptions for common items (pattern -> description)
const DESCRIPTIONS: [RegExp, string][] = [
  // Fruits & produce
  [/^apple slices?$/i, 'Fresh sliced apples, a healthy snack option.'],
  [/^sliced apples?$/i, 'Fresh sliced apples, a healthy snack option.'],
  [/^apple slices? with caramel$/i, 'Fresh sliced apples served with caramel dipping sauce.'],
  [/^apple pack$/i, 'Pre-packaged fresh apple slices.'],
  [/^applesauce$/i, 'Smooth pureed apples, served chilled.'],
  [/^banana$/i, 'Fresh whole banana.'],
  [/^grapes$/i, 'Fresh seedless grapes.'],
  [/^carrots?$/i, 'Fresh carrot sticks, a healthy snack option.'],
  [/^mixed fruit$/i, 'Assorted fresh seasonal fruits.'],
  [/^whole fruit$/i, 'Selection of fresh whole fruits.'],
  [/^seasonal fruit cup$/i, 'Cup of assorted fresh seasonal fruits.'],
  [/^assorted fruit cups?$/i, 'Pre-packaged cups of mixed fresh fruits.'],
  [/^asparagus$/i, 'Grilled or steamed asparagus spears.'],
  [/^broccoli$/i, 'Steamed broccoli florets.'],
  [/^cauliflower$/i, 'Roasted or steamed cauliflower.'],
  [/^green beans?$/i, 'Seasoned green beans.'],

  // Breakfast items
  [/^scrambled.*eggs?$/i, 'Fluffy scrambled eggs.'],
  [/^eggs? benedict$/i, 'Poached eggs on English muffin with Canadian bacon and hollandaise sauce.'],
  [/^frittata$/i, 'Italian-style baked egg dish with vegetables and cheese.'],
  [/^bacon$/i, 'Crispy strips of smoked bacon.'],
  [/^sausage$/i, 'Breakfast sausage links or patties.'],
  [/^cinnamon buns?$/i, 'Warm cinnamon roll with sweet glaze.'],
  [/^breakfast cereals?$/i, 'Assorted breakfast cereals with milk.'],
  [/^bagel.*cream cheese$/i, 'Fresh bagel served with cream cheese.'],
  [/^bagels?$/i, 'Fresh baked bagels, various flavors available.'],

  // Bakery items
  [/^croissant$/i, 'Buttery, flaky French pastry.'],
  [/^butter croissant$/i, 'Classic buttery, flaky French croissant.'],
  [/^chocolate croissant$/i, 'Flaky croissant filled with rich chocolate.'],
  [/^muffins?$/i, 'Freshly baked muffins, various flavors.'],
  [/^cannoli$/i, 'Italian pastry tube filled with sweet ricotta cream.'],
  [/^cinnamon.*twist$/i, 'Twisted pastry with cinnamon sugar coating.'],

  // Chicken items
  [/chicken nuggets?$/i, 'Crispy breaded chicken nuggets.'],
  [/chicken bites?$/i, 'Bite-sized pieces of crispy fried chicken.'],
  [/chicken skewer$/i, 'Grilled chicken on a skewer.'],

  // Sides
  [/^american slaw$/i, 'Classic American-style coleslaw with creamy dressing.'],
  [/^coleslaw$/i, 'Shredded cabbage and carrots in creamy dressing.'],
  [/^cold bar$/i, 'Selection of cold salads, fruits, and accompaniments.'],
  [/^toppings$/i, 'Assorted toppings for customizing your meal.'],

  // Beverages
  [/^aranciata$/i, 'Italian sparkling orange soda.'],
  [/^bloody mary$/i, 'Classic cocktail with vodka, tomato juice, and spices.'],
  [/^chocolate shake$/i, 'Thick and creamy chocolate milkshake.'],
  [/^topo chico$/i, 'Mexican sparkling mineral water.'],
  [/^monster energy drinks?$/i, 'Energy drink with caffeine and taurine.'],

  // Beer & Wine
  [/^bud light$/i, 'Light American lager beer.'],
  [/^coors light$/i, 'Light American lager beer.'],
  [/^corona( extra)?$/i, 'Mexican pale lager beer.'],
  [/^heineken/i, 'Dutch pale lager beer.'],
  [/^chimay blue$/i, 'Belgian Trappist dark ale with rich, fruity flavor.'],
  [/^belgian fat tire/i, 'Belgian-style amber ale with toasty malt flavor.'],
  [/^harp lager/i, 'Irish pale lager beer.'],
  [/^brewdog punk ipa$/i, 'Scottish craft IPA with tropical hop flavor.'],
  [/wines? by the glass$/i, 'Selection of red, white, and rosé wines available by the glass.'],
  [/wines? by the bottle$/i, 'Selection of red, white, and rosé wines available by the bottle.'],
  [/seasonal draft$/i, 'Rotating selection of seasonal draft beers.'],

  // Desserts & Sweets
  [/^chocolate.?chip cookies?$/i, 'Classic cookies loaded with chocolate chips.'],
  [/^chocolate dipper$/i, 'Chocolate-dipped treat on a stick.'],
  [/^cinnamon.?glazed (nuts|almonds|pecans)$/i, 'Warm roasted nuts with sweet cinnamon glaze.'],
  [/^cookie$/i, 'Freshly baked cookie.'],

  // Ice cream
  [/^ice cream$/i, 'Creamy frozen dessert, various flavors available.'],

  // Kids items
  [/^uncrustable$/i, 'Sealed crustless peanut butter and jelly sandwich.'],
  [/^uncrustables?(\s+pb\s*&?\s*j)?$/i, 'Sealed crustless peanut butter and jelly sandwich.'],
  [/^bug.?shaped graham crackers$/i, 'Fun bug-shaped graham crackers for kids.'],

  // Snacks
  [/^pickle.?in.?a.?pouch$/i, 'Whole dill pickle in a convenient pouch.'],
  [/^fruit.*nut trail mix$/i, 'Mix of dried fruits and assorted nuts.'],
  [/^fruit cheese$/i, 'Cheese paired with dried fruit.'],
  [/^assorted granola bars?$/i, 'Pre-packaged granola bars, various flavors.'],
  [/^assorted candy$/i, 'Selection of candy and sweets.'],

  // Generic beverages (will get ~0 calories anyway)
  [/^assorted.*beverages?$/i, 'Selection of soft drinks and beverages.'],
  [/^assorted bottled beverages?$/i, 'Selection of bottled soft drinks and water.'],
  [/^assorted canned beverages?$/i, 'Selection of canned soft drinks.'],
  [/^assorted frozen beverages?$/i, 'Selection of frozen blended drinks.'],
  [/^bottled beverages?$/i, 'Selection of bottled drinks.'],
  [/^fountain beverages?$/i, 'Coca-Cola fountain drinks.'],
  [/^bottle\/?can$/i, 'Bottled or canned beverages.'],
  [/mini cans$/i, 'Small 7.5oz cans of Coca-Cola beverages.'],
  [/pet bottles$/i, 'Plastic bottles of Coca-Cola beverages.'],
  [/^beverage with souvenir/i, 'Drink served in a collectible souvenir cup or mug.'],

  // Steak items
  [/flat iron.*8oz$/i, '8oz Australian flat iron steak, tender and flavorful.'],
]

async function main() {
  // Read items needing descriptions
  const items = JSON.parse(readFileSync('data/items-needing-descriptions.json', 'utf-8'))

  console.log(`Processing ${items.length} items...`)

  let matched = 0
  let updated = 0
  const unmatched: string[] = []

  for (const item of items) {
    let description: string | null = null

    for (const [pattern, desc] of DESCRIPTIONS) {
      if (pattern.test(item.name)) {
        description = desc
        break
      }
    }

    if (description) {
      matched++
      const { error } = await supabase
        .from('menu_items')
        .update({ description })
        .eq('id', item.menu_item_id)

      if (error) {
        console.error(`Failed to update ${item.name}:`, error)
      } else {
        updated++
      }
    } else {
      unmatched.push(`${item.name} @ ${item.restaurant} (${item.park})`)
    }
  }

  console.log('')
  console.log('=== Description Update Complete ===')
  console.log(`Matched patterns: ${matched}`)
  console.log(`Updated in DB: ${updated}`)
  console.log(`Unmatched: ${unmatched.length}`)

  if (unmatched.length > 0) {
    console.log('')
    console.log('Items still needing descriptions (for web research):')
    unmatched.forEach(n => console.log(`  - ${n}`))
  }
}

main()
