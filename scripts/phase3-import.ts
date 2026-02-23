/**
 * Phase 3: Import missing menu items with keyword-based nutrition estimation.
 *
 * Usage:
 *   npx tsx scripts/phase3-import.ts data/parks/magic-kingdom-missing.json [--dry-run]
 *
 * - Reads a JSON file of missing items
 * - Creates restaurants if they don't exist under the target park
 * - Creates menu items, deduplicating by name within restaurant
 * - Estimates nutrition via keyword matching (confidence 30)
 * - Logs all additions to audit/additions/<park>_additions.csv
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const supabase = createClient(url, key)

const DRY_RUN = process.argv.includes('--dry-run')
const inputFile = process.argv[2]
if (!inputFile || inputFile.startsWith('--')) {
  console.error('Usage: npx tsx scripts/phase3-import.ts <json-file> [--dry-run]')
  process.exit(1)
}

// ---- Nutrition estimation by keyword ----

interface NutritionEstimate {
  calories: number
  carbs: number
  fat: number
  protein: number
  sugar: number
  fiber: number
  sodium: number
}

// Estimates based on common theme park food types
// Values are for a typical theme park portion
const FOOD_PROFILES: { pattern: RegExp; est: NutritionEstimate }[] = [
  // Entrees
  { pattern: /filet mignon|steak/i, est: { calories: 650, carbs: 25, fat: 32, protein: 55, sugar: 3, fiber: 2, sodium: 800 } },
  { pattern: /boeuf bourguignon|beef bourguignon|short rib|pot roast|braised beef|beef braised/i, est: { calories: 700, carbs: 30, fat: 35, protein: 45, sugar: 5, fiber: 3, sodium: 900 } },
  { pattern: /steak frites/i, est: { calories: 800, carbs: 45, fat: 40, protein: 50, sugar: 2, fiber: 3, sodium: 850 } },
  { pattern: /lamb chop/i, est: { calories: 600, carbs: 20, fat: 35, protein: 45, sugar: 3, fiber: 2, sodium: 750 } },
  { pattern: /pork chop|char siu/i, est: { calories: 650, carbs: 25, fat: 30, protein: 48, sugar: 8, fiber: 2, sodium: 850 } },
  { pattern: /chicken roulade/i, est: { calories: 550, carbs: 25, fat: 25, protein: 45, sugar: 3, fiber: 2, sodium: 800 } },
  { pattern: /poulet rouge|roast chicken entree/i, est: { calories: 550, carbs: 20, fat: 22, protein: 45, sugar: 3, fiber: 2, sodium: 700 } },
  { pattern: /fried chicken|crispy chicken|chicken breast nugget/i, est: { calories: 600, carbs: 35, fat: 30, protein: 35, sugar: 3, fiber: 2, sodium: 1100 } },
  { pattern: /chicken sandwich/i, est: { calories: 650, carbs: 45, fat: 30, protein: 35, sugar: 5, fiber: 2, sodium: 1200 } },
  { pattern: /chicken waldorf salad/i, est: { calories: 450, carbs: 20, fat: 25, protein: 35, sugar: 12, fiber: 4, sodium: 600 } },
  { pattern: /shrimp louie|shrimp salad/i, est: { calories: 400, carbs: 15, fat: 22, protein: 30, sugar: 5, fiber: 3, sodium: 700 } },
  { pattern: /lobster roll/i, est: { calories: 550, carbs: 35, fat: 25, protein: 30, sugar: 4, fiber: 2, sodium: 900 } },
  { pattern: /arctic char|catch of the day|fish/i, est: { calories: 500, carbs: 25, fat: 22, protein: 40, sugar: 3, fiber: 2, sodium: 700 } },
  { pattern: /bacon cheeseburger|cheeseburger/i, est: { calories: 900, carbs: 50, fat: 50, protein: 45, sugar: 8, fiber: 3, sodium: 1400 } },
  { pattern: /impossible burger|plant.based burger/i, est: { calories: 750, carbs: 55, fat: 35, protein: 25, sugar: 8, fiber: 5, sodium: 1200 } },
  { pattern: /turkey club/i, est: { calories: 600, carbs: 40, fat: 28, protein: 35, sugar: 5, fiber: 3, sodium: 1100 } },
  { pattern: /pulled pork|barbecue pork|chipotle.*pork/i, est: { calories: 550, carbs: 40, fat: 22, protein: 35, sugar: 12, fiber: 2, sodium: 1000 } },
  { pattern: /hot dog/i, est: { calories: 450, carbs: 35, fat: 25, protein: 15, sugar: 5, fiber: 2, sodium: 1000 } },
  { pattern: /turkey leg/i, est: { calories: 1100, carbs: 0, fat: 55, protein: 85, sugar: 0, fiber: 0, sodium: 2200 } },
  { pattern: /noodle bowl|shrimp stir/i, est: { calories: 550, carbs: 55, fat: 18, protein: 30, sugar: 8, fiber: 3, sodium: 1100 } },
  { pattern: /duck fried rice/i, est: { calories: 600, carbs: 50, fat: 25, protein: 30, sugar: 5, fiber: 2, sodium: 1000 } },
  { pattern: /curried vegetable|crew stew|(?<!agedashi )tofu/i, est: { calories: 450, carbs: 45, fat: 18, protein: 15, sugar: 8, fiber: 5, sodium: 800 } },
  { pattern: /eggplant|cauliflower.*roast/i, est: { calories: 400, carbs: 35, fat: 18, protein: 10, sugar: 8, fiber: 6, sodium: 600 } },
  { pattern: /ham.*gruyere|ham.*sandwich|croissant.*ham/i, est: { calories: 500, carbs: 35, fat: 28, protein: 25, sugar: 4, fiber: 1, sodium: 950 } },
  { pattern: /trio platter|fried shrimp.*fish/i, est: { calories: 700, carbs: 50, fat: 35, protein: 35, sugar: 3, fiber: 2, sodium: 1200 } },
  { pattern: /angus.*burger/i, est: { calories: 850, carbs: 50, fat: 45, protein: 42, sugar: 7, fiber: 3, sodium: 1300 } },
  { pattern: /spring roll/i, est: { calories: 350, carbs: 30, fat: 18, protein: 12, sugar: 3, fiber: 2, sodium: 600 } },
  { pattern: /bagel sandwich|sausage.*egg/i, est: { calories: 500, carbs: 40, fat: 25, protein: 22, sugar: 4, fiber: 2, sodium: 900 } },
  { pattern: /hot honey chicken/i, est: { calories: 550, carbs: 45, fat: 25, protein: 30, sugar: 12, fiber: 3, sodium: 1000 } },
  // Buffet entrees
  { pattern: /prime rib|carved.*beef/i, est: { calories: 500, carbs: 0, fat: 30, protein: 55, sugar: 0, fiber: 0, sodium: 600 } },
  { pattern: /roasted pork loin/i, est: { calories: 350, carbs: 5, fat: 15, protein: 45, sugar: 2, fiber: 0, sodium: 500 } },
  { pattern: /shrimp creole/i, est: { calories: 350, carbs: 20, fat: 12, protein: 30, sugar: 5, fiber: 3, sodium: 800 } },
  { pattern: /herb.*roasted chicken/i, est: { calories: 400, carbs: 5, fat: 20, protein: 45, sugar: 1, fiber: 0, sodium: 600 } },
  { pattern: /country fried chicken/i, est: { calories: 500, carbs: 25, fat: 28, protein: 35, sugar: 2, fiber: 1, sodium: 900 } },

  // Japanese food
  { pattern: /edamame/i, est: { calories: 120, carbs: 10, fat: 5, protein: 11, sugar: 2, fiber: 5, sodium: 400 } },
  { pattern: /miso soup/i, est: { calories: 40, carbs: 5, fat: 1, protein: 3, sugar: 1, fiber: 1, sodium: 700 } },
  { pattern: /takoyaki/i, est: { calories: 300, carbs: 30, fat: 14, protein: 12, sugar: 3, fiber: 1, sodium: 650 } },
  { pattern: /kara.?age|karaage/i, est: { calories: 350, carbs: 20, fat: 20, protein: 25, sugar: 2, fiber: 1, sodium: 700 } },
  { pattern: /rock shrimp tempura|shrimp tempura(?! roll)/i, est: { calories: 400, carbs: 30, fat: 22, protein: 20, sugar: 3, fiber: 1, sodium: 600 } },
  { pattern: /vegetable tempura/i, est: { calories: 300, carbs: 30, fat: 16, protein: 5, sugar: 3, fiber: 3, sodium: 400 } },
  { pattern: /fish tempura|tempura/i, est: { calories: 350, carbs: 28, fat: 20, protein: 18, sugar: 2, fiber: 1, sodium: 500 } },
  { pattern: /gyoza|pot ?sticker/i, est: { calories: 280, carbs: 25, fat: 12, protein: 15, sugar: 2, fiber: 1, sodium: 650 } },
  { pattern: /agedashi tofu/i, est: { calories: 200, carbs: 15, fat: 12, protein: 10, sugar: 2, fiber: 1, sodium: 500 } },
  { pattern: /sushi sampler|sashimi sampler/i, est: { calories: 350, carbs: 30, fat: 8, protein: 30, sugar: 2, fiber: 1, sodium: 600 } },
  { pattern: /dragon roll/i, est: { calories: 500, carbs: 55, fat: 18, protein: 20, sugar: 5, fiber: 2, sodium: 700 } },
  { pattern: /volcano roll/i, est: { calories: 450, carbs: 50, fat: 18, protein: 18, sugar: 4, fiber: 2, sodium: 650 } },
  { pattern: /spicy.*roll|rainbow roll|california roll|philadelphia roll|shrimp tempura roll/i, est: { calories: 350, carbs: 45, fat: 10, protein: 18, sugar: 3, fiber: 2, sodium: 600 } },
  { pattern: /salmon roll|tuna roll|eel roll|vegetable roll|avocado roll|crab.*roll/i, est: { calories: 280, carbs: 38, fat: 6, protein: 15, sugar: 2, fiber: 2, sodium: 500 } },
  { pattern: /kobore sushi/i, est: { calories: 400, carbs: 35, fat: 12, protein: 28, sugar: 2, fiber: 1, sodium: 650 } },
  { pattern: /tuna don|kaisen don|spicy tuna don/i, est: { calories: 500, carbs: 55, fat: 12, protein: 35, sugar: 3, fiber: 2, sodium: 700 } },
  { pattern: /unagi don/i, est: { calories: 550, carbs: 60, fat: 18, protein: 25, sugar: 8, fiber: 1, sodium: 750 } },
  { pattern: /oyakodon/i, est: { calories: 500, carbs: 55, fat: 15, protein: 30, sugar: 5, fiber: 1, sodium: 800 } },
  { pattern: /tendon/i, est: { calories: 550, carbs: 60, fat: 20, protein: 20, sugar: 5, fiber: 2, sodium: 700 } },
  { pattern: /okonomiyaki/i, est: { calories: 500, carbs: 55, fat: 20, protein: 20, sugar: 6, fiber: 3, sodium: 900 } },
  { pattern: /yaki udon|yakisoba/i, est: { calories: 500, carbs: 60, fat: 15, protein: 25, sugar: 5, fiber: 3, sodium: 1000 } },
  { pattern: /udon/i, est: { calories: 400, carbs: 55, fat: 8, protein: 15, sugar: 3, fiber: 2, sodium: 900 } },
  { pattern: /ishiyaki|stone bowl/i, est: { calories: 550, carbs: 60, fat: 18, protein: 25, sugar: 4, fiber: 2, sodium: 800 } },
  { pattern: /wagyu don/i, est: { calories: 650, carbs: 50, fat: 30, protein: 35, sugar: 4, fiber: 1, sodium: 750 } },
  { pattern: /salmon miso yaki|miso.*salmon|grilled.*salmon/i, est: { calories: 400, carbs: 10, fat: 20, protein: 40, sugar: 3, fiber: 1, sodium: 700 } },
  { pattern: /kushi.*skewer|yakitori/i, est: { calories: 450, carbs: 10, fat: 22, protein: 45, sugar: 5, fiber: 1, sodium: 800 } },
  { pattern: /ichigo parfait/i, est: { calories: 350, carbs: 45, fat: 15, protein: 6, sugar: 35, fiber: 2, sodium: 100 } },
  { pattern: /mochi ice cream/i, est: { calories: 200, carbs: 30, fat: 6, protein: 3, sugar: 18, fiber: 0, sodium: 30 } },
  { pattern: /mango mousse cake|mousse cake/i, est: { calories: 350, carbs: 40, fat: 18, protein: 4, sugar: 30, fiber: 1, sodium: 150 } },
  { pattern: /matcha|green tea soft.serve/i, est: { calories: 180, carbs: 28, fat: 5, protein: 3, sugar: 22, fiber: 0, sodium: 50 } },
  { pattern: /ramune/i, est: { calories: 70, carbs: 18, fat: 0, protein: 0, sugar: 17, fiber: 0, sodium: 10 } },
  { pattern: /teppan.*steak|ny cut steak/i, est: { calories: 700, carbs: 45, fat: 30, protein: 50, sugar: 3, fiber: 3, sodium: 800 } },
  { pattern: /teppan.*salmon/i, est: { calories: 600, carbs: 45, fat: 22, protein: 40, sugar: 3, fiber: 3, sodium: 700 } },
  { pattern: /teppan.*shrimp|ebi/i, est: { calories: 500, carbs: 45, fat: 15, protein: 35, sugar: 3, fiber: 3, sodium: 750 } },
  { pattern: /teppan.*chicken|tori/i, est: { calories: 550, carbs: 45, fat: 18, protein: 40, sugar: 3, fiber: 3, sodium: 700 } },
  { pattern: /teppan.*yasai|teppan.*vegetable/i, est: { calories: 400, carbs: 50, fat: 12, protein: 12, sugar: 4, fiber: 5, sodium: 600 } },
  { pattern: /chocolate lava cake|lava cake/i, est: { calories: 450, carbs: 55, fat: 25, protein: 6, sugar: 40, fiber: 2, sodium: 200 } },

  // Chinese food
  { pattern: /wonton|won ton/i, est: { calories: 280, carbs: 25, fat: 12, protein: 15, sugar: 2, fiber: 1, sodium: 700 } },
  { pattern: /bao bun|steamed bun/i, est: { calories: 300, carbs: 30, fat: 12, protein: 15, sugar: 5, fiber: 1, sodium: 600 } },
  { pattern: /crab.*soup|corn.*soup/i, est: { calories: 200, carbs: 18, fat: 8, protein: 12, sugar: 3, fiber: 1, sodium: 800 } },
  { pattern: /shumai|dumpling/i, est: { calories: 250, carbs: 22, fat: 10, protein: 14, sugar: 2, fiber: 1, sodium: 600 } },
  { pattern: /honey sesame chicken|general tso|orange chicken|sesame chicken/i, est: { calories: 650, carbs: 55, fat: 28, protein: 30, sugar: 22, fiber: 2, sodium: 1100 } },
  { pattern: /kung pao/i, est: { calories: 550, carbs: 30, fat: 28, protein: 35, sugar: 8, fiber: 3, sodium: 1000 } },
  { pattern: /canton pepper|pepper beef|mongolian beef|beef stir/i, est: { calories: 550, carbs: 35, fat: 25, protein: 35, sugar: 8, fiber: 2, sodium: 1000 } },
  { pattern: /fried rice/i, est: { calories: 550, carbs: 65, fat: 18, protein: 20, sugar: 3, fiber: 2, sodium: 1000 } },
  { pattern: /spare rib|glazed rib/i, est: { calories: 600, carbs: 25, fat: 35, protein: 40, sugar: 15, fiber: 1, sodium: 900 } },
  { pattern: /vegetable stir fry|tofu stir fry/i, est: { calories: 350, carbs: 30, fat: 15, protein: 12, sugar: 6, fiber: 5, sodium: 700 } },
  { pattern: /prawns|glazed prawn/i, est: { calories: 450, carbs: 25, fat: 20, protein: 35, sugar: 8, fiber: 1, sodium: 800 } },
  { pattern: /ma la|spicy.*family/i, est: { calories: 600, carbs: 30, fat: 30, protein: 40, sugar: 5, fiber: 3, sodium: 1100 } },
  { pattern: /typhoon.*sole|fried.*sole|fried.*fish/i, est: { calories: 500, carbs: 35, fat: 25, protein: 30, sugar: 3, fiber: 1, sodium: 800 } },
  { pattern: /mango pudding/i, est: { calories: 200, carbs: 35, fat: 5, protein: 3, sugar: 28, fiber: 1, sodium: 50 } },
  { pattern: /ube cheesecake/i, est: { calories: 400, carbs: 42, fat: 22, protein: 6, sugar: 30, fiber: 1, sodium: 250 } },
  { pattern: /crepe cake|mille crepe/i, est: { calories: 400, carbs: 45, fat: 22, protein: 6, sugar: 28, fiber: 1, sodium: 200 } },
  { pattern: /bubble.*tea|boba.*tea|taro.*tea/i, est: { calories: 300, carbs: 55, fat: 5, protein: 3, sugar: 40, fiber: 0, sodium: 50 } },
  { pattern: /plum wine/i, est: { calories: 160, carbs: 18, fat: 0, protein: 0, sugar: 16, fiber: 0, sodium: 5 } },
  { pattern: /mango slushy|strawberry slushy/i, est: { calories: 180, carbs: 45, fat: 0, protein: 0, sugar: 42, fiber: 0, sodium: 15 } },

  // Italian food
  { pattern: /calamari fritti|fried calamari|calamari/i, est: { calories: 400, carbs: 30, fat: 22, protein: 18, sugar: 2, fiber: 1, sodium: 700 } },
  { pattern: /arancini/i, est: { calories: 350, carbs: 35, fat: 16, protein: 12, sugar: 3, fiber: 1, sodium: 600 } },
  { pattern: /caprese|mozzarella.*tomato/i, est: { calories: 250, carbs: 8, fat: 18, protein: 14, sugar: 4, fiber: 1, sodium: 400 } },
  { pattern: /bruschetta/i, est: { calories: 300, carbs: 30, fat: 14, protein: 8, sugar: 4, fiber: 2, sodium: 500 } },
  { pattern: /focaccia/i, est: { calories: 250, carbs: 35, fat: 10, protein: 6, sugar: 2, fiber: 2, sodium: 500 } },
  { pattern: /spaghetti.*meatball|polpettine/i, est: { calories: 750, carbs: 70, fat: 28, protein: 35, sugar: 8, fiber: 4, sodium: 1100 } },
  { pattern: /penne.*bolognese|bolognese/i, est: { calories: 700, carbs: 65, fat: 25, protein: 32, sugar: 6, fiber: 4, sodium: 1000 } },
  { pattern: /tortellini/i, est: { calories: 650, carbs: 55, fat: 28, protein: 25, sugar: 4, fiber: 2, sodium: 900 } },
  { pattern: /fettuccine|fettucine/i, est: { calories: 700, carbs: 65, fat: 30, protein: 20, sugar: 3, fiber: 3, sodium: 850 } },
  { pattern: /manicotti/i, est: { calories: 600, carbs: 50, fat: 25, protein: 22, sugar: 5, fiber: 3, sodium: 800 } },
  { pattern: /chicken parmesan|parmigiana/i, est: { calories: 800, carbs: 60, fat: 35, protein: 45, sugar: 8, fiber: 3, sodium: 1200 } },
  { pattern: /branzino|sea bass/i, est: { calories: 450, carbs: 15, fat: 20, protein: 42, sugar: 3, fiber: 2, sodium: 600 } },
  { pattern: /filetto di manzo|beef medallion/i, est: { calories: 600, carbs: 20, fat: 30, protein: 55, sugar: 3, fiber: 2, sodium: 700 } },
  { pattern: /pizza margherita|pizza margarita/i, est: { calories: 800, carbs: 80, fat: 28, protein: 30, sugar: 5, fiber: 4, sodium: 1400 } },
  { pattern: /pizza.*formaggi|four cheese pizza/i, est: { calories: 900, carbs: 75, fat: 38, protein: 35, sugar: 4, fiber: 3, sodium: 1500 } },
  { pattern: /pizza.*meat|meat.*pizza|pepperoni pizza/i, est: { calories: 950, carbs: 78, fat: 42, protein: 40, sugar: 5, fiber: 3, sodium: 1600 } },
  { pattern: /pizza/i, est: { calories: 850, carbs: 78, fat: 32, protein: 32, sugar: 5, fiber: 3, sodium: 1400 } },
  { pattern: /tiramisu/i, est: { calories: 450, carbs: 42, fat: 25, protein: 6, sugar: 28, fiber: 1, sodium: 150 } },
  { pattern: /cannoli|cannolo/i, est: { calories: 350, carbs: 38, fat: 18, protein: 8, sugar: 22, fiber: 1, sodium: 150 } },
  { pattern: /gelato|sorbetto/i, est: { calories: 250, carbs: 32, fat: 10, protein: 4, sugar: 28, fiber: 0, sodium: 50 } },
  { pattern: /bombolone|italian doughnut/i, est: { calories: 300, carbs: 38, fat: 14, protein: 4, sugar: 18, fiber: 1, sodium: 200 } },
  { pattern: /bocconcini|mozzarella bites/i, est: { calories: 350, carbs: 25, fat: 20, protein: 14, sugar: 2, fiber: 1, sodium: 500 } },

  // French food
  { pattern: /soupe.*l'?oignon|onion soup/i, est: { calories: 350, carbs: 25, fat: 18, protein: 15, sugar: 5, fiber: 2, sodium: 1200 } },
  { pattern: /galette.*classique|galette.*ham/i, est: { calories: 450, carbs: 35, fat: 22, protein: 22, sugar: 3, fiber: 2, sodium: 800 } },
  { pattern: /galette.*poulet|galette.*chicken/i, est: { calories: 480, carbs: 35, fat: 25, protein: 28, sugar: 3, fiber: 2, sodium: 750 } },
  { pattern: /galette.*chevre|galette.*goat/i, est: { calories: 420, carbs: 35, fat: 22, protein: 16, sugar: 3, fiber: 3, sodium: 600 } },
  { pattern: /galette.*saumon|galette.*salmon/i, est: { calories: 430, carbs: 32, fat: 22, protein: 24, sugar: 2, fiber: 2, sodium: 700 } },
  { pattern: /galette.*ratatouille|galette.*vegetable/i, est: { calories: 380, carbs: 38, fat: 18, protein: 10, sugar: 5, fiber: 4, sodium: 500 } },
  { pattern: /galette/i, est: { calories: 430, carbs: 35, fat: 22, protein: 20, sugar: 3, fiber: 2, sodium: 700 } },
  { pattern: /crepe.*gourmande|crepe.*chocolate|crepe.*nutella/i, est: { calories: 400, carbs: 50, fat: 20, protein: 6, sugar: 35, fiber: 2, sodium: 150 } },
  { pattern: /crepe.*banane|crepe.*banana/i, est: { calories: 380, carbs: 52, fat: 16, protein: 5, sugar: 32, fiber: 2, sodium: 100 } },
  { pattern: /crepe.*pomme|crepe.*apple/i, est: { calories: 370, carbs: 50, fat: 16, protein: 4, sugar: 30, fiber: 2, sodium: 100 } },
  { pattern: /crepe.*poire|crepe.*pear/i, est: { calories: 380, carbs: 50, fat: 18, protein: 5, sugar: 30, fiber: 2, sodium: 120 } },
  { pattern: /crepe.*sucre|crepe.*sugar/i, est: { calories: 300, carbs: 42, fat: 12, protein: 4, sugar: 22, fiber: 1, sodium: 80 } },
  { pattern: /crepe.*melba|crepe.*peach/i, est: { calories: 360, carbs: 48, fat: 14, protein: 5, sugar: 28, fiber: 2, sodium: 100 } },
  { pattern: /poulet.*roti|rotisserie chicken/i, est: { calories: 550, carbs: 25, fat: 25, protein: 45, sugar: 3, fiber: 3, sodium: 800 } },
  { pattern: /gratin de macaroni|gratin.*mac/i, est: { calories: 600, carbs: 55, fat: 30, protein: 22, sugar: 4, fiber: 2, sodium: 900 } },
  { pattern: /gateau.*chocolat|3 chocolats|trois chocolat/i, est: { calories: 450, carbs: 50, fat: 25, protein: 6, sugar: 38, fiber: 2, sodium: 200 } },
  { pattern: /gateau.*opera|opera cake/i, est: { calories: 420, carbs: 45, fat: 22, protein: 5, sugar: 32, fiber: 1, sodium: 180 } },
  { pattern: /profiterole|cygne/i, est: { calories: 400, carbs: 42, fat: 22, protein: 6, sugar: 30, fiber: 1, sodium: 150 } },
  { pattern: /sorbet/i, est: { calories: 180, carbs: 42, fat: 0, protein: 0, sugar: 38, fiber: 1, sodium: 10 } },
  { pattern: /lobster bisque|bisque/i, est: { calories: 300, carbs: 15, fat: 20, protein: 15, sugar: 3, fiber: 1, sodium: 900 } },
  { pattern: /coconut.*shrimp|coconut fried shrimp/i, est: { calories: 450, carbs: 35, fat: 25, protein: 22, sugar: 8, fiber: 2, sodium: 700 } },
  { pattern: /seafood boil/i, est: { calories: 550, carbs: 30, fat: 22, protein: 45, sugar: 4, fiber: 3, sodium: 1200 } },
  { pattern: /guava.*short rib|braised short rib/i, est: { calories: 700, carbs: 30, fat: 35, protein: 45, sugar: 8, fiber: 2, sodium: 800 } },

  // Norwegian food
  { pattern: /school bread/i, est: { calories: 350, carbs: 45, fat: 14, protein: 6, sugar: 22, fiber: 2, sodium: 250 } },
  { pattern: /rice cream|rice pudding/i, est: { calories: 250, carbs: 40, fat: 8, protein: 5, sugar: 22, fiber: 0, sodium: 100 } },
  { pattern: /lefse/i, est: { calories: 150, carbs: 22, fat: 6, protein: 2, sugar: 8, fiber: 1, sodium: 150 } },
  { pattern: /kringla/i, est: { calories: 280, carbs: 38, fat: 12, protein: 4, sugar: 18, fiber: 1, sodium: 200 } },
  { pattern: /verden'?s beste/i, est: { calories: 300, carbs: 35, fat: 15, protein: 5, sugar: 22, fiber: 1, sodium: 150 } },
  { pattern: /eplekake|apple cake/i, est: { calories: 320, carbs: 42, fat: 14, protein: 4, sugar: 25, fiber: 2, sodium: 200 } },
  { pattern: /viking coffee/i, est: { calories: 250, carbs: 20, fat: 8, protein: 2, sugar: 18, fiber: 0, sodium: 30 } },

  // German caramel treats (specific before generic)
  { pattern: /caramel.*cupcake/i, est: { calories: 400, carbs: 52, fat: 18, protein: 4, sugar: 38, fiber: 1, sodium: 250 } },
  { pattern: /caramel.*cookie.*sandwich/i, est: { calories: 380, carbs: 50, fat: 16, protein: 4, sugar: 32, fiber: 1, sodium: 200 } },
  { pattern: /caramel.*cookie|cookie.*caramel/i, est: { calories: 320, carbs: 42, fat: 14, protein: 4, sugar: 25, fiber: 1, sodium: 200 } },
  { pattern: /caramel.*bar|butter bar/i, est: { calories: 280, carbs: 35, fat: 14, protein: 3, sugar: 22, fiber: 0, sodium: 150 } },
  { pattern: /caramel.*pecan cluster|pecan cluster/i, est: { calories: 250, carbs: 28, fat: 15, protein: 4, sugar: 20, fiber: 1, sodium: 100 } },
  { pattern: /caramel.*s'?more/i, est: { calories: 280, carbs: 38, fat: 12, protein: 3, sugar: 25, fiber: 1, sodium: 100 } },
  { pattern: /caramel.*pretzel/i, est: { calories: 300, carbs: 42, fat: 12, protein: 4, sugar: 18, fiber: 1, sodium: 350 } },
  { pattern: /caramel square/i, est: { calories: 200, carbs: 28, fat: 9, protein: 2, sugar: 22, fiber: 0, sodium: 80 } },
  { pattern: /caramel.*liquor flight/i, est: { calories: 350, carbs: 45, fat: 14, protein: 3, sugar: 35, fiber: 0, sodium: 100 } },
  { pattern: /marshmallow pop/i, est: { calories: 250, carbs: 38, fat: 10, protein: 2, sugar: 30, fiber: 0, sodium: 50 } },
  { pattern: /chocolate.*dipped.*strawberr/i, est: { calories: 200, carbs: 28, fat: 10, protein: 2, sugar: 22, fiber: 2, sodium: 20 } },

  // Appetizers / sides
  { pattern: /french onion soup/i, est: { calories: 350, carbs: 25, fat: 18, protein: 15, sugar: 5, fiber: 2, sodium: 1200 } },
  { pattern: /crab bisque|blue crab/i, est: { calories: 300, carbs: 15, fat: 20, protein: 12, sugar: 3, fiber: 1, sodium: 900 } },
  { pattern: /tuna tartare|tiradito/i, est: { calories: 250, carbs: 10, fat: 12, protein: 25, sugar: 2, fiber: 1, sodium: 500 } },
  { pattern: /escargot/i, est: { calories: 300, carbs: 10, fat: 22, protein: 18, sugar: 1, fiber: 0, sodium: 600 } },
  { pattern: /endive.*walnut|mixed green|house salad|castle salad|jungle.*salad/i, est: { calories: 200, carbs: 12, fat: 14, protein: 5, sugar: 6, fiber: 3, sodium: 300 } },
  { pattern: /falafel/i, est: { calories: 350, carbs: 35, fat: 18, protein: 12, sugar: 3, fiber: 6, sodium: 600 } },
  { pattern: /cachapas/i, est: { calories: 400, carbs: 35, fat: 20, protein: 18, sugar: 5, fiber: 3, sodium: 700 } },
  { pattern: /loaded fries|cheddar.*bacon.*fries/i, est: { calories: 650, carbs: 55, fat: 35, protein: 18, sugar: 3, fiber: 4, sodium: 1100 } },
  { pattern: /onion ring/i, est: { calories: 450, carbs: 45, fat: 25, protein: 6, sugar: 5, fiber: 3, sodium: 700 } },
  { pattern: /crab.*dip|crab.*cheddar/i, est: { calories: 400, carbs: 25, fat: 25, protein: 15, sugar: 3, fiber: 1, sodium: 800 } },
  { pattern: /sweet potato fries/i, est: { calories: 350, carbs: 45, fat: 16, protein: 4, sugar: 8, fiber: 5, sodium: 500 } },
  { pattern: /tater tots|loaded tots/i, est: { calories: 500, carbs: 45, fat: 30, protein: 12, sugar: 3, fiber: 3, sodium: 900 } },
  { pattern: /mac.*cheese.*hand pie/i, est: { calories: 400, carbs: 35, fat: 22, protein: 12, sugar: 3, fiber: 1, sodium: 700 } },
  { pattern: /jalapeno popper/i, est: { calories: 350, carbs: 25, fat: 22, protein: 10, sugar: 3, fiber: 2, sodium: 600 } },
  { pattern: /corn dog|mini corn dog/i, est: { calories: 400, carbs: 35, fat: 22, protein: 12, sugar: 5, fiber: 1, sodium: 800 } },
  { pattern: /candied bacon/i, est: { calories: 350, carbs: 15, fat: 25, protein: 18, sugar: 12, fiber: 0, sodium: 700 } },
  { pattern: /mickey.*pretzel|jumbo pretzel|pretzel.*cheese/i, est: { calories: 480, carbs: 70, fat: 12, protein: 12, sugar: 5, fiber: 2, sodium: 1200 } },
  { pattern: /pepper jack pretzel/i, est: { calories: 400, carbs: 50, fat: 15, protein: 14, sugar: 3, fiber: 2, sodium: 900 } },
  { pattern: /pork belly|crispy pork/i, est: { calories: 400, carbs: 15, fat: 28, protein: 25, sugar: 8, fiber: 1, sodium: 700 } },
  { pattern: /mashed potato/i, est: { calories: 200, carbs: 30, fat: 8, protein: 4, sugar: 2, fiber: 2, sodium: 400 } },
  { pattern: /seasonal vegetable|fresh.*vegetable/i, est: { calories: 100, carbs: 15, fat: 4, protein: 3, sugar: 5, fiber: 4, sodium: 200 } },
  { pattern: /roasted potato/i, est: { calories: 200, carbs: 30, fat: 8, protein: 4, sugar: 1, fiber: 3, sodium: 350 } },
  { pattern: /steamed rice/i, est: { calories: 200, carbs: 45, fat: 1, protein: 4, sugar: 0, fiber: 1, sodium: 10 } },
  { pattern: /seasonal pasta/i, est: { calories: 400, carbs: 55, fat: 12, protein: 12, sugar: 5, fiber: 3, sodium: 600 } },
  { pattern: /couscous salad/i, est: { calories: 250, carbs: 35, fat: 8, protein: 8, sugar: 5, fiber: 3, sodium: 400 } },
  { pattern: /fruit salad|fresh fruit|whole fruit/i, est: { calories: 80, carbs: 20, fat: 0, protein: 1, sugar: 16, fiber: 3, sodium: 5 } },
  { pattern: /peel.*shrimp|chilled shrimp/i, est: { calories: 150, carbs: 2, fat: 2, protein: 28, sugar: 0, fiber: 0, sodium: 500 } },
  { pattern: /lentil soup|soup of the day|lost.*found soup/i, est: { calories: 250, carbs: 30, fat: 8, protein: 12, sugar: 4, fiber: 6, sodium: 800 } },
  { pattern: /grapes/i, est: { calories: 60, carbs: 16, fat: 0, protein: 1, sugar: 15, fiber: 1, sodium: 2 } },
  { pattern: /pickle/i, est: { calories: 5, carbs: 1, fat: 0, protein: 0, sugar: 1, fiber: 0, sodium: 800 } },
  { pattern: /popcorn/i, est: { calories: 300, carbs: 35, fat: 16, protein: 4, sugar: 2, fiber: 4, sodium: 400 } },
  { pattern: /cotton candy/i, est: { calories: 200, carbs: 50, fat: 0, protein: 0, sugar: 50, fiber: 0, sodium: 0 } },
  { pattern: /watermelon.*cucumber|fruit cup/i, est: { calories: 80, carbs: 18, fat: 1, protein: 1, sugar: 14, fiber: 2, sodium: 100 } },

  // Desserts (most specific first!)
  { pattern: /mickey sink/i, est: { calories: 1200, carbs: 140, fat: 55, protein: 18, sugar: 110, fiber: 3, sodium: 400 } },
  { pattern: /brownie sundae/i, est: { calories: 650, carbs: 80, fat: 30, protein: 8, sugar: 60, fiber: 2, sodium: 300 } },
  { pattern: /rapunzel sundae|aurora cone/i, est: { calories: 350, carbs: 50, fat: 8, protein: 3, sugar: 40, fiber: 1, sodium: 50 } },
  { pattern: /banana split/i, est: { calories: 700, carbs: 85, fat: 30, protein: 10, sugar: 65, fiber: 3, sodium: 200 } },
  { pattern: /sundae|ice cream sundae/i, est: { calories: 500, carbs: 60, fat: 25, protein: 7, sugar: 50, fiber: 1, sodium: 200 } },
  { pattern: /milkshake|milk shake|shake/i, est: { calories: 550, carbs: 70, fat: 22, protein: 10, sugar: 60, fiber: 1, sodium: 250 } },
  { pattern: /soft.serve|dole whip/i, est: { calories: 200, carbs: 40, fat: 3, protein: 2, sugar: 30, fiber: 0, sodium: 50 } },
  { pattern: /ice cream.*cone|double.*scoop/i, est: { calories: 350, carbs: 42, fat: 16, protein: 6, sugar: 35, fiber: 1, sodium: 120 } },
  { pattern: /ice cream bar|mickey.*bar/i, est: { calories: 300, carbs: 35, fat: 15, protein: 4, sugar: 28, fiber: 1, sodium: 80 } },
  { pattern: /blooming rose|grey stuff/i, est: { calories: 500, carbs: 60, fat: 25, protein: 6, sugar: 45, fiber: 2, sodium: 300 } },
  { pattern: /creme brulee|creme brulee tart/i, est: { calories: 400, carbs: 45, fat: 22, protein: 5, sugar: 35, fiber: 1, sodium: 150 } },
  { pattern: /cheesecake/i, est: { calories: 450, carbs: 40, fat: 28, protein: 8, sugar: 30, fiber: 1, sodium: 300 } },
  { pattern: /chocolate.*tart|ganache.*tart|clock strikes/i, est: { calories: 450, carbs: 50, fat: 25, protein: 6, sugar: 38, fiber: 3, sodium: 200 } },
  { pattern: /panna cotta/i, est: { calories: 350, carbs: 35, fat: 20, protein: 4, sugar: 28, fiber: 1, sodium: 100 } },
  { pattern: /malva pudding/i, est: { calories: 450, carbs: 55, fat: 20, protein: 5, sugar: 40, fiber: 1, sodium: 200 } },
  { pattern: /brigadeiro/i, est: { calories: 400, carbs: 48, fat: 20, protein: 5, sugar: 35, fiber: 2, sodium: 150 } },
  { pattern: /floating island|meringue/i, est: { calories: 300, carbs: 45, fat: 10, protein: 5, sugar: 38, fiber: 1, sodium: 100 } },
  { pattern: /master'?s cupcake cocktail/i, est: { calories: 280, carbs: 25, fat: 3, protein: 1, sugar: 22, fiber: 0, sodium: 15 } },
  { pattern: /cupcake/i, est: { calories: 450, carbs: 55, fat: 22, protein: 5, sugar: 40, fiber: 1, sodium: 300 } },
  { pattern: /cinnamon roll/i, est: { calories: 500, carbs: 65, fat: 22, protein: 7, sugar: 35, fiber: 2, sodium: 400 } },
  { pattern: /creme brulee croissant/i, est: { calories: 400, carbs: 40, fat: 22, protein: 6, sugar: 20, fiber: 1, sodium: 250 } },
  { pattern: /caramel apple doughnut/i, est: { calories: 350, carbs: 42, fat: 18, protein: 4, sugar: 22, fiber: 1, sodium: 300 } },
  { pattern: /caramel apple/i, est: { calories: 450, carbs: 65, fat: 18, protein: 4, sugar: 55, fiber: 3, sodium: 150 } },
  { pattern: /cereal treat|crisp.*rice/i, est: { calories: 300, carbs: 50, fat: 10, protein: 3, sugar: 25, fiber: 0, sodium: 200 } },
  { pattern: /cake pop/i, est: { calories: 200, carbs: 28, fat: 10, protein: 2, sugar: 22, fiber: 0, sodium: 100 } },
  { pattern: /large.*cookie|chocolate chip cookie/i, est: { calories: 350, carbs: 48, fat: 16, protein: 4, sugar: 28, fiber: 1, sodium: 250 } },
  { pattern: /brownie pie|brownie/i, est: { calories: 400, carbs: 50, fat: 20, protein: 5, sugar: 35, fiber: 2, sodium: 200 } },
  { pattern: /fudge/i, est: { calories: 250, carbs: 35, fat: 12, protein: 2, sugar: 30, fiber: 1, sodium: 100 } },
  { pattern: /beignet/i, est: { calories: 350, carbs: 45, fat: 16, protein: 5, sugar: 20, fiber: 1, sodium: 300 } },
  { pattern: /doughnut|donut/i, est: { calories: 350, carbs: 42, fat: 18, protein: 4, sugar: 22, fiber: 1, sodium: 300 } },
  { pattern: /s'mores cake|s'mores tart/i, est: { calories: 450, carbs: 55, fat: 22, protein: 5, sugar: 38, fiber: 1, sodium: 250 } },
  { pattern: /berry.*pie|lemonade pie/i, est: { calories: 350, carbs: 50, fat: 14, protein: 3, sugar: 35, fiber: 2, sodium: 200 } },
  { pattern: /bread pudding/i, est: { calories: 500, carbs: 60, fat: 22, protein: 8, sugar: 40, fiber: 1, sodium: 350 } },
  { pattern: /red velvet/i, est: { calories: 400, carbs: 50, fat: 18, protein: 5, sugar: 35, fiber: 1, sodium: 300 } },
  { pattern: /toffee.*brownie/i, est: { calories: 400, carbs: 50, fat: 20, protein: 5, sugar: 35, fiber: 1, sodium: 200 } },
  { pattern: /churro/i, est: { calories: 300, carbs: 40, fat: 14, protein: 3, sugar: 18, fiber: 1, sodium: 250 } },
  { pattern: /cheshire cat tail/i, est: { calories: 350, carbs: 45, fat: 16, protein: 4, sugar: 25, fiber: 1, sodium: 250 } },
  { pattern: /build.*popcorn|caramel.*popcorn/i, est: { calories: 500, carbs: 65, fat: 22, protein: 5, sugar: 40, fiber: 2, sodium: 350 } },
  { pattern: /mystic treasure|kalamansi/i, est: { calories: 350, carbs: 40, fat: 18, protein: 4, sugar: 30, fiber: 1, sodium: 120 } },

  // Beverages (most specific first!)
  { pattern: /bottled water|dasani|aquafina|water$/i, est: { calories: 0, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0 } },
  { pattern: /brewed coffee|drip coffee|black coffee/i, est: { calories: 5, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 5 } },
  { pattern: /hot chocolate/i, est: { calories: 250, carbs: 35, fat: 8, protein: 4, sugar: 28, fiber: 2, sodium: 150 } },
  { pattern: /sauvignon blanc|chardonnay|pinot grigio|riesling|white wine/i, est: { calories: 120, carbs: 4, fat: 0, protein: 0, sugar: 2, fiber: 0, sodium: 5 } },
  { pattern: /cabernet|merlot|pinot noir|red wine|syrah|malbec/i, est: { calories: 125, carbs: 4, fat: 0, protein: 0, sugar: 1, fiber: 0, sodium: 5 } },
  { pattern: /sparkling wine|champagne|prosecco/i, est: { calories: 120, carbs: 4, fat: 0, protein: 0, sugar: 2, fiber: 0, sodium: 5 } },
  { pattern: /wine flight/i, est: { calories: 360, carbs: 12, fat: 0, protein: 0, sugar: 5, fiber: 0, sodium: 15 } },
  { pattern: /bud light/i, est: { calories: 110, carbs: 7, fat: 0, protein: 1, sugar: 0, fiber: 0, sodium: 10 } },
  { pattern: /sam adams|boston lager/i, est: { calories: 180, carbs: 18, fat: 0, protein: 2, sugar: 1, fiber: 0, sodium: 10 } },
  { pattern: /draft beer/i, est: { calories: 180, carbs: 15, fat: 0, protein: 2, sugar: 1, fiber: 0, sodium: 10 } },
  { pattern: /coca.cola fountain|fountain drink/i, est: { calories: 240, carbs: 65, fat: 0, protein: 0, sugar: 65, fiber: 0, sodium: 50 } },
  { pattern: /lefou'?s brew/i, est: { calories: 250, carbs: 60, fat: 1, protein: 1, sugar: 55, fiber: 0, sodium: 30 } },
  { pattern: /i lava you|ice cream float|root beer float|coca.cola float/i, est: { calories: 350, carbs: 55, fat: 8, protein: 3, sugar: 50, fiber: 0, sodium: 60 } },
  { pattern: /slushy|slush/i, est: { calories: 200, carbs: 50, fat: 0, protein: 0, sugar: 48, fiber: 0, sodium: 20 } },
  { pattern: /white rabbit/i, est: { calories: 250, carbs: 35, fat: 5, protein: 2, sugar: 28, fiber: 0, sodium: 40 } },
  { pattern: /cold brew|iced coffee/i, est: { calories: 150, carbs: 25, fat: 3, protein: 2, sugar: 20, fiber: 0, sodium: 30 } },
  { pattern: /lemonade/i, est: { calories: 200, carbs: 50, fat: 0, protein: 0, sugar: 48, fiber: 0, sodium: 20 } },
  { pattern: /cucumber.*soda|cucumber.*lime/i, est: { calories: 150, carbs: 38, fat: 0, protein: 0, sugar: 35, fiber: 0, sodium: 25 } },
  { pattern: /master'?s cupcake cocktail/i, est: { calories: 280, carbs: 25, fat: 3, protein: 1, sugar: 22, fiber: 0, sodium: 15 } },
  { pattern: /margarita|cocktail/i, est: { calories: 280, carbs: 30, fat: 0, protein: 0, sugar: 25, fiber: 0, sodium: 10 } },
  { pattern: /jungle bird/i, est: { calories: 220, carbs: 22, fat: 0, protein: 0, sugar: 20, fiber: 0, sodium: 10 } },
  { pattern: /coconut.*mango.*cocktail/i, est: { calories: 260, carbs: 30, fat: 3, protein: 1, sugar: 28, fiber: 0, sodium: 15 } },
  { pattern: /spiced ale|craft ale|beer|ale/i, est: { calories: 200, carbs: 18, fat: 0, protein: 2, sugar: 3, fiber: 0, sodium: 15 } },
  { pattern: /seaside serenade|pina colada slushy/i, est: { calories: 250, carbs: 55, fat: 2, protein: 0, sugar: 50, fiber: 0, sodium: 20 } },
]

function estimateNutrition(name: string, description: string, category: string): NutritionEstimate {
  // Try matching against name only first (avoids false positives from description keywords)
  for (const profile of FOOD_PROFILES) {
    if (profile.pattern.test(name)) {
      return profile.est
    }
  }

  // Then try name + description combined
  const combined = `${name} ${description}`
  for (const profile of FOOD_PROFILES) {
    if (profile.pattern.test(combined)) {
      return profile.est
    }
  }

  // Fallback by category
  switch (category) {
    case 'entree': return { calories: 600, carbs: 40, fat: 25, protein: 30, sugar: 5, fiber: 3, sodium: 900 }
    case 'dessert': return { calories: 400, carbs: 50, fat: 18, protein: 4, sugar: 35, fiber: 1, sodium: 200 }
    case 'snack': return { calories: 300, carbs: 35, fat: 14, protein: 8, sugar: 10, fiber: 2, sodium: 500 }
    case 'beverage': return { calories: 200, carbs: 45, fat: 1, protein: 1, sugar: 40, fiber: 0, sodium: 30 }
    case 'side': return { calories: 250, carbs: 25, fat: 12, protein: 8, sugar: 4, fiber: 3, sodium: 500 }
    default: return { calories: 400, carbs: 35, fat: 18, protein: 15, sugar: 8, fiber: 2, sodium: 600 }
  }
}

interface RawItem {
  land: string
  restaurant: string
  name: string
  description: string
  price: number
  category: string
  type: string
  vegetarian: boolean
  isFried: boolean
}

interface RawPark {
  id: string
  name: string
  subtitle?: string
  lands: string[]
  menuItems: RawItem[]
}

async function main() {
  console.log(`Phase 3 Import — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`)

  const raw = JSON.parse(readFileSync(resolve(inputFile), 'utf-8'))
  const parks: RawPark[] = raw.parks

  // Prepare additions log
  const additionsDir = resolve(__dirname, '../audit/additions')
  if (!existsSync(additionsDir)) mkdirSync(additionsDir, { recursive: true })

  const csvRows: string[] = [
    'action,park_name,restaurant_name,land,item_name,category,price,calories,carbs,fat,protein,sugar,fiber,sodium,confidence_score,source'
  ]

  let totalNewRestaurants = 0
  let totalNewItems = 0
  let totalSkipped = 0

  for (const park of parks) {
    console.log(`=== ${park.name} ===\n`)

    // Find the park in DB
    const { data: dbPark } = await supabase
      .from('parks')
      .select('id, name')
      .eq('name', park.name)
      .single()

    if (!dbPark) {
      console.error(`  Park "${park.name}" not found in DB — skipping`)
      continue
    }

    // Group items by restaurant
    const restMap = new Map<string, { land: string; items: RawItem[] }>()
    for (const item of park.menuItems) {
      const key = item.restaurant
      if (!restMap.has(key)) restMap.set(key, { land: item.land, items: [] })
      restMap.get(key)!.items.push(item)
    }

    for (const [restName, { land, items }] of restMap) {
      // Check if restaurant exists
      const { data: existingRest } = await supabase
        .from('restaurants')
        .select('id')
        .eq('park_id', dbPark.id)
        .eq('name', restName)
        .single()

      let restId: string
      if (existingRest) {
        restId = existingRest.id
      } else {
        if (DRY_RUN) {
          console.log(`  NEW restaurant: ${restName} (${land})`)
          restId = 'dry-run-id'
          totalNewRestaurants++

          csvRows.push([
            'new_restaurant', park.name, restName, land,
            '', '', '', '', '', '', '', '', '', '', '', ''
          ].join(','))
        } else {
          const { data: newRest, error } = await supabase
            .from('restaurants')
            .insert({ park_id: dbPark.id, name: restName, land })
            .select('id')
            .single()
          if (error) {
            console.error(`  Restaurant insert error for ${restName}:`, error.message)
            continue
          }
          restId = newRest.id
          totalNewRestaurants++

          csvRows.push([
            'new_restaurant', park.name, restName, land,
            '', '', '', '', '', '', '', '', '', '', '', ''
          ].join(','))
        }
      }

      // Get existing items for this restaurant
      let existingItemNames = new Set<string>()
      if (!DRY_RUN || existingRest) {
        const { data: existingItems } = await supabase
          .from('menu_items')
          .select('name')
          .eq('restaurant_id', existingRest?.id || restId)

        existingItemNames = new Set((existingItems ?? []).map(i => i.name.toLowerCase()))
      }

      for (const item of items) {
        if (existingItemNames.has(item.name.toLowerCase())) {
          totalSkipped++
          continue
        }

        const est = estimateNutrition(item.name, item.description, item.category)

        if (DRY_RUN) {
          console.log(`    + ${item.name} [${item.category}] — ${est.calories} cal, ${est.carbs}g carbs`)
          totalNewItems++
        } else {
          const { data: menuRow, error: menuErr } = await supabase
            .from('menu_items')
            .insert({
              restaurant_id: restId,
              name: item.name,
              description: item.description || null,
              category: item.category,
              price: item.price || null,
              is_fried: item.isFried,
              is_vegetarian: item.vegetarian,
            })
            .select('id')
            .single()

          if (menuErr) {
            console.error(`    Menu item error for ${item.name}:`, menuErr.message)
            continue
          }

          const { error: nutErr } = await supabase
            .from('nutritional_data')
            .insert({
              menu_item_id: menuRow.id,
              calories: est.calories,
              carbs: est.carbs,
              fat: est.fat,
              protein: est.protein,
              sugar: est.sugar,
              fiber: est.fiber,
              sodium: est.sodium,
              source: 'crowdsourced',
              confidence_score: 30,
            })

          if (nutErr) {
            console.error(`    Nutrition error for ${item.name}:`, nutErr.message)
          }

          totalNewItems++
          console.log(`    + ${item.name} [${item.category}] — ${est.calories} cal`)
        }

        const csvSafe = (s: string) => `"${s.replace(/"/g, '""')}"`
        csvRows.push([
          'new_item',
          csvSafe(park.name),
          csvSafe(restName),
          csvSafe(land),
          csvSafe(item.name),
          item.category,
          item.price || '',
          est.calories,
          est.carbs,
          est.fat,
          est.protein,
          est.sugar,
          est.fiber,
          est.sodium,
          30,
          'crowdsourced'
        ].join(','))
      }
    }
  }

  // Write additions log
  const parkSlug = parks[0]?.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, '') || 'unknown'
  const csvPath = resolve(additionsDir, `${parkSlug}_additions.csv`)
  writeFileSync(csvPath, csvRows.join('\n'), 'utf-8')
  console.log(`\nAdditions log: ${csvPath}`)

  console.log(`\n=== Summary ===`)
  console.log(`New restaurants: ${totalNewRestaurants}`)
  console.log(`New items: ${totalNewItems}`)
  console.log(`Skipped (duplicate): ${totalSkipped}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN — no changes made' : 'LIVE — all changes applied'}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
