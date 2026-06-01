/**
 * Add descriptions for specialty items based on web research
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

// Descriptions from web research (pattern -> description)
const DESCRIPTIONS: [RegExp, string][] = [
  // Scottish/British
  [/^cranachan$/i, 'Traditional Scottish dessert with whipped cream, honey, fresh raspberries, toasted oatmeal, and a splash of whisky.'],

  // French desserts
  [/^caf[eé] li[eé]gois$/i, 'French cold dessert made with sweetened coffee, coffee-flavored ice cream, and Chantilly cream.'],
  [/entremet$/i, 'French multi-layered mousse-based cake with sponge, cream, and mirror glaze finish.'],
  [/^eclair$/i, 'French pastry filled with cream and topped with chocolate or icing.'],

  // Dubai chocolate trend
  [/dubai.*chocolate.*cannoli/i, 'Cannoli filled with pistachio cream and crispy kataifi (shredded phyllo), drizzled with chocolate.'],

  // Salt & Straw ice cream flavors
  [/arbequina olive oil/i, 'Oregon olive oil ice cream with velvety texture and tropical, grassy notes.'],
  [/almond brittle.*ganache/i, 'Ice cream with crunchy almond brittle swirled with salted chocolate ganache.'],
  [/cinnamon snickerdoodle/i, 'Cinnamon-spiced ice cream with snickerdoodle cookie pieces.'],
  [/sea salt.*caramel/i, 'Ice cream with sea salt and ribbons of house-made caramel.'],
  [/strawberry honey balsamic/i, 'Strawberry ice cream with honey, balsamic vinegar, and black pepper.'],
  [/roasted pineapple coconut/i, 'Roasted pineapple sherbet with toasted coconut.'],
  [/petunia.*rainbow/i, 'Colorful fruity ice cream inspired by Petunia from Moana.'],
  [/sprinkled babycakes/i, 'Vanilla ice cream with colorful sprinkles and cake pieces.'],
  [/^kids scoop$/i, 'Single scoop of ice cream for kids.'],
  [/^single scoop$/i, 'One scoop of your choice of artisan ice cream flavor.'],
  [/^pint$/i, 'Take-home pint of artisan ice cream.'],
  [/^sprinkles$/i, 'Colorful sprinkles topping for ice cream.'],

  // Starbucks specialty drinks
  [/pink drink/i, 'Starbucks Refresher with strawberry acai, coconut milk, and freeze-dried strawberries.'],
  [/dragon drink/i, 'Mango dragonfruit Refresher shaken with coconut milk and diced dragonfruit.'],
  [/violet drink/i, 'Very Berry Hibiscus Refresher with coconut milk, sweet blackberries and tart hibiscus.'],
  [/caramel macchiato/i, 'Espresso with vanilla syrup, steamed milk, and caramel drizzle.'],
  [/flat white/i, 'Ristretto espresso shots with steamed whole milk, creating a velvety microfoam.'],
  [/doubleshot on ice/i, 'Espresso shots shaken with ice and lightly sweetened.'],
  [/caffe misto/i, 'Brewed coffee mixed with steamed milk.'],
  [/skinny vanilla latte/i, 'Espresso with sugar-free vanilla syrup and nonfat milk.'],
  [/pistachio latte/i, 'Espresso with pistachio sauce, steamed milk, and salted pistachio crumbs.'],
  [/iced golden ginger/i, 'Iced drink with ginger, turmeric, and coconut milk.'],
  [/iced pineapple matcha/i, 'Matcha green tea shaken with pineapple and coconut milk.'],

  // Starbucks food items
  [/protein.*box/i, 'Pre-packaged snack box with protein, cheese, and accompaniments.'],
  [/bistro box/i, 'Pre-packaged meal box with balanced portions of protein, cheese, and crackers.'],
  [/spinach.*feta.*wrap/i, 'Cage-free egg whites with spinach, feta, and tomatoes in a whole wheat wrap.'],
  [/egg white.*breakfast wrap/i, 'Egg whites with spinach and vegetables in a whole wheat wrap.'],
  [/chicken.*panini/i, 'Grilled chicken breast with cheese and vegetables on toasted bread.'],
  [/turkey.*panini/i, 'Sliced turkey with pesto and cheese on toasted bread.'],
  [/tomato.*mozzarella.*panini/i, 'Fresh mozzarella with tomato and basil on toasted bread.'],
  [/ham.*swiss.*panini/i, 'Sliced ham with Swiss cheese on toasted bread.'],
  [/artichoke.*flatbread/i, 'Flatbread topped with artichoke hearts and goat cheese.'],
  [/cranberry bliss bar/i, 'Blondie bar with dried cranberries, white chocolate chips, and cream cheese frosting.'],
  [/cherry.*almond biscotti/i, 'Crunchy Italian biscotti with dried cherries and almonds.'],
  [/michigan cherry oat bar/i, 'Oat bar with Michigan dried cherries.'],
  [/graham crackers.*chocolate/i, 'Graham crackers dipped in chocolate.'],
  [/chocolate truffle/i, 'Rich chocolate truffle confection.'],

  // Wetzel's Pretzels
  [/wetzel bitz/i, 'Warm bite-sized pretzel snacks, available in various flavors.'],
  [/wetzel dog/i, '100% all-beef hot dog wrapped in buttery pretzel dough.'],
  [/dog bites/i, 'Mini all-beef hot dogs wrapped in pretzel dough and baked.'],
  [/cheesy dog bites/i, 'Mini all-beef hot dogs in pretzel dough with three-cheese crust.'],
  [/cheese dog/i, 'All-beef hot dog wrapped in pretzel dough with melted cheese.'],
  [/frozen granita/i, 'Italian-style frozen slush beverage.'],

  // Erin McKenna's Bakery (vegan, gluten-free)
  [/bakery sink/i, 'Assortment of vegan gluten-free baked goods.'],
  [/dessert cups?/i, 'Individual vegan gluten-free dessert portions.'],
  [/half dipped cookies?/i, 'Vegan gluten-free cookie half-dipped in chocolate.'],
  [/thin mints?/i, 'Vegan gluten-free chocolate-mint cookie.'],
  [/veggie bomb/i, 'Savory vegan gluten-free muffin with vegetables.'],
  [/pineapple upside down/i, 'Vegan gluten-free pineapple upside down cake.'],

  // Gideon's Bakehouse
  [/frosting cup/i, 'Cup of rich, creamy frosting for dipping cookies.'],
  [/krispy.*chocolate chip/i, 'Crispy rice treat with chocolate chips.'],
  [/cookies and cream krispy/i, 'Crispy rice treat with Oreo cookie pieces.'],

  // Disney specialty items
  [/kakamora coconut/i, 'Moana-inspired coconut treat with tropical flavors.'],
  [/chocolate twist/i, 'Twisted pastry with chocolate filling.'],
  [/tiger tail.*twist/i, 'Orange and chocolate swirled pastry twist.'],
  [/hand dipped mickey bar/i, 'Mickey-shaped ice cream bar dipped in chocolate.'],
  [/lime.*frosted coconut bar/i, 'Coconut bar topped with lime frosting.'],

  // Italian items
  [/aranciata/i, 'Italian sparkling orange soda by San Pellegrino.'],
  [/limonata/i, 'Italian sparkling lemon soda by San Pellegrino.'],
  [/belini|bellini/i, 'Italian cocktail with prosecco and peach purée.'],
  [/prosecco/i, 'Italian sparkling wine.'],
  [/tiramisu/i, 'Italian dessert with layers of espresso-soaked ladyfingers and mascarpone cream.'],
  [/tiramisu push pop/i, 'Tiramisu dessert served in a push-up pop container.'],
  [/meringue/i, 'Light, airy confection made from whipped egg whites and sugar.'],
  [/cannoli$/i, 'Italian pastry tube filled with sweet ricotta cream.'],

  // Steaks
  [/flat iron.*8.*oz/i, '8oz flat iron steak, tender and well-marbled.'],
  [/filet.*10.*oz/i, '10oz filet mignon, the most tender cut.'],
  [/ny strip.*14.*oz/i, '14oz New York strip steak with bold beef flavor.'],
  [/cowgirl.*ribeye.*16.*oz/i, '16oz bone-in ribeye with rich marbling.'],
  [/dry.?aged porterhouse.*28/i, '28oz dry-aged porterhouse for two with intense beefy flavor.'],
  [/dry.?aged tomahawk.*34/i, '34oz dry-aged tomahawk ribeye with dramatic bone presentation.'],
  [/ribeye filet.*10/i, '10oz ribeye filet, well-marbled and flavorful.'],
  [/ribeye spinalis.*8/i, '8oz ribeye cap (spinalis), the most flavorful part of the ribeye.'],
  [/japanese a5 (filet|strip)/i, 'Premium Japanese A5 Wagyu beef, the highest grade of marbling.'],

  // Alcohol/drinks
  [/j[aä]germeister/i, 'German herbal liqueur with 56 herbs and spices.'],
  [/bottomless (bloody mary|mimosa)/i, 'Unlimited refills of the classic brunch cocktail.'],
  [/strawberry freeze/i, 'Frozen blended strawberry drink.'],
  [/blue raspberry.*slushy/i, 'Frozen blue raspberry flavored slush drink.'],
  [/frozen peach bellini/i, 'Frozen blended peach Bellini cocktail.'],
  [/mango.*fruit bar/i, 'Frozen mango fruit bar on a stick.'],
  [/strawberry fruit bar/i, 'Frozen strawberry fruit bar on a stick.'],
  [/outshine.*fruit bar/i, 'Outshine brand frozen fruit bar.'],

  // Beer
  [/chimay blue/i, 'Belgian Trappist dark ale with rich, fruity flavor, 9% ABV.'],
  [/fat tire/i, 'New Belgium amber ale with toasty malt and balanced hops.'],
  [/funky buddha.*hefeweizen/i, 'Florida craft wheat beer with banana and clove notes.'],
  [/schofferhofer.*grapefruit/i, 'German wheat beer mixed with grapefruit juice.'],
  [/safari amber/i, 'African-style amber ale brewed for Disney.'],
  [/unibroue.*fin du monde/i, 'Belgian-style tripel from Quebec with fruity, spicy notes, 9% ABV.'],
  [/golden monkey/i, 'Victory Brewing Belgian-style tripel, fruity and spicy.'],
  [/longboard/i, 'Kona Brewing lager, light and refreshing Hawaiian beer.'],
  [/sierra nevada pale ale/i, 'Classic American pale ale with citrus and pine hop character.'],
  [/goose island/i, 'Chicago craft beer, various styles available.'],
  [/crooked can/i, 'Florida craft beer from Crooked Can Brewing.'],
  [/orange blossom pilsner/i, 'Light pilsner with subtle orange blossom honey notes.'],
  [/magners pear cider/i, 'Irish pear cider, crisp and refreshing.'],
  [/peroni/i, 'Italian lager, crisp and refreshing.'],
  [/estrella galicia/i, 'Spanish lager from Galicia.'],

  // Wine
  [/chenin blanc/i, 'White wine with honey, apple, and floral notes.'],
  [/chardonnay/i, 'Full-bodied white wine with buttery, oaky notes.'],
  [/sauvignon blanc/i, 'Crisp white wine with citrus and herbal notes.'],
  [/pinot noir/i, 'Light-bodied red wine with cherry and earthy notes.'],
  [/cabernet sauvignon/i, 'Full-bodied red wine with dark fruit and firm tannins.'],
  [/shiraz|syrah/i, 'Bold red wine with dark fruit and spice notes.'],
  [/pinotage/i, 'South African red wine, smoky with plum flavors.'],
  [/rosé|rose\s*n\.?v/i, 'Pink wine with fresh strawberry and citrus notes.'],
  [/tawny.*port/i, 'Portuguese fortified wine aged in wood, nutty and caramel flavors.'],

  // Misc food items
  [/corned beef hash/i, 'Chopped corned beef with diced potatoes, pan-fried until crispy.'],
  [/biscuit.*gravy/i, 'Warm buttermilk biscuit topped with sausage gravy.'],
  [/smashed avocado toast/i, 'Toasted bread topped with seasoned mashed avocado.'],
  [/buffalo chicken egg roll/i, 'Crispy egg roll filled with spicy buffalo chicken.'],
  [/fried cheese.*marinara/i, 'Crispy fried cheese served with marinara dipping sauce.'],
  [/penne.*butter/i, 'Penne pasta tossed with butter sauce.'],
  [/spaghetti.*meatballs/i, 'Spaghetti with house-made meatballs in tomato sauce.'],
  [/grilled cheese$/i, 'Classic grilled cheese sandwich with melted cheese on toasted bread.'],
  [/corned beef hash/i, 'Chopped corned beef pan-fried with potatoes.'],
  [/grit cakes?/i, 'Pan-fried cakes made from creamy Southern grits.'],
  [/hash brown bites/i, 'Crispy bite-sized hash brown potato pieces.'],
  [/potato barrels/i, 'Barrel-shaped fried potato bites.'],
  [/potato wedges/i, 'Thick-cut seasoned potato wedges.'],
  [/breakfast tots/i, 'Crispy tater tots served with breakfast.'],
  [/crushed.*peas/i, 'Mashed garden peas, British-style.'],
  [/cornbread/i, 'Traditional Southern-style sweet cornbread.'],
  [/buttermilk biscuits?/i, 'Flaky Southern-style buttermilk biscuits.'],
  [/impossible.*meatballs/i, 'Plant-based meatballs made with Impossible meat.'],
  [/plant.?based nuggets/i, 'Crispy breaded plant-based chicken-style nuggets.'],
  [/grilled.*teriyaki chicken/i, 'Chicken glazed with sweet teriyaki sauce.'],
  [/grilled breast of chicken/i, 'Seasoned grilled chicken breast.'],
  [/grilled seasonal fish/i, 'Fresh fish of the day, simply grilled.'],
  [/sustainable fish/i, 'Sustainably sourced fish prepared daily.'],
  [/guava braised short rib/i, 'Slow-braised beef short rib with tropical guava glaze.'],
  [/sauteed zucchini/i, 'Fresh zucchini sautéed with garlic and herbs.'],
  [/omelet station/i, 'Made-to-order omelets with your choice of fillings.'],
  [/three.?cheese scramble/i, 'Fluffy scrambled eggs with three melted cheeses.'],

  // Snacks and treats
  [/gogurt/i, 'Portable yogurt in a squeezable tube.'],
  [/carrot.*celery.*dipper/i, 'Fresh carrot and celery sticks for dipping.'],
  [/clementines?/i, 'Fresh seedless clementine oranges.'],
  [/strawberries$/i, 'Fresh whole strawberries.'],
  [/hard boiled eggs?/i, 'Pre-cooked peeled hard-boiled eggs.'],
  [/fruit cluster/i, 'Snack clusters made with dried fruit.'],
  [/fruit cup$/i, 'Cup of fresh mixed seasonal fruits.'],
  [/fruit snack/i, 'Fruit-flavored gummy snacks.'],
  [/fruit punch/i, 'Sweet tropical fruit punch beverage.'],
  [/pineapple cup/i, 'Fresh pineapple chunks in a cup.'],
  [/dipped strawberry/i, 'Fresh strawberry dipped in chocolate.'],
  [/melted cheese.*dipping/i, 'Warm melted cheese sauce for dipping.'],
  [/extra shot/i, 'Additional espresso shot for your beverage.'],

  // Coca-Cola items
  [/mexican bottle/i, 'Coca-Cola made with cane sugar in a glass bottle, imported from Mexico.'],
  [/polar bear.*tumbler/i, 'Collectible Coca-Cola polar bear souvenir cup.'],
  [/full throttle/i, 'Full Throttle energy drink.'],
  [/nos$/i, 'NOS energy drink.'],
  [/simply juices/i, 'Simply brand fruit juices.'],
  [/caramel chocolate fizz/i, 'Coca-Cola blended with chocolate and caramel flavors.'],
  [/twilight spritz/i, 'Specialty sparkling beverage from Coca-Cola.'],

  // Generic patterns
  [/seasonal (mocktail|cocktail)/i, 'Rotating specialty drink featuring seasonal flavors.'],
  [/seasonal side/i, 'Chef\'s choice of seasonal vegetable or starch.'],
  [/seasonal fruit$/i, 'Fresh seasonal fruit selection.'],
  [/seasonal draft$/i, 'Rotating selection of draft beers.'],
  [/craft.*canned beers?/i, 'Selection of craft beers in cans.'],
  [/bottled sodas?/i, 'Selection of bottled soft drinks.'],
  [/sodas$/i, 'Fountain soft drinks.'],
  [/frozen beverages?/i, 'Frozen blended drinks.'],
  [/frozen orangeade/i, 'Frozen blended orange drink.'],
  [/assorted artisanal cookies/i, 'Selection of house-made cookies.'],
  [/^cookies$/i, 'Freshly baked cookies.'],
  [/juice box/i, 'Individual juice box for kids.'],
  [/two eggs/i, 'Two eggs cooked to order.'],
  [/^yogurt$/i, 'Creamy yogurt cup.'],
  [/^toast$/i, 'Toasted bread with butter.'],
  [/^pickle$/i, 'Whole dill pickle.'],
  [/pineapple$/i, 'Fresh pineapple chunks.'],
  [/^orange$/i, 'Fresh whole orange.'],

  // Coffee specialties
  [/savannah banana latte/i, 'Latte with banana and caramel flavors, African-inspired.'],
  [/shakin.*jamaican/i, 'Jamaican-inspired iced coffee drink.'],
  [/signature frozen lemon/i, 'Frozen lemonade blended with coffee.'],
  [/vanilla latte/i, 'Espresso with vanilla syrup and steamed milk.'],
  [/vanilla shake/i, 'Classic vanilla milkshake.'],
  [/^latte$/i, 'Espresso with steamed milk.'],

  // More beer brands
  [/bud light/i, 'Light American lager beer from Anheuser-Busch.'],
  [/coors light/i, 'Light American lager beer from Coors.'],
  [/michelob ultra/i, 'Ultra-light American lager, low calorie and low carb.'],
  [/yuengling/i, 'America\'s oldest brewery, amber lager from Pennsylvania.'],
  [/sam adams/i, 'Samuel Adams craft beer from Boston.'],
  [/knob creek/i, 'Premium Kentucky straight bourbon whiskey.'],
  [/jam jar sweet/i, 'South African sweet wine with fruity notes.'],
  [/placido (chianti|pinot grigio)/i, 'Italian wine, smooth and approachable.'],
  [/rosa regale/i, 'Italian sparkling red wine with berry notes.'],
  [/veuve clicquot/i, 'Premium French Champagne.'],
  [/earl grey/i, 'Black tea flavored with bergamot oil.'],

  // More food items
  [/mango peach refresher/i, 'Refreshing drink with mango and peach flavors.'],
  [/strawberry shortcake verrine/i, 'Layered strawberry shortcake dessert in a glass.'],
  [/midnight cookies.*cream/i, 'Häagen-Dazs dark chocolate ice cream with Oreo pieces.'],
  [/applewood bacon/i, 'Thick-cut bacon smoked with applewood.'],
  [/italian.*ham.*salami/i, 'Italian cured meats with spicy salami.'],
  [/sliced apples?$/i, 'Fresh sliced apples.'],
  [/grilled teriyaki/i, 'Grilled with sweet teriyaki glaze.'],
  [/mango.*fruit bar/i, 'Frozen mango fruit bar on a stick.'],
  [/outshine/i, 'Outshine brand frozen fruit bar.'],
  [/trail mix/i, 'Mix of nuts, dried fruits, and sometimes chocolate.'],
  [/^grapes$/i, 'Fresh seedless grapes.'],
  [/polar bear.*24.*oz/i, 'Large collectible Coca-Cola polar bear souvenir cup.'],
  [/^ecl[ai]ir$/i, 'French pastry filled with cream and topped with chocolate glaze.'],
  [/be mine ecl[ai]ir/i, 'Valentine-themed chocolate eclair with romantic decoration.'],
  [/lovely selection.*desserts/i, 'Display of house-made cakes and desserts.'],

  // Final batch - remaining items
  [/bug.?shaped graham/i, 'Fun bug-shaped graham crackers for kids.'],
  [/chocolate twist/i, 'Twisted pastry with chocolate filling.'],
  [/^mimosa$/i, 'Classic brunch cocktail with champagne and orange juice.'],
  [/sailfish (seasonal|white marlin)/i, 'Florida craft beer from Sailfish Brewing Company.'],
  [/tiger eye.*ale/i, 'African-style golden ale brewed for Disney.'],
  [/^uncrustables?/i, 'Sealed crustless peanut butter and jelly sandwich.'],
  [/uncrustables pb/i, 'Sealed crustless peanut butter and jelly sandwich.'],
  [/applewood bac[ko]n/i, 'Thick-cut bacon smoked with applewood.'],
  [/^cookies$/i, 'Freshly baked cookies.'],
  [/^grapes$/i, 'Fresh seedless grapes.'],
  [/^sliced apples?$/i, 'Fresh sliced apples.'],
  [/j.?dubs.*porter/i, 'Florida craft porter from JDub\'s Brewing Company.'],
  [/novelty straw/i, 'Collectible novelty drinking straw.'],
  [/assorted.*bottled.*beverages?/i, 'Selection of bottled soft drinks and water.'],
  [/valentine.*ecl[aio]+r/i, 'Valentine-themed chocolate eclair with romantic decoration.'],
  [/applewood backon/i, 'Thick-cut bacon smoked with applewood.'],
  [/^sierra nevada$/i, 'California craft beer, various styles available.'],

  // Unique items
  [/poncho adult/i, 'Disposable rain poncho for adults.'],
  [/buzz lightyear cone/i, 'Ice cream cone themed after Buzz Lightyear from Toy Story.'],
  [/blush.*bloom refresher/i, 'Pink-hued refreshing beverage with floral notes.'],
  [/binny.*brew/i, 'House specialty craft beer.'],
  [/malibu kiwi strawberry/i, 'Frozen drink with Malibu rum, kiwi, and strawberry.'],
  [/rum island breeze/i, 'Tropical rum cocktail with fruit juices.'],
  [/mangonada/i, 'Mexican frozen mango drink with chamoy and chili.'],
  [/japanese old fashioned/i, 'Old Fashioned cocktail made with Japanese whisky.'],
  [/jock.*brews/i, 'Specialty craft beers at Jock Lindsey\'s Hangar Bar.'],
  [/white claw/i, 'White Claw hard seltzer, low calorie alcoholic sparkling water.'],
  [/strawberry.*prosecco/i, 'Prosecco topped with strawberry purée.'],
  [/violet sake/i, 'Japanese sake with subtle floral notes.'],

  // More food items
  [/chicken breast nuggets/i, 'Crispy breaded all-white-meat chicken nuggets.'],
  [/chicken skewers?/i, 'Grilled chicken pieces on skewers.'],
  [/chicken wrap/i, 'Grilled chicken wrapped in a flour tortilla.'],
  [/turkey.*mozzarella wrap/i, 'Sliced turkey with fresh mozzarella in a wrap.'],
  [/smoked turkey/i, 'Slow-smoked sliced turkey breast.'],
  [/smoked pork slider/i, 'Mini sandwich with slow-smoked pulled pork.'],
  [/mini chicken sub/i, 'Small submarine sandwich with chicken.'],
  [/hamburger$/i, 'Classic beef hamburger on a bun.'],
  [/grilled country ham/i, 'Thick-sliced country ham, grilled.'],
  [/goofy.*salmon/i, 'Disney\'s playful presentation of grilled salmon.'],
  [/fruit and cheese/i, 'Fresh fruit paired with assorted cheeses.'],
  [/cheese and fruit/i, 'Assorted cheeses paired with fresh fruit.'],

  // Toppings and extras
  [/topping.*crab.*oscar/i, 'Steak topped with lump crab meat, asparagus, and béarnaise.'],
  [/topping.*peppercorn/i, 'Crushed peppercorn crust for steak.'],
  [/^toppings$/i, 'Selection of additional toppings.'],
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
  console.log('=== Researched Description Update Complete ===')
  console.log(`Matched patterns: ${matched}`)
  console.log(`Updated in DB: ${updated}`)
  console.log(`Still unmatched: ${unmatched.length}`)

  if (unmatched.length > 0 && unmatched.length <= 100) {
    console.log('')
    console.log('Items still needing descriptions:')
    unmatched.forEach(n => console.log(`  - ${n}`))
  } else if (unmatched.length > 100) {
    console.log('')
    console.log('Sample unmatched items:')
    unmatched.slice(0, 50).forEach(n => console.log(`  - ${n}`))
    console.log(`  ... and ${unmatched.length - 50} more`)
  }
}

main()
