/**
 * Enhanced allergen detection using expanded keyword lists
 * Now that 100% of items have descriptions, we can detect more allergens
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

const url = envVars['SUPABASE_URL'] || process.env.SUPABASE_URL!
const key = envVars['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, key)

// Expanded allergen keywords with severity levels
const ALLERGEN_KEYWORDS: Record<string, { keywords: string[]; severity: 'contains' | 'may_contain' }[]> = {
  'milk': [
    {
      keywords: [
        // Direct dairy
        'milk', 'cream', 'cheese', 'butter', 'yogurt', 'gelato', 'ice cream',
        'whipped', 'custard', 'pudding', 'fudge', 'caramel',
        // Cheese types
        'mozzarella', 'cheddar', 'parmesan', 'provolone', 'swiss', 'gouda',
        'brie', 'feta', 'ricotta', 'mascarpone', 'gorgonzola', 'blue cheese',
        'pepper jack', 'american cheese', 'monterey', 'cotija', 'queso',
        'fontina', 'gruyere', 'asiago', 'romano', 'burrata', 'havarti',
        // Sauces with dairy
        'alfredo', 'béchamel', 'bechamel', 'carbonara', 'hollandaise',
        'ranch', 'caesar', 'creamy', 'au gratin', 'scalloped',
        // Other dairy products
        'sour cream', 'crème', 'creme', 'fraiche', 'latte', 'cappuccino',
        'mocha', 'macchiato', 'dulce de leche', 'tres leches',
        'cheesecake', 'tiramisu', 'panna cotta', 'mousse',
        // Milk types
        'buttermilk', 'half and half', 'evaporated milk', 'condensed milk',
        // Items that typically contain dairy
        'milkshake', 'shake', 'smoothie', 'float', 'sundae',
        'frosting', 'icing', 'glaze',
      ],
      severity: 'contains'
    },
    {
      keywords: ['chocolate', 'brownie', 'cookie', 'cake', 'pastry', 'croissant', 'muffin', 'scone'],
      severity: 'may_contain'
    }
  ],
  'wheat': [
    {
      keywords: [
        // Breads
        'bread', 'bun', 'roll', 'bagel', 'baguette', 'ciabatta', 'focaccia',
        'sourdough', 'brioche', 'croissant', 'english muffin', 'pita',
        'naan', 'flatbread', 'toast', 'crouton', 'breadstick', 'crostini',
        // Pasta/noodles
        'pasta', 'noodle', 'spaghetti', 'fettuccine', 'penne', 'linguine',
        'macaroni', 'lasagna', 'ravioli', 'gnocchi', 'udon', 'ramen',
        'lo mein', 'chow mein', 'spätzle', 'orzo',
        // Wraps
        'wrap', 'tortilla', 'burrito', 'quesadilla', 'taco', 'enchilada',
        // Breaded/fried
        'breaded', 'battered', 'fried', 'crispy', 'crusted', 'tempura',
        'panko', 'schnitzel', 'katsu',
        // Baked goods
        'cake', 'cookie', 'brownie', 'muffin', 'scone', 'biscuit',
        'pastry', 'pie', 'tart', 'danish', 'strudel', 'turnover',
        'donut', 'doughnut', 'churro', 'funnel cake', 'crepe',
        'waffle', 'pancake', 'french toast',
        'pretzel', 'cracker', 'graham',
        // Pizza
        'pizza', 'calzone', 'stromboli',
        // Sandwiches
        'sandwich', 'sub', 'hoagie', 'panini', 'slider', 'po boy',
        // Other wheat items
        'dumpling', 'wonton', 'egg roll', 'spring roll', 'pot sticker',
        'gyoza', 'pierogi', 'empanada', 'samosa',
        'flour', 'wheat', 'seitan',
        // Sauces thickened with flour
        'gravy', 'roux',
      ],
      severity: 'contains'
    },
  ],
  'eggs': [
    {
      keywords: [
        // Direct egg
        'egg', 'eggs', 'omelette', 'omelet', 'frittata', 'quiche',
        'scrambled', 'poached', 'fried egg', 'sunny side', 'over easy',
        'hard boiled', 'soft boiled', 'deviled',
        // Egg-based sauces
        'mayo', 'mayonnaise', 'aioli', 'hollandaise', 'bearnaise',
        'caesar', 'tartar sauce',
        // Egg-based desserts
        'custard', 'creme brulee', 'flan', 'meringue', 'souffle',
        'zabaglione', 'sabayon',
        // Items typically containing eggs
        'french toast', 'benedict', 'carbonara',
        'brioche', 'challah',
      ],
      severity: 'contains'
    },
    {
      keywords: ['cake', 'cookie', 'brownie', 'muffin', 'pastry', 'waffle', 'pancake', 'breaded', 'battered'],
      severity: 'may_contain'
    }
  ],
  'soy': [
    {
      keywords: [
        'soy', 'tofu', 'tempeh', 'edamame', 'miso', 'natto',
        'soy sauce', 'shoyu', 'tamari', 'teriyaki',
        'soy milk', 'soya',
      ],
      severity: 'contains'
    },
    {
      keywords: ['asian', 'chinese', 'japanese', 'korean', 'thai', 'vietnamese', 'stir fry', 'wok'],
      severity: 'may_contain'
    }
  ],
  'peanuts': [
    {
      keywords: [
        'peanut', 'peanuts', 'peanut butter', 'groundnut',
        'goober', 'arachis',
        // Thai/Asian dishes often contain peanuts
        'pad thai', 'satay', 'kung pao',
      ],
      severity: 'contains'
    },
    {
      keywords: ['thai', 'asian', 'trail mix'],
      severity: 'may_contain'
    }
  ],
  'tree_nuts': [
    {
      keywords: [
        // Common tree nuts
        'almond', 'cashew', 'walnut', 'pecan', 'pistachio',
        'hazelnut', 'filbert', 'macadamia', 'brazil nut',
        'chestnut', 'pine nut', 'pignoli',
        // Nut products
        'praline', 'marzipan', 'frangipane', 'gianduja',
        'nutella', 'nut butter', 'almond butter', 'cashew butter',
        'almond milk', 'cashew milk', 'hazelnut spread',
        // Desserts with nuts
        'baklava', 'biscotti',
      ],
      severity: 'contains'
    },
    {
      keywords: ['pesto', 'trail mix', 'granola'],
      severity: 'may_contain'
    }
  ],
  'fish': [
    {
      keywords: [
        // Common fish
        'fish', 'salmon', 'tuna', 'cod', 'tilapia', 'halibut',
        'mahi', 'grouper', 'snapper', 'bass', 'trout', 'catfish',
        'swordfish', 'flounder', 'sole', 'perch', 'walleye',
        'sardine', 'anchovy', 'herring', 'mackerel', 'eel',
        // Prepared fish
        'sashimi', 'sushi', 'ceviche', 'poke', 'lox', 'gravlax',
        'fish and chips', 'fish taco', 'fish fry',
        'smoked fish', 'gefilte',
        // Sauces with fish
        'worcestershire', 'fish sauce', 'nuoc mam',
        'caesar' // traditional caesar has anchovies
      ],
      severity: 'contains'
    },
  ],
  'shellfish': [
    {
      keywords: [
        // Crustaceans
        'shrimp', 'prawn', 'crab', 'lobster', 'crawfish', 'crayfish',
        'langostino', 'langoustine', 'scampi',
        // Mollusks
        'clam', 'mussel', 'oyster', 'scallop', 'abalone',
        'snail', 'escargot', 'conch', 'whelk', 'periwinkle',
        // Cephalopods
        'squid', 'calamari', 'octopus', 'cuttlefish',
        // Prepared dishes
        'seafood', 'surf and turf', 'cioppino', 'bouillabaisse',
        'paella', 'gumbo', 'jambalaya', 'etouffee',
        'crab cake', 'lobster roll', 'shrimp cocktail',
        'clam chowder', 'oyster rockefeller',
      ],
      severity: 'contains'
    },
  ],
  'sesame': [
    // Sesame became a major allergen in the US in 2023
    {
      keywords: [
        'sesame', 'tahini', 'hummus', 'halvah', 'halva',
        'sesame oil', 'sesame seed', 'goma',
        // Middle Eastern foods often contain sesame
        'falafel', 'baba ghanoush', 'baba ganoush',
      ],
      severity: 'contains'
    },
    {
      keywords: ['mediterranean', 'middle eastern', 'lebanese', 'israeli', 'greek', 'turkish', 'asian', 'sushi'],
      severity: 'may_contain'
    }
  ],
  'gluten': [
    // Not a true allergen but important for celiac/gluten sensitivity
    {
      keywords: [
        'wheat', 'barley', 'rye', 'malt', 'triticale',
        'beer', 'ale', 'lager', 'stout', 'porter', 'pilsner',
        'bread', 'pasta', 'noodle', 'flour', 'breaded', 'battered',
        'cake', 'cookie', 'brownie', 'pastry', 'pie', 'muffin',
        'pretzel', 'cracker', 'croissant', 'bagel',
        'pizza', 'wrap', 'tortilla', 'pita',
        'soy sauce', 'teriyaki', 'gravy',
      ],
      severity: 'contains'
    },
  ],
}

// Items that are naturally free of certain allergens (to avoid false positives)
const EXCLUDE_PATTERNS: Record<string, RegExp[]> = {
  'milk': [
    /dairy[- ]?free/i, /vegan/i, /non[- ]?dairy/i, /lactose[- ]?free/i,
    /oat\s*milk/i, /almond\s*milk/i, /soy\s*milk/i, /coconut\s*milk/i,
  ],
  'eggs': [
    /egg[- ]?free/i, /vegan/i,
  ],
  'gluten': [
    /gluten[- ]?free/i, /gf\b/i, /celiac/i,
  ],
}

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
  console.log('Fetching menu items and existing allergens...\n')

  const items = await fetchAll('menu_items', 'id, name, description, category')
  const existing = await fetchAll('allergens', 'menu_item_id, allergen_type')

  console.log(`Total menu items: ${items.length}`)
  console.log(`Existing allergen records: ${existing.length}`)

  // Build set of existing records
  const existingSet = new Set(
    existing.map((r: any) => `${r.menu_item_id}::${r.allergen_type}`)
  )

  const toInsert: { menu_item_id: string; allergen_type: string; severity: string }[] = []
  const itemsWithNewAllergens = new Set<string>()
  const allergenCounts: Record<string, number> = {}

  for (const item of items) {
    const text = `${item.name || ''} ${item.description || ''} ${item.category || ''}`.toLowerCase()

    for (const [allergen, rules] of Object.entries(ALLERGEN_KEYWORDS)) {
      const key = `${item.id}::${allergen}`
      if (existingSet.has(key)) continue

      // Check exclusion patterns
      const excludePatterns = EXCLUDE_PATTERNS[allergen] || []
      const isExcluded = excludePatterns.some(pattern => pattern.test(text))
      if (isExcluded) continue

      for (const rule of rules) {
        const matched = rule.keywords.some(kw => {
          // Use word boundary matching for short keywords to avoid false positives
          if (kw.length <= 3) {
            const regex = new RegExp(`\\b${kw}\\b`, 'i')
            return regex.test(text)
          }
          return text.includes(kw)
        })

        if (matched) {
          toInsert.push({
            menu_item_id: item.id,
            allergen_type: allergen,
            severity: rule.severity
          })
          itemsWithNewAllergens.add(item.id)
          allergenCounts[allergen] = (allergenCounts[allergen] || 0) + 1
          break
        }
      }
    }
  }

  console.log(`\nNew allergens to add: ${toInsert.length}`)
  console.log(`Items affected: ${itemsWithNewAllergens.size}`)
  console.log('\nBy allergen type:')
  for (const [allergen, count] of Object.entries(allergenCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${allergen}: ${count}`)
  }

  if (toInsert.length === 0) {
    console.log('\nNo new allergens to add.')
    return
  }

  // Insert in batches
  console.log('\nInserting allergen records...')
  let inserted = 0
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500)
    const { error } = await supabase.from('allergens').insert(chunk)
    if (error) {
      console.error(`Insert error at batch ${Math.floor(i / 500)}:`, error.message)
    } else {
      inserted += chunk.length
    }
  }

  console.log(`\n✓ Inserted ${inserted} allergen records`)

  // Final stats
  const { count: totalAllergens } = await supabase
    .from('allergens')
    .select('*', { count: 'exact', head: true })

  const { data: itemsWithAllergens } = await supabase
    .from('allergens')
    .select('menu_item_id')

  const uniqueItems = new Set(itemsWithAllergens?.map((a: any) => a.menu_item_id))

  console.log(`\nFinal allergen coverage:`)
  console.log(`  Total allergen records: ${totalAllergens}`)
  console.log(`  Items with allergens: ${uniqueItems.size} (${(uniqueItems.size / items.length * 100).toFixed(1)}%)`)
}

main().catch(console.error)
