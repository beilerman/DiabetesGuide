import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Nutrition estimates based on food type
const ESTIMATES: Record<string, any> = {
  // Hot dogs (most specific first)
  'chili cheese hot dog': { calories: 480, carbs: 42, fat: 25, protein: 20, sugar: 7, fiber: 3, sodium: 1200 },
  'chili dog': { calories: 420, carbs: 40, fat: 20, protein: 17, sugar: 6, fiber: 3, sodium: 1100 },
  'loaded hot dog': { calories: 500, carbs: 45, fat: 28, protein: 18, sugar: 8, fiber: 2, sodium: 1300 },
  'foot-long hot dog': { calories: 550, carbs: 50, fat: 25, protein: 22, sugar: 8, fiber: 3, sodium: 1400 },
  'hot dog': { calories: 350, carbs: 35, fat: 18, protein: 14, sugar: 5, fiber: 2, sodium: 900 },

  // Burgers (most specific first)
  'bacon cheeseburger': { calories: 650, carbs: 48, fat: 35, protein: 35, sugar: 9, fiber: 2, sodium: 1200 },
  'bbq burger': { calories: 620, carbs: 52, fat: 30, protein: 32, sugar: 12, fiber: 2, sodium: 1150 },
  'angus burger': { calories: 700, carbs: 50, fat: 38, protein: 40, sugar: 9, fiber: 3, sodium: 1100 },
  'plant-based burger': { calories: 450, carbs: 48, fat: 20, protein: 25, sugar: 8, fiber: 5, sodium: 850 },
  'impossible burger': { calories: 450, carbs: 48, fat: 20, protein: 25, sugar: 8, fiber: 5, sodium: 850 },
  'veggie burger': { calories: 400, carbs: 45, fat: 16, protein: 20, sugar: 7, fiber: 6, sodium: 750 },
  'cheeseburger': { calories: 550, carbs: 45, fat: 28, protein: 30, sugar: 8, fiber: 2, sodium: 1000 },
  'burger': { calories: 500, carbs: 42, fat: 25, protein: 28, sugar: 7, fiber: 2, sodium: 900 },

  // Sandwiches (most specific first)
  'pulled pork sandwich': { calories: 550, carbs: 52, fat: 22, protein: 32, sugar: 12, fiber: 2, sodium: 1100 },
  'cuban sandwich': { calories: 500, carbs: 46, fat: 22, protein: 30, sugar: 6, fiber: 2, sodium: 1400 },
  'turkey club sandwich': { calories: 480, carbs: 44, fat: 20, protein: 28, sugar: 6, fiber: 3, sodium: 1200 },
  'grilled cheese sandwich': { calories: 420, carbs: 38, fat: 24, protein: 16, sugar: 5, fiber: 2, sodium: 850 },
  'chicken sandwich': { calories: 480, carbs: 48, fat: 20, protein: 28, sugar: 7, fiber: 2, sodium: 1000 },
  'bbq sandwich': { calories: 520, carbs: 50, fat: 22, protein: 28, sugar: 12, fiber: 2, sodium: 1050 },
  'sandwich': { calories: 450, carbs: 45, fat: 18, protein: 25, sugar: 6, fiber: 3, sodium: 950 },
};

const DRY_RUN = process.argv.includes('--dry-run');

async function applyFixes() {
  console.log(`=== ${DRY_RUN ? 'DRY RUN:' : 'LIVE:'} Fixing Null Nutrition Data ===\n`);

  // Get items with null calories in nutritional_data
  const { data: nullItems } = await sb
    .from('menu_items')
    .select('id, name, category, description, nutritional_data(id, calories)')
    .is('nutritional_data.calories', null)
    .limit(2000);

  if (!nullItems || nullItems.length === 0) {
    console.log('No items with null nutrition found!');
    return;
  }

  console.log(`Found ${nullItems.length} items with null calories\n`);

  let fixed = 0;
  let skipped = 0;

  for (const item of nullItems) {
    const name = item.name.toLowerCase();
    let estimate = null;

    // Try to match against our estimates (order matters - most specific first)
    for (const [key, value] of Object.entries(ESTIMATES)) {
      if (name.includes(key)) {
        estimate = value;
        break;
      }
    }

    if (estimate) {
      const nd = (item.nutritional_data as any);
      if (nd && nd.id) {
        if (!DRY_RUN) {
          await sb
            .from('nutritional_data')
            .update({
              calories: estimate.calories,
              carbs: estimate.carbs,
              fat: estimate.fat,
              protein: estimate.protein,
              sugar: estimate.sugar,
              fiber: estimate.fiber,
              sodium: estimate.sodium,
              source: 'crowdsourced',
              confidence_score: 30
            })
            .eq('id', nd.id);
        }
        console.log(`[FIXED] ${item.name}: ${estimate.calories} cal, ${estimate.carbs}g carbs`);
        fixed++;
      }
    } else {
      skipped++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Fixed: ${fixed}`);
  console.log(`Skipped (no pattern match): ${skipped}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN - no changes applied' : 'LIVE - changes applied'}`);
}

applyFixes();
