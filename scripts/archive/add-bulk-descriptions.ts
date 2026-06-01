/**
 * Add descriptions for items without descriptions
 * Uses pattern matching for common items
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
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

const url = envVars['SUPABASE_URL'] || process.env.SUPABASE_URL!
const key = envVars['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, key)

// Descriptions for common items (pattern -> description)
const DESCRIPTIONS: [RegExp, string][] = [
  // Add-on modifiers
  [/^add\s+avocado/i, 'Fresh avocado added to your order.'],
  [/^add\s+cheese\s*sauce/i, 'Warm cheese sauce added to your order.'],
  [/^add\s+boba/i, 'Chewy tapioca boba pearls added to your drink.'],
  [/^add\s+bacon/i, 'Crispy bacon strips added to your order.'],
  [/^add\s+egg/i, 'Fresh egg added to your order.'],
  [/^add\s+banger/i, 'Traditional British pork sausage added to your order.'],
  [/^add\s+(waffle\s*)?cone/i, 'Crispy waffle cone for your ice cream.'],
  [/^add\s+dipped\s*cone/i, 'Chocolate-dipped waffle cone for your ice cream.'],
  [/^add\s+prosciutto/i, 'Thinly sliced Italian cured ham added to your order.'],
  [/^add\s+almond\s*(vanilla)?\s*milk/i, 'Non-dairy almond milk substitute.'],
  [/^add\s+oat\s*milk/i, 'Non-dairy oat milk substitute.'],
  [/^add\s+soy\s*milk/i, 'Non-dairy soy milk substitute.'],
  [/^add\s+whipped?\s*cream/i, 'Fresh whipped cream topping.'],
  [/^add\s+shot/i, 'Extra espresso shot added to your drink.'],
  [/^add\s+syrup/i, 'Flavored syrup added to your drink.'],
  [/^add\s+protein/i, 'Extra protein added to your order.'],
  [/^add\s+chicken/i, 'Grilled or fried chicken added to your order.'],
  [/^add\s+shrimp/i, 'Seasoned shrimp added to your order.'],

  // Ice cream servings
  [/^1\s*scoop/i, 'Single scoop of artisan ice cream or gelato.'],
  [/^2\s*scoops?/i, 'Double scoop of artisan ice cream or gelato.'],
  [/^3\s*scoops?/i, 'Triple scoop of artisan ice cream or gelato.'],
  [/single\s*scoop/i, 'Single scoop of artisan ice cream or gelato.'],
  [/double\s*scoop/i, 'Double scoop of artisan ice cream or gelato.'],

  // Milk
  [/^2%\s*milk$/i, 'Reduced fat 2% milk.'],
  [/^whole\s*milk$/i, 'Whole milk.'],
  [/^skim\s*milk$/i, 'Fat-free skim milk.'],
  [/^chocolate\s*milk$/i, 'Rich chocolate-flavored milk.'],
  [/^oat\s*milk$/i, 'Creamy oat-based dairy alternative.'],
  [/^almond\s*milk$/i, 'Almond-based dairy alternative.'],

  // Juices
  [/pog.*juice|juice.*pog/i, 'Tropical blend of passion fruit, orange, and guava juices.'],
  [/^apple\s*juice/i, 'Fresh apple juice.'],
  [/^orange\s*juice/i, 'Fresh-squeezed orange juice.'],
  [/^cranberry\s*juice/i, 'Tart cranberry juice.'],
  [/^pineapple\s*juice/i, 'Sweet pineapple juice.'],
  [/^grapefruit\s*juice/i, 'Fresh grapefruit juice.'],
  [/^tomato\s*juice/i, 'Savory tomato juice.'],

  // Lemonade
  [/^(all[- ]?natural\s+)?lemonade$/i, 'Fresh-squeezed lemonade.'],
  [/strawberry\s*lemonade/i, 'Fresh lemonade with strawberry flavor.'],
  [/raspberry\s*lemonade/i, 'Fresh lemonade with raspberry flavor.'],
  [/frozen\s*lemonade/i, 'Frozen blended lemonade slush.'],

  // Hot dogs
  [/^all[- ]?beef\s*hot\s*dog$/i, 'Classic all-beef hot dog on a toasted bun.'],
  [/^hot\s*dog$/i, 'Classic hot dog on a toasted bun.'],
  [/^corn\s*dog$/i, 'Hot dog coated in cornmeal batter and deep-fried.'],
  [/footlong/i, 'Extra-long footlong hot dog on a toasted bun.'],

  // Popcorn
  [/popcorn\s*bucket/i, 'Large bucket of freshly popped popcorn in a collectible container.'],
  [/^(garlic\s+)?popcorn$/i, 'Freshly popped buttery popcorn.'],
  [/garlic\s*popcorn/i, 'Freshly popped popcorn with garlic seasoning.'],
  [/caramel\s*popcorn/i, 'Sweet caramel-coated popcorn.'],
  [/kettle\s*corn/i, 'Sweet and salty kettle-cooked popcorn.'],

  // Churros
  [/peppermint\s*churro/i, 'Crispy churro with peppermint sugar coating.'],
  [/almond\s*joy\s*churro/i, 'Churro topped with chocolate, coconut, and almonds.'],
  [/cinnamon\s*sugar\s*churro/i, 'Classic churro coated in cinnamon sugar.'],
  [/^churro$/i, 'Crispy fried dough coated in cinnamon sugar.'],
  [/churro\s*bites?/i, 'Bite-sized churros coated in cinnamon sugar.'],
  [/chocolate\s*churro/i, 'Churro with chocolate drizzle or chocolate-flavored coating.'],

  // Donuts
  [/^donut$/i, 'Freshly made donut.'],
  [/iced\s*donut/i, 'Donut with sweet icing glaze.'],
  [/glazed\s*donut/i, 'Classic glazed donut.'],
  [/raspberry.*donut/i, 'Donut with raspberry icing or filling.'],
  [/chocolate.*donut/i, 'Chocolate-covered or chocolate-flavored donut.'],
  [/bomboloni/i, 'Italian cream-filled donut.'],

  // Glass servings
  [/^\d+\s*oz\s*glass$/i, 'Beverage served in a glass.'],

  // Beer terms
  [/beer\s*flight/i, 'Sampler of multiple craft beers.'],
  [/cider\s*flight/i, 'Sampler of multiple hard ciders.'],
  [/wine\s*flight/i, 'Sampler of multiple wines.'],
  [/^assorted\s*beer/i, 'Selection of draft and bottled beers.'],
  [/hard\s*cider/i, 'Alcoholic cider made from fermented apples.'],
  [/blood\s*orange.*cider/i, 'Hard cider with blood orange flavor.'],
  [/craft\s*beer/i, 'Selection of craft beers.'],
  [/draft\s*beer/i, 'Beer served fresh from the tap.'],
  [/^(domestic|import)\s*beer/i, 'Selection of domestic or imported beers.'],

  // Festival/seasonal items - generate description from name
  [/festival.*cookie|cookie.*festival/i, 'Festival-exclusive decorated cookie.'],
  [/festival.*bread|bread.*festival/i, 'Freshly baked artisan bread, festival-exclusive.'],

  // Parfaits
  [/açai\s*parfait|acai\s*parfait/i, 'Layered açai bowl with granola and fresh fruit.'],
  [/yogurt\s*parfait/i, 'Layered yogurt with granola and fresh fruit.'],
  [/fruit\s*parfait/i, 'Layered fresh fruit with yogurt or cream.'],

  // Fries
  [/^air\s*fries?$/i, 'Crispy air-fried potato fries.'],
  [/^(french\s*)?fries$/i, 'Classic golden french fries.'],
  [/^sweet\s*potato\s*fries$/i, 'Crispy sweet potato fries.'],
  [/^waffle\s*fries$/i, 'Crispy waffle-cut potato fries.'],
  [/^curly\s*fries$/i, 'Seasoned spiral-cut curly fries.'],
  [/^loaded\s*fries/i, 'French fries topped with cheese, bacon, and other toppings.'],
  [/chili\s*cheese\s*fries/i, 'French fries topped with chili and melted cheese.'],

  // Rice & beans
  [/^(basmati\s*)?rice$/i, 'Steamed rice.'],
  [/^basmati\s*rice$/i, 'Aromatic long-grain basmati rice.'],
  [/^black\s*beans?$/i, 'Seasoned black beans.'],
  [/^baked\s*beans?$/i, 'Sweet and savory slow-cooked baked beans.'],
  [/^refried\s*beans?$/i, 'Traditional Mexican refried beans.'],
  [/^pinto\s*beans?$/i, 'Seasoned pinto beans.'],
  [/caribbean\s*rice/i, 'Rice cooked with Caribbean spices and coconut.'],
  [/chicken\s*fried\s*rice/i, 'Wok-fried rice with chicken and vegetables.'],
  [/fried\s*rice/i, 'Wok-fried rice with vegetables.'],

  // Pasta salad / side salads
  [/pasta\s*salad/i, 'Chilled pasta salad with vegetables and dressing.'],
  [/bbq\s*pasta\s*salad/i, 'Pasta salad with BBQ-flavored dressing.'],
  [/coleslaw/i, 'Shredded cabbage and carrots in creamy dressing.'],
  [/^side\s*salad$/i, 'Fresh mixed green salad.'],
  [/^caesar\s*salad$/i, 'Romaine lettuce with Caesar dressing, croutons, and parmesan.'],
  [/^house\s*salad$/i, 'Fresh mixed greens with house dressing.'],

  // Dips
  [/cheese.*dip|dip.*cheese/i, 'Warm cheese dip for dipping.'],
  [/bacon.*dip|dip.*bacon/i, 'Creamy dip with bacon bits.'],
  [/pimento.*dip/i, 'Southern-style pimento cheese dip.'],
  [/queso/i, 'Warm Mexican cheese dip.'],
  [/guacamole/i, 'Fresh mashed avocado dip with lime and cilantro.'],
  [/salsa/i, 'Fresh tomato-based dipping sauce.'],
  [/hummus/i, 'Creamy chickpea dip with olive oil and spices.'],

  // Turkey leg
  [/turkey\s*leg/i, 'Jumbo smoked turkey leg, a theme park classic.'],

  // Pretzels
  [/mickey\s*(mouse\s*)?pretzel/i, 'Soft pretzel in the shape of Mickey Mouse.'],
  [/^pretzel$/i, 'Warm soft pretzel with salt.'],
  [/pretzel.*cheese/i, 'Warm soft pretzel served with cheese dipping sauce.'],
  [/pepper\s*jack\s*pretzel/i, 'Soft pretzel with spicy pepper jack cheese.'],
  [/cinnamon\s*sugar\s*pretzel/i, 'Sweet pretzel coated in cinnamon sugar.'],

  // Cookies
  [/chocolate\s*chip\s*cookie/i, 'Classic cookie loaded with chocolate chips.'],
  [/jumbo.*cookie/i, 'Extra-large freshly baked cookie.'],
  [/^cookie$/i, 'Freshly baked cookie.'],
  [/cookies?\s*&\s*cream/i, 'Cookies and cream flavored treat.'],
  [/sugar\s*cookie/i, 'Classic sugar cookie with frosting.'],

  // Cakes
  [/andes\s*mint/i, 'Dessert featuring Andes mint chocolate.'],
  [/king\s*cake/i, 'Traditional Mardi Gras cake with cinnamon and icing.'],
  [/waffle\s*sundae/i, 'Warm waffle topped with ice cream and toppings.'],

  // Pork rinds
  [/pork\s*rinds?/i, 'Crispy fried pork skin snack.'],

  // Generic items
  [/^breakfast$/i, 'Breakfast plate with assorted morning items.'],
  [/^lunch$/i, 'Lunch plate.'],
  [/^dinner$/i, 'Dinner plate.'],
  [/^kids?\s*meal$/i, 'Kid-sized meal portion.'],
  [/^combo$/i, 'Combination meal with entree and sides.'],

  // Seasonal/event items - extract from name
  [/^20\d{2}\s+(holiday|festival|mardi\s*gras|valentine|christmas|easter|halloween|fall|spring|summer|winter|national)/i, 'Limited-time seasonal offering.'],
  [/^50th\s*anniversary/i, 'Limited-time 50th anniversary offering.'],

  // Water
  [/bottled\s*water/i, 'Bottled still water.'],
  [/niagara.*water/i, 'Niagara brand bottled water.'],
  [/^smartwater$/i, 'Vapor distilled water with electrolytes.'],
  [/^vitaminwater$/i, 'Flavored water with vitamins.'],
  [/sparkling\s*water/i, 'Carbonated sparkling water.'],

  // Coffee drinks
  [/^americano$/i, 'Espresso with hot water.'],
  [/^cappuccino$/i, 'Espresso with steamed milk foam.'],
  [/^latte$/i, 'Espresso with steamed milk.'],
  [/^mocha$/i, 'Espresso with chocolate and steamed milk.'],
  [/white\s*chocolate\s*mocha/i, 'Espresso with white chocolate and steamed milk.'],
  [/cold\s*brew/i, 'Smooth cold-brewed coffee.'],
  [/iced\s*coffee/i, 'Chilled coffee served over ice.'],
  [/peanut\s*butter.*coffee/i, 'Coffee with peanut butter flavoring.'],
  [/african\s*coffee/i, 'African coffee blend with cream liqueur.'],
  [/bailey.*coffee/i, 'Irish coffee with Baileys cream liqueur.'],

  // Tea
  [/^tea$/i, 'Hot brewed tea.'],
  [/^iced\s*tea$/i, 'Chilled tea served over ice.'],
  [/hot\s*tea/i, 'Hot brewed tea.'],
  [/chai\s*tea\s*latte/i, 'Spiced chai tea with steamed milk.'],
  [/matcha.*latte/i, 'Green tea matcha with steamed milk.'],
  [/peach.*tea/i, 'Tea with sweet peach flavor.'],
  [/twinings?.*tea/i, 'Premium Twinings tea.'],
  [/english\s*breakfast\s*tea/i, 'Classic English breakfast black tea.'],
  [/irish.*tea/i, 'Irish black tea.'],
  [/herbal\s*tea/i, 'Caffeine-free herbal tea.'],

  // Cider
  [/angry\s*orchard/i, 'Angry Orchard hard apple cider.'],

  // Apple items
  [/apple\s*chips/i, 'Crispy dried apple chips.'],
  [/apple\s*fritter/i, 'Deep-fried apple pastry with cinnamon glaze.'],
  [/apple\s*pie/i, 'Classic apple pie with cinnamon-spiced filling.'],
  [/apple\s*slices?\s*(with|&)\s*caramel/i, 'Fresh apple slices with caramel dipping sauce.'],
  [/apple.*cookie/i, 'Cookie with apple and oat flavoring.'],
  [/apple\s*butter/i, 'Sweet spread made from slow-cooked apples.'],

  // Asparagus
  [/^asparagus$/i, 'Grilled or steamed asparagus spears.'],

  // Assorted items
  [/^assorted\s*chips$/i, 'Selection of potato chips.'],
  [/^assorted\s*candy$/i, 'Selection of candy and sweets.'],
  [/^assorted\s*desserts?$/i, 'Selection of desserts.'],
  [/^assorted\s*pastries?$/i, 'Selection of fresh pastries.'],
  [/^assorted\s*muffins?$/i, 'Selection of freshly baked muffins.'],
  [/^assorted.*fountain\s*beverages?$/i, 'Coca-Cola fountain drinks.'],
  [/^assorted.*granola\s*bars?$/i, 'Selection of granola bars.'],
  [/^assorted.*ice\s*cream/i, 'Selection of ice cream bars.'],
  [/^assorted.*jello$/i, 'Selection of Jello cups.'],

  // Bacon
  [/^bacon$/i, 'Crispy strips of smoked bacon.'],
  [/applewood.*bacon/i, 'Thick-cut applewood smoked bacon.'],
  [/bacon[- ]wrapped/i, 'Item wrapped in crispy bacon.'],

  // Mac & Cheese
  [/mac\s*(&|and|'?n'?)\s*cheese/i, 'Creamy macaroni and cheese.'],
  [/baked\s*mac/i, 'Baked macaroni and cheese with golden crust.'],
  [/truffle\s*mac/i, 'Macaroni and cheese with truffle oil.'],
  [/white\s*cheddar\s*mac/i, 'Macaroni with white cheddar cheese sauce.'],

  // Banana items
  [/banana\s*nut\s*bread/i, 'Moist banana bread with walnuts.'],
  [/banana\s*pudding/i, 'Southern-style banana pudding with vanilla wafers.'],
  [/banana\s*split/i, 'Classic ice cream sundae with banana, toppings, and whipped cream.'],
  [/banana.*loaf/i, 'Fresh-baked banana bread loaf.'],

  // Beer brands
  [/^beer$/i, 'Draft or bottled beer.'],
  [/bottled\s*beer/i, 'Selection of bottled beers.'],
  [/bud\s*light/i, 'Light American lager beer.'],
  [/blue\s*moon/i, 'Belgian-style wheat ale with orange.'],
  [/yuengling/i, 'Yuengling Traditional Lager, Americas oldest brewery.'],
  [/terrapin/i, 'Terrapin craft beer.'],
  [/brewdog/i, 'BrewDog Scottish craft beer.'],
  [/tsingtao/i, 'Chinese lager beer.'],
  [/tiger.*lager/i, 'Tiger Asian lager beer.'],
  [/zero\s*alcohol\s*beer/i, 'Non-alcoholic beer.'],

  // Brownies
  [/^brownie$/i, 'Rich chocolate brownie.'],
  [/brownie\s*bites?/i, 'Bite-sized chocolate brownies.'],
  [/brownie.*chocolate/i, 'Decadent double chocolate brownie.'],
  [/brownie.*mint/i, 'Chocolate brownie with mint flavor.'],
  [/brownie.*raspberry/i, 'Chocolate brownie with raspberry.'],
  [/brownie.*walnut/i, 'Chocolate brownie with walnuts.'],
  [/blondie/i, 'Vanilla-flavored brownie (blonde brownie).'],
  [/brookie/i, 'Brownie and cookie combination.'],

  // Breakfast items
  [/breakfast\s*sandwich/i, 'Breakfast sandwich with egg and meat on bread.'],
  [/breakfast\s*pastry/i, 'Fresh breakfast pastry.'],
  [/breakfast\s*potatoes?/i, 'Seasoned breakfast potatoes.'],
  [/^oatmeal$/i, 'Hot oatmeal.'],
  [/whole\s*grain\s*oatmeal/i, 'Hearty whole grain oatmeal.'],

  // Broccoli
  [/^broccoli$/i, 'Steamed broccoli florets.'],
  [/broccoli\s*salad/i, 'Fresh broccoli salad with dressing.'],

  // Breadsticks
  [/breadsticks?/i, 'Warm breadsticks with dipping sauce.'],

  // Chips
  [/^chips$/i, 'Crispy potato chips.'],
  [/baked.*chips/i, 'Baked potato chips.'],
  [/sunchips/i, 'SunChips whole grain snacks.'],

  // Crepes
  [/^crepe$/i, 'Thin French pancake with filling.'],
  [/sugar\s*crepe/i, 'Sweet crepe with sugar.'],
  [/ice\s*cream\s*crepe/i, 'Crepe filled with ice cream.'],
  [/chocolate\s*crepe/i, 'Crepe with chocolate filling.'],

  // Cupcakes
  [/cupcake/i, 'Decorated cupcake with frosting.'],

  // Dates
  [/bacon.*dates?|dates?.*bacon/i, 'Sweet dates wrapped in crispy bacon.'],

  // Gelato
  [/gelato\s*shake/i, 'Thick shake made with Italian gelato.'],
  [/gelato/i, 'Italian-style ice cream.'],

  // Milkshakes
  [/milkshake/i, 'Thick creamy milkshake.'],
  [/chocolate\s*shake/i, 'Rich chocolate milkshake.'],
  [/vanilla\s*shake/i, 'Classic vanilla milkshake.'],
  [/strawberry\s*shake/i, 'Fresh strawberry milkshake.'],

  // Onion rings
  [/onion\s*rings?/i, 'Crispy battered onion rings.'],

  // Fish and chips
  [/fish\s*(and|&|'?n'?)\s*chips/i, 'Beer-battered fish with fries.'],

  // Plantains
  [/plantains?/i, 'Sweet fried plantains.'],

  // Potatoes
  [/mashed\s*potatoes?/i, 'Creamy mashed potatoes.'],
  [/tater\s*tots?/i, 'Crispy tater tots.'],
  [/yuca\s*fries|yucca\s*fries/i, 'Crispy fried yuca (cassava) fries.'],
  [/sweet\s*potato\s*casserole/i, 'Sweet potato casserole with brown sugar topping.'],

  // Sausage
  [/^sausage$/i, 'Grilled sausage.'],
  [/italian\s*sausage/i, 'Seasoned Italian sausage.'],
  [/blood\s*sausage/i, 'Traditional blood sausage.'],

  // Soup
  [/tomato\s*soup/i, 'Warm tomato soup.'],
  [/grilled\s*cheese/i, 'Toasted sandwich with melted cheese.'],

  // Tiramisu
  [/tiramisu/i, 'Italian coffee-flavored layered dessert.'],

  // Tequila
  [/tequila\s*flight/i, 'Sampler of multiple tequilas.'],
  [/tequila\s*anejo/i, 'Aged tequila with smooth oak flavor.'],
  [/tequila\s*blanco/i, 'Clear unaged tequila.'],
  [/tequila\s*reposado/i, 'Rested tequila with light oak notes.'],
  [/bacanora/i, 'Traditional Mexican agave spirit from Sonora.'],

  // Udon
  [/udon/i, 'Thick Japanese wheat noodles in broth.'],

  // Vegetables
  [/^vegetables?$/i, 'Assorted steamed vegetables.'],
  [/vegetable\s*medley/i, 'Mix of seasonal vegetables.'],
  [/vegetable\s*platter/i, 'Fresh vegetable platter.'],
  [/veggie\s*pizza/i, 'Pizza topped with assorted vegetables.'],

  // Waffle
  [/waffle\s*cone/i, 'Crispy waffle cone for ice cream.'],
  [/waffle\s*boat/i, 'Waffle shaped like a boat filled with toppings.'],

  // Whoopie pie
  [/whoopie\s*pie/i, 'Two soft cookies with cream filling.'],

  // Wine
  [/^wine$/i, 'Glass of wine.'],
  [/white\s*wine/i, 'White wine by the glass.'],
  [/red\s*wine/i, 'Red wine by the glass.'],
  [/pinot\s*noir/i, 'Red Pinot Noir wine.'],
  [/sake/i, 'Japanese rice wine.'],
  [/sangria/i, 'Wine punch with fruit.'],

  // Fruit items
  [/tropical\s*fruit/i, 'Assorted tropical fruits.'],
  [/fruit\s*salad/i, 'Fresh mixed fruit salad.'],
  [/whole\s*fruit/i, 'Fresh whole fruit.'],
  [/watermelon/i, 'Fresh watermelon.'],
  [/mango/i, 'Fresh mango or mango-flavored item.'],

  // Rum
  [/rum.*coke|bacardi/i, 'Rum and Coca-Cola cocktail.'],

  // Sundaes
  [/sundae/i, 'Ice cream sundae with toppings.'],

  // Zeppole
  [/zeppole/i, 'Italian fried dough pastry.'],

  // Pina colada
  [/pina\s*colada/i, 'Tropical coconut and pineapple drink.'],
  [/virgin.*colada/i, 'Non-alcoholic coconut and pineapple drink.'],

  // Boba
  [/boba/i, 'Drink with chewy tapioca pearls.'],

  // Agua fresca
  [/agua\s*fresca/i, 'Light Mexican fruit water.'],

  // Truly
  [/truly.*seltzer|truly.*sparkling/i, 'Truly hard seltzer.'],

  // Powerade
  [/powerade/i, 'Powerade sports drink.'],

  // Soda
  [/bottled\s*soda/i, 'Bottled soft drink.'],
  [/coca[- ]?cola/i, 'Coca-Cola beverages.'],

  // Whisky
  [/whisky|whiskey/i, 'Premium whisky.'],
  [/yamazaki/i, 'Japanese single malt whisky.'],

  // Straws
  [/twisty\s*straw/i, 'Collectible twisty straw.'],

  // Teriyaki
  [/teriyaki/i, 'Grilled with sweet teriyaki sauce.'],

  // Burgers
  [/^burger$/i, 'Classic burger.'],
  [/smash\s*burger/i, 'Thin-patty smashed burger.'],
  [/brunch\s*burger/i, 'Burger with breakfast toppings.'],

  // Galette
  [/galette/i, 'French savory buckwheat crepe.'],

  // Vegan items
  [/^vegan\s+/i, 'Plant-based vegan option.'],

  // Pizza
  [/^pizza$/i, 'Fresh-baked pizza.'],
  [/pizza\s*slice/i, 'Slice of fresh-baked pizza.'],

  // Rice
  [/^white\s*rice$/i, 'Steamed white rice.'],

  // Chicken
  [/chicken\s*strips?/i, 'Crispy breaded chicken strips.'],
  [/ancho.*chicken|chipotle.*chicken/i, 'Chicken with ancho chile or chipotle seasoning.'],

  // Cookies
  [/birthday\s*cake\s*cookie/i, 'Cookie with birthday cake flavor and sprinkles.'],
  [/triple\s*chocolate\s*cookie/i, 'Cookie with three types of chocolate.'],

  // Tartes
  [/tarte\s*au\s*citron/i, 'French lemon tart.'],

  // Shrimp
  [/tarpit\s*shrimp/i, 'Specialty shrimp appetizer.'],

  // More breakfast sandwiches
  [/bacon.*egg.*gouda|gouda.*egg.*bacon/i, 'Breakfast sandwich with bacon, egg, and gouda cheese.'],
  [/egg.*cheese.*sandwich/i, 'Breakfast sandwich with egg and cheese.'],

  // Beans
  [/beans?\s*with\s*burnt\s*ends/i, 'Baked beans with smoked burnt ends.'],
  [/cheddar.*grits/i, 'Creamy grits with cheddar cheese.'],
  [/beer\s*grits/i, 'Grits cooked with beer for added flavor.'],

  // Caribbean
  [/bammy/i, 'Traditional Jamaican flatbread made from cassava.'],
  [/coco\s*bread/i, 'Sweet Jamaican coconut bread.'],

  // Beer/cider combo
  [/beer\s*(and|&)\s*ciders?/i, 'Selection of beers and ciders.'],

  // Belgian chocolate
  [/belgian\s*chocolate/i, 'Premium Belgian chocolate.'],

  // Vodka
  [/vodka\s*soda/i, 'Vodka with sparkling soda water.'],

  // Muffins
  [/blueberry\s*muffin/i, 'Fresh-baked blueberry muffin.'],
  [/^muffin$/i, 'Freshly baked muffin.'],

  // Brownie variants
  [/brownie\s*special/i, 'Special brownie creation.'],
  [/gooey\s*brownie/i, 'Rich, fudgy gooey brownie.'],
  [/cheetah\s*brownie/i, 'Cheetah-themed decorated brownie.'],

  // Burgers
  [/burger.*cheeseburger|cheeseburger.*burger/i, 'Choice of burger or cheeseburger.'],
  [/^cheeseburger$/i, 'Classic burger with melted cheese.'],
  [/cheeseburger\s*sliders?/i, 'Mini cheeseburgers.'],

  // Butterbeer (Harry Potter)
  [/butterbeer/i, 'Wizarding World signature butterscotch cream soda.'],

  // Butterfly cookie
  [/butterfly\s*cookie/i, 'Decorated butterfly-shaped cookie.'],

  // Bubble waffle
  [/bubble\s*waffle/i, 'Hong Kong-style egg waffle with toppings.'],

  // Liqueurs
  [/bärenjäger|honey.*bourbon/i, 'Honey bourbon liqueur.'],

  // Potatoes
  [/cacio\s*e\s*pepe\s*potatoes/i, 'Potatoes with Italian cheese and pepper sauce.'],

  // Coffee drinks (more specific)
  [/cafe\s*(americana|americano)/i, 'Espresso with hot water.'],
  [/cafe\s*femenino/i, 'Fair-trade coffee from women-owned farms.'],
  [/cafe\s*latte|caffe\s*latte/i, 'Espresso with steamed milk.'],
  [/caffe\s*mocha/i, 'Espresso with chocolate and steamed milk.'],
  [/caffe\s*americano/i, 'Espresso with hot water.'],
  [/cappuccino\s*dream/i, 'Specialty cappuccino drink.'],
  [/caramel\s*macchiato/i, 'Espresso with vanilla, milk, and caramel drizzle.'],
  [/chai\s*latte/i, 'Spiced chai tea with steamed milk.'],
  [/decaf\s*coffee/i, 'Decaffeinated brewed coffee.'],
  [/coffee\s*of\s*the\s*day/i, 'Daily featured coffee blend.'],

  // Caramel items
  [/^caramel$/i, 'Rich caramel topping or flavor.'],
  [/caramel.*ice\s*cream/i, 'Ice cream with caramel flavor.'],
  [/caramel.*bread\s*pudding/i, 'Bread pudding with caramel sauce.'],

  // Champagne/wine
  [/champagne/i, 'French sparkling wine.'],
  [/cabernet\s*sauvignon/i, 'Red Cabernet Sauvignon wine.'],
  [/chianti/i, 'Italian Chianti red wine.'],

  // Petit cakes
  [/petit\s*cake|petite\s*cake/i, 'Small decorated celebration cake.'],

  // Soup
  [/cheddar.*soup|bacon.*soup/i, 'Creamy cheddar or bacon soup.'],
  [/clam\s*chowder/i, 'Creamy New England clam chowder.'],
  [/corn\s*chowder/i, 'Creamy corn chowder soup.'],
  [/chicken\s*noodle\s*soup/i, 'Classic chicken noodle soup.'],

  // Cheese items
  [/cheese\s*danish/i, 'Flaky pastry with sweet cheese filling.'],
  [/cheese\s*garlic\s*bread/i, 'Garlic bread topped with melted cheese.'],
  [/cheese\s*pizza/i, 'Classic pizza with mozzarella cheese.'],
  [/cheese\s*sauce/i, 'Warm melted cheese sauce.'],
  [/cheesy\s*bread/i, 'Bread baked with melted cheese.'],
  [/pepperoni\s*pizza/i, 'Pizza topped with pepperoni.'],

  // Chicken items
  [/chicken\s*fingers?/i, 'Crispy breaded chicken tenders.'],
  [/chicken\s*tenders?/i, 'Crispy breaded chicken tenders.'],
  [/chicken.*sausage/i, 'Chicken sausage.'],
  [/chicken\s*quesadilla/i, 'Grilled tortilla with chicken and cheese.'],
  [/chicken\s*salad\s*sandwich/i, 'Sandwich with creamy chicken salad.'],
  [/chicken.*panini/i, 'Grilled panini with chicken.'],
  [/chicken.*sandwich/i, 'Sandwich with chicken.'],
  [/chicken.*skewers?/i, 'Grilled chicken on skewers.'],
  [/chicken.*flatbread/i, 'Flatbread topped with chicken.'],
  [/pot\s*stickers?/i, 'Pan-fried Asian dumplings.'],

  // Chocolate items
  [/chocolate\s*cake/i, 'Rich chocolate layer cake.'],
  [/chocolate\s*chunk\s*cookie/i, 'Cookie with chocolate chunks.'],
  [/chocolate\s*croissant/i, 'Flaky croissant with chocolate filling.'],
  [/chocolate\s*dipper/i, 'Chocolate-dipped treat.'],
  [/chocolate.*mousse/i, 'Light and airy chocolate mousse.'],
  [/chocolate.*peanut\s*butter/i, 'Chocolate and peanut butter treat.'],
  [/chocolate\s*potted\s*cream/i, 'Rich chocolate cream dessert.'],
  [/chocolate\s*pudding/i, 'Creamy chocolate pudding.'],
  [/chocolate.*brioche/i, 'Brioche bread with chocolate swirl.'],
  [/chocolate.*walnut/i, 'Chocolate treat with walnuts.'],

  // Churro variants
  [/churro.*chocolate\s*sauce|churro.*combo/i, 'Churro served with chocolate dipping sauce.'],
  [/churro\s*dog/i, 'Churro shaped like a hot dog.'],

  // Cinnamon items
  [/cinnamon\s*coffee\s*cake/i, 'Coffee cake with cinnamon streusel.'],
  [/cinnamon\s*roll/i, 'Warm cinnamon roll with icing.'],
  [/colossal.*cinnamon\s*roll/i, 'Extra-large cinnamon roll.'],
  [/cinnamon\s*twist/i, 'Twisted pastry with cinnamon sugar.'],
  [/cinnamon[- ]glazed\s*nuts/i, 'Warm roasted nuts with cinnamon glaze.'],

  // Cocktails
  [/cocktail\s*flight/i, 'Sampler of multiple cocktails.'],
  [/^cocktails?$/i, 'Selection of mixed drinks.'],
  [/cocktails?\s*on\s*tap/i, 'Draft cocktail from tap.'],
  [/frozen\s*margarita/i, 'Frozen blended margarita.'],
  [/margarita/i, 'Classic tequila lime cocktail.'],

  // Cookies
  [/coco\s*moco.*cookie/i, 'Chocolate coconut cookie.'],
  [/cocoapizzie\s*cookie/i, 'Specialty chocolate cookie.'],
  [/cookie\s*pieces/i, 'Broken cookie pieces for topping.'],
  [/cookies?\s*and\s*cream/i, 'Cookies and cream flavored treat.'],
  [/dipped\s*cookie/i, 'Cookie dipped in chocolate.'],

  // Corn
  [/^corn$/i, 'Sweet corn.'],
  [/corn\s*on\s*the\s*cob/i, 'Whole ear of buttered corn.'],
  [/maque\s*choux/i, 'Cajun creamed corn with peppers.'],
  [/cornbread/i, 'Southern-style sweet cornbread.'],

  // Cotton candy
  [/cotton\s*candy/i, 'Spun sugar cotton candy.'],

  // Cracker Jack
  [/cracker\s*jack/i, 'Caramel-coated popcorn with peanuts.'],

  // Croissant variants
  [/butter\s*croissant/i, 'Classic buttery French croissant.'],
  [/^croissant$/i, 'Buttery, flaky French pastry.'],
  [/croissant\s*doughnut|cronut/i, 'Croissant-doughnut hybrid pastry.'],
  [/croiss-oh-la-la/i, 'Special croissant creation.'],

  // Cup (serving size)
  [/^cup\s*$/i, 'Cup serving size.'],
  [/^cone\s*$/i, 'Cone serving size.'],

  // Curry
  [/curry\s*sauce/i, 'Flavorful curry sauce.'],

  // Mandarin
  [/cuties?\s*mandarin/i, 'Sweet mandarin orange.'],

  // Japanese drinks
  [/daiginjo/i, 'Premium Japanese sake.'],

  // Donut variants
  [/thin\s*mint.*donut|donut.*thin\s*mint/i, 'Donut with thin mint chocolate flavor.'],

  // Corona
  [/^corona$/i, 'Mexican Corona lager beer.'],
  [/corona\s*extra/i, 'Corona Extra Mexican lager.'],
  [/corona\s*light/i, 'Light Corona Mexican lager.'],

  // Coors
  [/^coors\s*light$/i, 'Light American lager beer.'],

  // IPA
  [/coppertail\s*ipa/i, 'Coppertail craft IPA.'],
  [/\bipa\b/i, 'India Pale Ale craft beer.'],

  // Water
  [/courtesy.*water/i, 'Complimentary cup of water.'],
  [/coconut\s*water/i, 'Natural coconut water.'],

  // Smoothie
  [/smoothie/i, 'Blended fruit smoothie.'],

  // Ice pop
  [/ice\s*pop/i, 'Frozen fruit ice pop.'],

  // Float
  [/coke\s*float/i, 'Coca-Cola with vanilla ice cream.'],
  [/root\s*beer\s*float/i, 'Root beer with vanilla ice cream.'],
  [/^float$/i, 'Soda with ice cream.'],

  // Chopped salad
  [/chopped\s*salad/i, 'Fresh chopped vegetable salad.'],

  // Pickle
  [/kosher.*pickle|dill\s*pickle/i, 'Large kosher dill pickle.'],

  // Soy milk
  [/soy\s*milk/i, 'Soy-based dairy alternative.'],

  // Hot chocolate
  [/hot\s*chocolate/i, 'Rich hot chocolate drink.'],

  // Coffee + hot chocolate combo
  [/coffee.*hot\s*chocolate|hot\s*chocolate.*coffee/i, 'Hot beverage - coffee or hot chocolate.'],

  // Lager
  [/casa\s*lager/i, 'Casa brand Mexican lager.'],

  // More bacon sandwiches
  [/bacon.*gouda.*sandwich|gouda.*bacon.*sandwich/i, 'Breakfast sandwich with bacon, gouda, and egg.'],
  [/double.*smoked\s*bacon.*sandwich/i, 'Breakfast sandwich with double-smoked bacon.'],
  [/bacon.*cheddar.*egg/i, 'Breakfast sandwich with bacon, cheddar, and egg.'],

  // More beans
  [/^black\s*beans$/i, 'Seasoned black beans.'],

  // Pastries
  [/breakfast\s*pastries?/i, 'Selection of fresh breakfast pastries.'],

  // More chicken
  [/chicken.*shrimp\s*combo/i, 'Combination plate with chicken and shrimp.'],

  // More chips
  [/^chips$/i, 'Potato chips.'],
  [/doritos/i, 'Doritos tortilla chips.'],
  [/cheetos/i, 'Cheetos cheese snacks.'],
  [/flamin.*hot/i, 'Flamin Hot spiced snack.'],

  // More chocolate
  [/chocolate\s*brownie/i, 'Rich chocolate brownie.'],
  [/chocolate\s*milk/i, 'Cold chocolate milk.'],
  [/chocolate\s*moose/i, 'Chocolate dessert treat.'],
  [/chocolate\s*chip\s*cookies?/i, 'Cookies with chocolate chips.'],
  [/double\s*chocolate/i, 'Extra chocolatey treat.'],
  [/chocolate\s*cloud\s*cookie/i, 'Light and airy chocolate cookie.'],

  // Coffee
  [/^coffee$/i, 'Hot brewed coffee.'],
  [/coffee\s*cake/i, 'Cinnamon-streusel coffee cake.'],
  [/coffee\s*chip/i, 'Coffee-flavored ice cream with chips.'],
  [/fresh.*brewed\s*coffee/i, 'Freshly brewed hot coffee.'],
  [/joffrey.*coffee/i, 'Joffreys specialty coffee.'],

  // Donuts
  [/^donuts?$/i, 'Fresh doughnuts.'],
  [/doughnut.*glazed/i, 'Classic glazed doughnut.'],
  [/old[- ]fashioned.*doughnut/i, 'Traditional old-fashioned doughnut.'],
  [/snickers.*donut/i, 'Donut topped with Snickers candy.'],

  // Espresso
  [/^espresso$/i, 'Single espresso shot.'],
  [/double\s*espresso/i, 'Double espresso shot.'],
  [/espresso\s*con\s*panna/i, 'Espresso with whipped cream.'],
  [/espresso\s*macchiato/i, 'Espresso marked with foam.'],
  [/espresso\s*shake/i, 'Espresso-flavored milkshake.'],
  [/espresso\s*shot/i, 'Single shot of espresso.'],
  [/espresso.*brulee/i, 'Espresso crème brûlée dessert.'],

  // More fries
  [/crinkle\s*cut\s*fries/i, 'Crinkle-cut french fries.'],
  [/^fries$/i, 'Golden french fries.'],
  [/^french\s*fries$/i, 'Classic golden french fries.'],
  [/fries.*pulled\s*pork/i, 'French fries topped with pulled pork and cheese.'],

  // French toast
  [/french\s*toast/i, 'Classic French toast with syrup.'],

  // Fresh items
  [/^fresh\s*fruit$/i, 'Fresh seasonal fruit.'],
  [/fresh\s*fruit\s*cup/i, 'Cup of fresh seasonal fruit.'],
  [/^fresh\s*corn$/i, 'Fresh sweet corn.'],

  // Tea
  [/brewed.*tea/i, 'Freshly brewed tea.'],
  [/sweet\s*tea/i, 'Southern-style sweet tea.'],
  [/unsweetened\s*tea/i, 'Unsweetened iced tea.'],
  [/iced\s*tea/i, 'Chilled iced tea.'],
  [/earl\s*grey/i, 'Earl Grey black tea with bergamot.'],

  // Dulce de leche
  [/dulce\s*de\s*leche/i, 'Sweet caramelized milk (dulce de leche).'],
  [/^dulce$/i, 'Sweet dulce de leche flavor.'],

  // English items
  [/english\s*bacon/i, 'British-style back bacon.'],
  [/english\s*muffin/i, 'Toasted English muffin.'],

  // Entrees
  [/^entrees?$/i, 'Main dish selection.'],

  // Evian
  [/evian/i, 'Evian natural spring water.'],

  // Frosting
  [/frosting\s*cup/i, 'Extra frosting for decorating.'],

  // Festival items
  [/festival.*donut/i, 'Festival-exclusive decorated donut.'],

  // Fairlife
  [/fairlife/i, 'Fairlife ultra-filtered milk product.'],

  // Soup
  [/featured\s*soup/i, 'Daily featured soup selection.'],

  // Port wine
  [/port$/i, 'Portuguese port wine.'],
  [/tawny.*port/i, 'Aged tawny port wine.'],

  // Filet
  [/filet\s*\d+\s*oz/i, 'Tender beef filet steak.'],

  // Strongbow
  [/strongbow/i, 'Strongbow hard cider.'],
  [/fire.*strongbow/i, 'Fireball whiskey with Strongbow cider.'],

  // Asparagus
  [/grilled\s*asparagus/i, 'Fire-grilled asparagus spears.'],

  // Foster's
  [/fosters?/i, 'Fosters Australian lager.'],

  // Fountain drinks
  [/fountain\s*(drinks?|beverages?)/i, 'Coca-Cola fountain soft drinks.'],

  // Cookies
  [/frankenstein\s*cookie/i, 'Frankenstein-themed decorated cookie.'],
  [/mint\s*chocolate\s*chip/i, 'Mint chocolate chip flavored treat.'],

  // Wines
  [/french\s*wines?/i, 'Selection of French wines.'],

  // Frozen drinks
  [/^frozen\s*drinks?$/i, 'Selection of frozen blended drinks.'],
  [/frozen.*slushy/i, 'Frozen slush drink.'],
  [/frozen.*mocha/i, 'Frozen blended mocha coffee drink.'],
  [/kona\s*mocha/i, 'Hawaiian Kona coffee mocha.'],
  [/hibiscus.*lemonade/i, 'Refreshing hibiscus lemonade.'],

  // Fried shrimp
  [/fried\s*shrimp/i, 'Crispy fried shrimp.'],

  // Ice cream flavors
  [/double\s*fold\s*vanilla/i, 'Rich double-fold vanilla ice cream.'],

  // Elote
  [/elote|street\s*corn/i, 'Mexican street corn with mayo and cotija.'],

  // Draft beer
  [/^draft$/i, 'Draft beer selection.'],

  // Mousse
  [/mocha\s*mousse/i, 'Light and airy coffee chocolate mousse.'],
  [/chocolate\s*mousse/i, 'Light and airy chocolate mousse.'],

  // Chocolate chip cookies
  [/chocolate[- ]chip\s*cookies?/i, 'Classic cookies with chocolate chips.'],

  // Frozen drinks
  [/frozen\s*orange/i, 'Frozen orange slush drink.'],
  [/frozen\s*(sour\s*)?green\s*apple/i, 'Frozen sour green apple slush.'],
  [/frozen.*lemonade/i, 'Frozen lemonade slush.'],

  // Fruit
  [/^fruit$/i, 'Fresh seasonal fruit.'],
  [/^fruit\s*bowl$/i, 'Bowl of fresh seasonal fruit.'],
  [/^fruit\s*cup$/i, 'Cup of fresh seasonal fruit.'],
  [/fruit.*cheese/i, 'Fresh fruit paired with cheese.'],
  [/fruit.*nut.*mix|trail\s*mix/i, 'Mix of dried fruit and nuts.'],
  [/^mixed\s*fruit/i, 'Assorted fresh fruit.'],

  // Sorbet
  [/sorbet/i, 'Refreshing fruit sorbet.'],
  [/lemon\s*sorbet/i, 'Tart lemon sorbet.'],

  // Cereal donuts
  [/fruit\s*loops?\s*donut/i, 'Donut topped with Froot Loops cereal.'],
  [/fruity\s*pebbles\s*donut/i, 'Donut topped with Fruity Pebbles cereal.'],

  // Cookie variants
  [/fudge.*cookie/i, 'Rich fudge chocolate cookie.'],
  [/ginger\s*snap/i, 'Crispy ginger snap cookie.'],
  [/m\s*&\s*m\s*cookie/i, 'Cookie with M&M candies.'],
  [/oatmeal.*cookie|scotchie/i, 'Oatmeal butterscotch cookie.'],
  [/peanut\s*butter.*cookie/i, 'Peanut butter cookie.'],
  [/lemon\s*cookie/i, 'Tart lemon-flavored cookie.'],
  [/pink\s*lady\s*cookie/i, 'Pink-frosted decorated cookie.'],
  [/red\s*velvet\s*cookie/i, 'Red velvet flavored cookie.'],

  // Funnel cake
  [/funnel\s*cake/i, 'Classic fried funnel cake with toppings.'],

  // Fuze tea
  [/fuze\s*tea/i, 'Fuze iced tea.'],

  // Salads
  [/garden\s*salad/i, 'Fresh garden salad with mixed greens.'],
  [/greek\s*salad/i, 'Mediterranean salad with feta and olives.'],
  [/caesar\s*salad/i, 'Romaine with Caesar dressing and croutons.'],
  [/mixed\s*green\s*salad/i, 'Fresh mixed green salad.'],
  [/chopped\s*salad/i, 'Chopped vegetable salad.'],
  [/side\s*salad/i, 'Side portion of fresh salad.'],
  [/tangy.*salad/i, 'Tangy dressed salad.'],

  // Vegetables
  [/garden\s*vegetables/i, 'Fresh garden vegetables with dipping sauce.'],
  [/green\s*beans?(\s*(&|and)\s*carrots?)?/i, 'Seasoned green beans.'],
  [/steamed\s*vegetables?/i, 'Steamed seasonal vegetables.'],
  [/steamed\s*carrots?/i, 'Steamed carrots.'],
  [/seasonal\s*vegetables?/i, 'Seasonal vegetable medley.'],
  [/market\s*vegetables?/i, 'Fresh market vegetables.'],
  [/roasted.*potatoes?/i, 'Roasted seasoned potatoes.'],
  [/herb.*potatoes?/i, 'Herb-seasoned roasted potatoes.'],
  [/skillet\s*potatoes?/i, 'Pan-fried skillet potatoes.'],
  [/potato\s*casserole/i, 'Creamy potato casserole.'],
  [/potato\s*salad/i, 'Creamy potato salad.'],
  [/potato\s*tots?/i, 'Crispy potato tots.'],
  [/^potatoes?$/i, 'Prepared potatoes.'],
  [/sweet\s*potatoes?/i, 'Roasted sweet potatoes.'],
  [/home\s*fries/i, 'Pan-fried breakfast potatoes.'],
  [/parmesan.*fries/i, 'French fries with parmesan cheese.'],
  [/truffle.*fries/i, 'French fries with truffle oil.'],
  [/steak\s*fries/i, 'Thick-cut steak fries.'],
  [/seasoned.*fries/i, 'Seasoned french fries.'],
  [/loaded.*fries/i, 'French fries with loaded toppings.'],
  [/side.*fries/i, 'Side portion of french fries.'],

  // Garlic bread
  [/garlic\s*bread/i, 'Toasted garlic bread.'],
  [/garlic\s*knots?/i, 'Garlic-butter bread knots.'],

  // Harry Potter
  [/gillywater/i, 'Wizarding World bottled water.'],
  [/pumpkin\s*juice/i, 'Wizarding World spiced pumpkin juice.'],

  // Greek items
  [/greek.*puffs?|honey\s*puffs?/i, 'Greek honey puff pastries (loukoumades).'],
  [/greek\s*yogurt/i, 'Creamy Greek yogurt.'],

  // Grapes
  [/^grapes$/i, 'Fresh seedless grapes.'],

  // Green eggs and ham
  [/green\s*eggs.*ham/i, 'Dr. Seuss-themed dessert.'],

  // Green tea
  [/green\s*tea/i, 'Traditional green tea.'],
  [/matcha/i, 'Japanese matcha green tea.'],

  // Grilled items
  [/grilled\s*chicken/i, 'Grilled chicken breast.'],
  [/grilled\s*steak/i, 'Grilled beef steak.'],
  [/grilled\s*sirloin/i, 'Grilled sirloin steak.'],
  [/grilled\s*shrimp/i, 'Grilled seasoned shrimp.'],
  [/grilled\s*beef/i, 'Grilled beef steak.'],

  // Ham sandwiches
  [/ham.*cheese\s*croissant|ham.*swiss\s*croissant/i, 'Croissant with ham and cheese.'],
  [/ham.*swiss\s*sandwich/i, 'Sandwich with ham and swiss cheese.'],
  [/ham.*egg.*croissant/i, 'Croissant with ham, egg, and cheese.'],

  // Harp
  [/harp\s*lager/i, 'Harp Irish lager.'],

  // Hazelnut
  [/hazelnut.*spread|nutella/i, 'Crepe with hazelnut chocolate spread.'],

  // Heineken
  [/heineken/i, 'Heineken Dutch lager.'],

  // High Noon
  [/high\s*noon/i, 'High Noon hard seltzer.'],

  // Whipped cream
  [/whipped\s*cream/i, 'Fresh whipped cream.'],

  // Honey items
  [/honey.*lager/i, 'Honey-infused lager beer.'],
  [/honey.*ice\s*cream/i, 'Honey-flavored ice cream.'],
  [/honey.*croissant/i, 'Croissant with honey glaze.'],
  [/pistachio.*croissant/i, 'Croissant with pistachio filling.'],
  [/pistachio\s*frappuccino/i, 'Pistachio-flavored blended coffee.'],
  [/pistachio\s*macaron/i, 'French macaron with pistachio flavor.'],

  // Hot beverages
  [/hot\s*beverages?/i, 'Selection of hot drinks.'],
  [/hot\s*cocoa/i, 'Rich hot cocoa.'],
  [/hot\s*coffee/i, 'Hot brewed coffee.'],
  [/hot\s*fudge/i, 'Warm chocolate fudge sauce.'],

  // Hot dog variants
  [/hot\s*dog.*chips/i, 'Hot dog served with chips.'],

  // House items
  [/house\s*rice/i, 'House-style seasoned rice.'],
  [/house[- ]?made.*chips/i, 'House-made potato chips.'],

  // ICEE
  [/icee/i, 'Frozen ICEE slush drink.'],

  // Ice cream
  [/^ice\s*cream$/i, 'Creamy ice cream.'],
  [/ice\s*cream\s*cookie\s*sandwich/i, 'Ice cream between two cookies.'],
  [/ice\s*cream\s*cup/i, 'Cup of ice cream.'],
  [/ice\s*cream\s*(cup\s*or\s*)?cone/i, 'Ice cream in cup or cone.'],
  [/ice\s*cream\s*float/i, 'Soda with ice cream.'],
  [/ice\s*cream\s*sandwich/i, 'Ice cream sandwich.'],
  [/ice\s*cream\s*bar/i, 'Ice cream bar on a stick.'],
  [/kiddie\s*cup/i, 'Kids-size ice cream.'],
  [/soft\s*serve/i, 'Soft-serve ice cream.'],

  // Shaken espresso
  [/shaken\s*espresso/i, 'Iced shaken espresso drink.'],
  [/oatmilk.*espresso/i, 'Espresso with oat milk.'],
  [/almondmilk.*espresso/i, 'Espresso with almond milk.'],

  // Lemon items
  [/iced\s*lemon\s*loaf/i, 'Moist lemon pound cake.'],
  [/lemon\s*cake/i, 'Tart lemon layer cake.'],

  // Irish coffee
  [/irish\s*coffee/i, 'Coffee with Irish whiskey and cream.'],

  // Italian items
  [/italian.*water/i, 'Italian mineral water.'],
  [/italian.*beer/i, 'Italian beer.'],

  // Jack Daniels
  [/jack\s*daniel/i, 'Jack Daniels whiskey cocktail.'],

  // Jasmine rice
  [/jasmine\s*rice/i, 'Fragrant jasmine rice.'],
  [/jollof\s*rice/i, 'West African spiced tomato rice.'],

  // Juice
  [/juice\s*box/i, 'Kids juice box.'],
  [/kids?\s*juice/i, 'Kids juice drink.'],

  // Corn
  [/kettle.*corn/i, 'Sweet and salty kettle corn.'],

  // Key lime
  [/key\s*lime/i, 'Tangy key lime dessert.'],

  // Kirin
  [/kirin/i, 'Kirin Japanese beer.'],

  // Kona
  [/kona.*lager/i, 'Kona Hawaiian lager.'],

  // Korean
  [/korean\s*bbq/i, 'Korean BBQ-style dish.'],

  // Kronenbourg
  [/kronenbourg/i, 'Kronenbourg French beer.'],

  // La Cantina
  [/la\s*cantina\s*slushy/i, 'Frozen margarita slushy.'],

  // Lays
  [/lays/i, 'Lays potato chips.'],

  // Left Hand
  [/left\s*hand.*stout/i, 'Left Hand milk stout beer.'],

  // Liege waffle
  [/liege\s*waffle/i, 'Belgian Liège waffle with pearl sugar.'],
  [/pearl\s*sugar\s*waffle/i, 'Belgian waffle with pearl sugar.'],
  [/norwegian\s*waffle/i, 'Heart-shaped Norwegian waffle.'],

  // London fog
  [/london\s*fog/i, 'Earl Grey tea latte with vanilla.'],

  // Lowfat milk
  [/lowfat\s*milk/i, 'Lowfat milk.'],
  [/^milk$/i, 'Cold milk.'],
  [/small.*milk/i, 'Small serving of milk.'],

  // Lychee
  [/lychee/i, 'Sweet lychee fruit flavor.'],

  // Macaroni
  [/macaroni.*cheese|mac.*cheese/i, 'Creamy macaroni and cheese.'],

  // Macarons
  [/macarons?/i, 'French macarons.'],

  // Madagascar vanilla
  [/madagascar\s*vanilla/i, 'Premium Madagascar vanilla flavor.'],

  // Malibu
  [/malibu/i, 'Malibu rum cocktail.'],

  // Maple bacon
  [/maple\s*bacon/i, 'Sweet maple bacon flavor.'],

  // Meatball
  [/meatball/i, 'Italian meatballs.'],
  [/meatlovers?\s*pizza/i, 'Pizza with assorted meats.'],

  // Mexican rice
  [/mexican\s*rice/i, 'Spanish-style Mexican rice.'],
  [/sofrito\s*rice/i, 'Rice cooked with sofrito.'],

  // Mezcal
  [/mezcal/i, 'Smoky Mexican mezcal spirit.'],

  // Mickey items
  [/mickey.*brownie/i, 'Mickey Mouse-shaped brownie.'],
  [/mickey.*ice\s*cream/i, 'Mickey Mouse-shaped ice cream.'],
  [/mickey.*waffles?/i, 'Mickey Mouse-shaped waffles.'],
  [/mickey.*macaron/i, 'Mickey Mouse-shaped macaron.'],

  // Miller
  [/miller\s*lite/i, 'Miller Lite American lager.'],

  // Mimosa
  [/^mimosa$/i, 'Champagne and orange juice.'],

  // Minestrone
  [/minestrone/i, 'Italian vegetable soup.'],
  [/miso\s*soup/i, 'Japanese miso soup.'],
  [/soup\s*of\s*the\s*day/i, 'Daily featured soup.'],
  [/pepper\s*pot\s*soup/i, 'Caribbean pepper pot soup.'],

  // Mint
  [/^mint\s*chip$/i, 'Mint chocolate chip ice cream.'],

  // Minute Maid
  [/minute\s*maid/i, 'Minute Maid juice or lemonade.'],
  [/simply\s*lemonade/i, 'Simply Lemonade.'],

  // Modelo
  [/modelo/i, 'Modelo Mexican beer.'],

  // Monster
  [/monster.*energy/i, 'Monster energy drink.'],

  // Moonstone
  [/moonstone/i, 'Moonstone sake.'],

  // Muffins
  [/^muffins?$/i, 'Fresh baked muffins.'],
  [/pumpkin.*muffin/i, 'Pumpkin spice muffin.'],
  [/banana.*muffin/i, 'Banana muffin.'],

  // Nacho cheese
  [/nacho\s*cheese/i, 'Warm nacho cheese sauce.'],

  // Non alcoholic
  [/non\s*alcoholic/i, 'Non-alcoholic beverage.'],

  // Nuts
  [/^nuts$/i, 'Assorted roasted nuts.'],
  [/roasted\s*peanuts?/i, 'Roasted peanuts.'],

  // Nutrl
  [/nutrl|nütrl/i, 'Nutrl vodka seltzer.'],

  // Outshine
  [/outshine/i, 'Outshine frozen fruit bar.'],

  // Turkey
  [/turkey\s*breast/i, 'Sliced roasted turkey breast.'],
  [/roast\s*beef/i, 'Sliced roast beef.'],
  [/rotisserie\s*chicken/i, 'Rotisserie roasted chicken.'],

  // Pancakes
  [/pancake/i, 'Fluffy pancakes.'],
  [/scrambled\s*eggs/i, 'Fluffy scrambled eggs.'],

  // Tres leches
  [/tres\s*leches/i, 'Mexican three-milk cake.'],

  // Peroni
  [/peroni/i, 'Peroni Italian lager.'],

  // Perrier
  [/perrier/i, 'Perrier sparkling mineral water.'],
  [/san\s*benedetto/i, 'San Benedetto Italian water.'],

  // Pizza
  [/personal.*pizza/i, 'Personal-sized pizza.'],
  [/special\s*pizza/i, 'Specialty pizza.'],
  [/pizza\s*bitz/i, 'Bite-sized pizza snacks.'],

  // Pickle
  [/^pickle$/i, 'Dill pickle.'],

  // Pineapple
  [/pineapple\s*bowl/i, 'Fresh pineapple served in bowl.'],
  [/pineapple\s*cup/i, 'Cup of fresh pineapple.'],

  // Pink drink
  [/pink\s*drink/i, 'Starbucks Pink Drink refresher.'],

  // Pinot grigio
  [/pinot\s*grigio/i, 'White Pinot Grigio wine.'],

  // Pinto beans
  [/pinto.*beans/i, 'Seasoned pinto beans.'],

  // Pita
  [/pita.*tzatziki/i, 'Pita bread with tzatziki sauce.'],

  // Plain croissant
  [/plain\s*croissant/i, 'Classic butter croissant.'],

  // Plant based
  [/plant[- ]based/i, 'Plant-based menu options.'],

  // Plum wine
  [/plum\s*wine/i, 'Sweet Japanese plum wine.'],

  // Pomegranate
  [/pomegranate/i, 'Pomegranate flavor.'],

  // Popcorn souvenirs
  [/popcorn.*souvenir/i, 'Popcorn in collectible souvenir bucket.'],
  [/truffle\s*popcorn/i, 'Popcorn with truffle seasoning.'],
  [/popcorn\s*risotto/i, 'Creamy risotto finished with popcorn.'],

  // Egg rolls
  [/egg\s*rolls?/i, 'Crispy fried egg rolls.'],

  // Bread pudding
  [/bread\s*pudding/i, 'Warm bread pudding dessert.'],

  // Pumpkin items
  [/pumpkin\s*bread/i, 'Moist pumpkin bread.'],
  [/pumpkin\s*fizz/i, 'Sparkling pumpkin drink.'],
  [/pumpkin.*loaf/i, 'Pumpkin bread loaf.'],

  // Agave spirits
  [/raclcilla|raicilla/i, 'Mexican agave spirit from Jalisco.'],
  [/sotol/i, 'Mexican desert spoon plant spirit.'],

  // Ramona
  [/ramona.*spritz/i, 'Ramona canned wine spritzer.'],

  // Ranch
  [/^ranch$/i, 'Ranch dipping sauce.'],

  // Red items
  [/red\s*berries?\s*crepe/i, 'Crepe with fresh red berries.'],
  [/red\s*bull/i, 'Red Bull energy drink.'],
  [/red\s*velvet\s*cake/i, 'Classic red velvet layer cake.'],
  [/redbridge/i, 'Redbridge gluten-free beer.'],
  [/rocky\s*road/i, 'Rocky road ice cream or brownie.'],

  // Rice
  [/rice.*beans|pigeon\s*beans/i, 'Rice with beans.'],

  // Corn slaw
  [/corn\s*slaw/i, 'Corn and cabbage slaw.'],

  // Rolls
  [/rolls?.*breads?/i, 'Fresh bread rolls.'],

  // S'mores
  [/s'?mores?/i, 'Classic smores with chocolate and marshmallow.'],

  // Safari
  [/safari.*draft/i, 'Safari Amber draft beer.'],

  // Ramen
  [/ramen|saimin/i, 'Japanese noodle soup.'],

  // Samuel Adams
  [/samuel\s*adams|sam\s*adams/i, 'Samuel Adams craft beer.'],

  // Sauerkraut
  [/sauerkraut/i, 'Fermented cabbage.'],

  // Sausage items
  [/sausage\s*link/i, 'Breakfast sausage links.'],
  [/sausage.*egg.*sandwich|sausage.*cheddar.*sandwich/i, 'Breakfast sandwich with sausage, egg, and cheese.'],
  [/sausage.*biscuit/i, 'Biscuit with sausage, egg, and cheese.'],
  [/traditional\s*sausages?/i, 'Traditional grilled sausages.'],

  // Schnitzel
  [/schnitzel/i, 'Breaded and fried schnitzel.'],
  [/spätzle/i, 'German egg noodles.'],

  // Schofferhofer
  [/schofferhofer/i, 'Schofferhofer grapefruit wheat beer.'],

  // Scone
  [/scone/i, 'Fresh baked scone.'],

  // Seasonal items
  [/seasonal\s*(beer|cocktail|draft|salad|fruit|vegetable|shake|float)/i, 'Rotating seasonal selection.'],
  [/seasonal\s*bread\s*pudding/i, 'Seasonal bread pudding.'],

  // Shirley Temple
  [/shirley\s*temple/i, 'Non-alcoholic Shirley Temple.'],

  // Sake
  [/sho\s*chiku\s*bai|junmai/i, 'Japanese sake.'],

  // Side items
  [/^side\s+/i, 'Side portion.'],
  [/side\s*dishes?/i, 'Selection of side dishes.'],
  [/side\s*marinara/i, 'Side of marinara sauce.'],
  [/side\s*icing/i, 'Extra icing on the side.'],

  // Cheesecake
  [/cheesecake/i, 'Creamy cheesecake.'],

  // Espresso shots
  [/single\s*shot\s*espresso/i, 'Single espresso shot.'],

  // Sloppy joe
  [/sloppy\s*joe/i, 'Classic sloppy joe sandwich.'],

  // Smoked items
  [/smoked\s*bacon/i, 'Smoked bacon strips.'],

  // Soda
  [/^soda$/i, 'Soft drink.'],
  [/soft\s*drinks?/i, 'Soft drinks.'],

  // Souvenir
  [/souvenir\s*bottle/i, 'Collectible souvenir bottle.'],

  // Sparkling wine
  [/sparkling\s*wine/i, 'Sparkling wine.'],
  [/prosecco/i, 'Italian Prosecco sparkling wine.'],

  // Specialty coffee
  [/specialty\s*coffee/i, 'Specialty coffee drink.'],
  [/starbucks.*coffee/i, 'Starbucks brewed coffee.'],

  // Spicy chicken
  [/spicy\s*chicken/i, 'Spicy seasoned chicken.'],
  [/chicken.*doughnut/i, 'Chicken served with doughnut.'],

  // Spinach artichoke
  [/spinach\s*artichoke/i, 'Spinach artichoke dip.'],

  // Split scoop
  [/split\s*scoop/i, 'Split serving of two flavors.'],

  // Sprinkles
  [/^sprinkles$/i, 'Colorful sprinkles topping.'],

  // Sticky toffee
  [/sticky\s*toffee/i, 'British sticky toffee pudding.'],

  // Strawberry items
  [/strawberry\s*banana/i, 'Strawberry banana flavor.'],
  [/strawberry.*fries/i, 'French fries with strawberry topping.'],
  [/strawberry.*donut/i, 'Donut with strawberry icing.'],
  [/wildberry/i, 'Wild berry flavor.'],

  // Sweet corn
  [/sweet\s*corn\s*pudding/i, 'Creamy sweet corn pudding.'],

  // Take 7
  [/take\s*7\s*donut/i, 'Specialty donut creation.'],

  // Thin mint
  [/thin\s*mint/i, 'Girl Scout Thin Mint-inspired treat.'],

  // Toasted coconut
  [/toasted\s*coconut/i, 'Toasted coconut flavor.'],

  // Tokyo
  [/tokyo\s*sunset/i, 'Japanese-inspired cocktail.'],

  // Vegetable roll
  [/vegetable\s*roll/i, 'Vegetable sushi roll.'],

  // Guava
  [/guava/i, 'Sweet guava flavor.'],

  // Small water
  [/small\s*water/i, 'Small bottled water.'],
  [/premium.*water/i, 'Premium bottled water.'],
  [/h2o/i, 'Premium bottled water.'],

  // Sour cream
  [/^sour\s*cream$/i, 'Sour cream topping.'],

  // Pseudo Sue
  [/pseudo\s*sue/i, 'Pseudo Sue pale ale.'],

  // Lucky Foo
  [/lucky\s*foo/i, 'Lucky Foo pale ale.'],

  // Imagination Pink
  [/imagination\s*pink/i, 'Pink lemonade drink.'],

  // Passion fruit
  [/passion\s*fruit/i, 'Tropical passion fruit flavor.'],

  // Daiquiri
  [/daiquiri/i, 'Frozen or classic daiquiri cocktail.'],

  // Patisserie
  [/patisserie/i, 'French pastry.'],

  // Dipped cookie
  [/dipped\s*cookie\s*sandwich/i, 'Chocolate-dipped cookie sandwich.'],

  // Tequila liqueurs
  [/tequila\s*liqueurs?/i, 'Tequila-based liqueurs.'],

  // Bug brownie
  [/bug\s*brownie/i, 'Bug-themed decorated brownie.'],

  // Jar items
  [/jar\s*of/i, 'Jarred condiment or relish.'],

  // Entrees
  [/^entrees?$/i, 'Main course selection.'],

  // Green grace
  [/green\s*grace/i, 'Green vegetable juice or smoothie.'],

  // Haru pink
  [/haru\s*pink/i, 'Haru Pink sake.'],

  // Coconut ice pop
  [/coconut\s*ice\s*pop/i, 'Frozen coconut ice pop.'],

  // Sora sky
  [/sora\s*sky/i, 'Sora Sky Japanese drink.'],

  // Pigsty cocktail
  [/pigsty/i, 'Specialty cocktail.'],

  // Final stragglers
  [/\d+\s*oz\.?\s*sirloin/i, 'Grilled sirloin steak.'],
  [/oolong\s*tea/i, 'Traditional oolong tea.'],
  [/jr\.?\s*cheeseburger/i, 'Junior-sized cheeseburger.'],
  [/kid'?s?\s*juice/i, 'Kids juice drink.'],
  [/meat\s*lovers?\s*pizza/i, 'Pizza with assorted meats.'],
  [/mocha\s*latte/i, 'Espresso with chocolate and steamed milk.'],
  [/monster/i, 'Monster energy drink.'],
  [/nütrl|nutrl/i, 'Nutrl vodka seltzer.'],
  [/organic.*coffee/i, 'Organic brewed coffee.'],
  [/canvas\s*tote/i, 'Collectible canvas tote bag (non-food).'],
  [/coffee\s*mug/i, 'Collectible coffee mug (non-food).'],
  [/potato\s*chips/i, 'Crispy potato chips.'],
  [/premium\s*lemonade/i, 'Premium fresh-squeezed lemonade.'],
  [/marble\s*potatoes?/i, 'Roasted marble potatoes.'],
  [/tomato.*mozzarella.*sandwich/i, 'Sandwich with roasted tomato and mozzarella.'],
  [/seasonal\s*fresh\s*fruit/i, 'Fresh seasonal fruit.'],
  [/seasonal.*craft/i, 'Seasonal craft beer.'],
  [/seasonal.*shake/i, 'Seasonal milkshake flavor.'],
  [/small\s*apple\s*juice/i, 'Small apple juice.'],
  [/southern.*potatoes/i, 'Southern-style cheesy potatoes.'],
  [/specialty.*tequila/i, 'Premium aged tequila.'],

  // Final 3 with typos/special chars
  [/n[uü]trl.*seltzer/i, 'Nutrl vodka seltzer.'],
  [/marble\s*potao?te?s/i, 'Roasted marble potatoes.'],
  [/steakhouse\s*skirt/i, 'Grilled skirt steak.'],
]

async function fetchAll(table: string, select: string): Promise<any[]> {
  const all: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999)
    if (error) { console.error(`Error fetching ${table}:`, error.message); break }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

async function main() {
  console.log('Fetching items without descriptions...\n')

  const items = await fetchAll('menu_items', 'id, name, description, category')

  // Filter to items without descriptions
  const noDesc = items.filter(item => !item.description || item.description.trim().length === 0)
  console.log(`Items without descriptions: ${noDesc.length}`)

  let matched = 0
  let updated = 0
  const unmatched: string[] = []

  for (const item of noDesc) {
    let description: string | null = null
    const name = (item.name || '').trim() // Trim whitespace

    for (const [pattern, desc] of DESCRIPTIONS) {
      if (pattern.test(name)) {
        description = desc
        break
      }
    }

    if (description) {
      matched++
      const { error } = await supabase
        .from('menu_items')
        .update({ description })
        .eq('id', item.id)

      if (error) {
        console.error(`Failed to update ${item.name}:`, error.message)
      } else {
        updated++
        if (updated % 50 === 0) console.log(`Updated ${updated} items...`)
      }
    } else {
      unmatched.push(item.name)
    }
  }

  console.log('')
  console.log('=== Description Update Complete ===')
  console.log(`Matched patterns: ${matched}`)
  console.log(`Updated in DB: ${updated}`)
  console.log(`Unmatched: ${unmatched.length}`)

  // Save unmatched for further processing
  if (unmatched.length > 0) {
    const uniqueUnmatched = [...new Set(unmatched)].sort()
    writeFileSync('data/items-still-needing-descriptions.json', JSON.stringify(uniqueUnmatched, null, 2))
    console.log(`\nSaved ${uniqueUnmatched.length} unique unmatched items to data/items-still-needing-descriptions.json`)

    console.log('\nSample unmatched items:')
    uniqueUnmatched.slice(0, 20).forEach(n => console.log(`  - ${n}`))
    if (uniqueUnmatched.length > 20) console.log(`  ... and ${uniqueUnmatched.length - 20} more`)
  }
}

main().catch(console.error)
