import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Nutrition estimates based on food type
const ESTIMATES: Record<string, any> = {
  // Hot dogs
  'hot dog': { calories: 350, carbs: 35, fat: 18, protein: 14, sugar: 5, fiber: 2, sodium: 900 },
  'chili cheese hot dog': { calories: 480, carbs: 42, fat: 25, protein: 20, sugar: 7, fiber: 3, sodium: 1200 },
  'chili dog': { calories: 420, carbs: 40, fat: 20, protein: 17, sugar: 6, fiber: 3, sodium: 1100 },
  'loaded hot dog': { calories: 500, carbs: 45, fat: 28, protein: 18, sugar: 8, fiber: 2, sodium: 1300 },
  'foot-long hot dog': { calories: 550, carbs: 50, fat: 25, protein: 22, sugar: 8, fiber: 3, sodium: 1400 },

  // Burgers
  'cheeseburger': { calories: 550, carbs: 45, fat: 28, protein: 30, sugar: 8, fiber: 2, sodium: 1000 },
  'bacon cheeseburger': { calories: 650, carbs: 48, fat: 35, protein: 35, sugar: 9, fiber: 2, sodium: 1200 },
  'burger': { calories: 500, carbs: 42, fat: 25, protein: 28, sugar: 7, fiber: 2, sodium: 900 },
  'angus burger': { calories: 700, carbs: 50, fat: 38, protein: 40, sugar: 9, fiber: 3, sodium: 1100 },
  'bbq burger': { calories: 620, carbs: 52, fat: 30, protein: 32, sugar: 12, fiber: 2, sodium: 1150 },
  'plant-based burger': { calories: 450, carbs: 48, fat: 20, protein: 25, sugar: 8, fiber: 5, sodium: 850 },

  // Sandwiches
  'sandwich': { calories: 450, carbs: 45, fat: 18, protein: 25, sugar: 6, fiber: 3, sodium: 950 },
  'chicken sandwich': { calories: 480, carbs: 48, fat: 20, protein: 28, sugar: 7, fiber: 2, sodium: 1000 },
  'pulled pork sandwich': { calories: 550, carbs: 52, fat: 22, protein: 32, sugar: 12, fiber: 2, sodium: 1100 },
  'cuban sandwich': { calories: 500, carbs: 46, fat: 22, protein: 30, sugar: 6, fiber: 2, sodium: 1400 },
  'grilled cheese sandwich': { calories: 420, carbs: 38, fat: 24, protein: 16, sugar: 5, fiber: 2, sodium: 850 },
  'turkey club sandwich': { calories: 480, carbs: 44, fat: 20, protein: 28, sugar: 6, fiber: 3, sodium: 1200 },
};

async function fixNullNutrition() {
  console.log('=== Fixing Null Nutrition Data ===\n');

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

  console.log(`Found ${nullItems.length} items with null nutrition data\n`);

  const fixes: any[] = [];

  for (const item of nullItems) {
    const name = item.name.toLowerCase();
    let estimate = null;

    // Try to match against our estimates
    for (const [key, value] of Object.entries(ESTIMATES)) {
      if (name.includes(key)) {
        estimate = value;
        break;
      }
    }

    if (estimate) {
      fixes.push({
        item_id: item.id,
        name: item.name,
        estimate
      });
    }
  }

  console.log(`Can estimate nutrition for ${fixes.length}/${nullItems.length} items\n`);

  if (fixes.length === 0) {
    console.log('No items matched estimation patterns');
    return;
  }

  console.log('Preview of fixes (first 20):');
  for (const fix of fixes.slice(0, 20)) {
    console.log(`${fix.name}: ${fix.estimate.calories} cal, ${fix.estimate.carbs}g carbs`);
  }

  console.log(`\n--dry-run mode, no changes applied`);
  console.log(`\nTo apply fixes, modify script to insert nutritional_data records`);
}

fixNullNutrition();
