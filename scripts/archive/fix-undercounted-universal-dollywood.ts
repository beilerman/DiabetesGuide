import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DRY_RUN = process.argv.includes('--dry-run');

// Correct nutrition values based on food type
const CORRECTIONS: Record<string, any> = {
  // Hot dogs with buns
  'chili cheese hot dog': { calories: 480, carbs: 42, fat: 25, protein: 20, sugar: 7, fiber: 3, sodium: 1200 },
  'chili dog': { calories: 420, carbs: 40, fat: 20, protein: 17, sugar: 6, fiber: 3, sodium: 1100 },
  'all beef hot dog': { calories: 350, carbs: 35, fat: 18, protein: 14, sugar: 5, fiber: 2, sodium: 900 },
  'hot dog': { calories: 350, carbs: 35, fat: 18, protein: 14, sugar: 5, fiber: 2, sodium: 900 },
  'foot-long hot dog': { calories: 550, carbs: 50, fat: 25, protein: 22, sugar: 8, fiber: 3, sodium: 1400 },

  // Burgers with buns
  'bacon cheeseburger': { calories: 650, carbs: 48, fat: 35, protein: 35, sugar: 9, fiber: 2, sodium: 1200 },
  'cheeseburger': { calories: 550, carbs: 45, fat: 28, protein: 30, sugar: 8, fiber: 2, sodium: 1000 },
  'burger': { calories: 500, carbs: 42, fat: 25, protein: 28, sugar: 7, fiber: 2, sodium: 900 },
};

async function fixUndercounted() {
  console.log(`=== ${DRY_RUN ? 'DRY RUN:' : 'LIVE:'} Fix Undercounted Universal & Dollywood Items ===\n`);

  // Get all items from problematic parks
  const problematicParks = [
    'Universal Studios Florida',
    'Universal\'s Islands of Adventure',
    'Universal CityWalk',
    'Dollywood'
  ];

  const { data: items } = await sb
    .from('menu_items')
    .select(`
      id, name, category,
      restaurant:restaurants!inner(name, park:parks!inner(name)),
      nutritional_data(id, calories, carbs, fat, protein, sugar, fiber, sodium)
    `)
    .in('restaurant.park.name', problematicParks)
    .limit(3000);

  if (!items) {
    console.log('No items found');
    return;
  }

  console.log(`Loaded ${items.length} items from Universal & Dollywood\n`);

  let fixed = 0;
  const fixes: any[] = [];

  for (const item of items) {
    const ndArray = (item.nutritional_data as any);
    if (!ndArray || !Array.isArray(ndArray) || ndArray.length === 0) continue;
    const nd = ndArray[0]; // Get first nutrition record
    if (!nd || !nd.id) continue;

    const name = item.name.toLowerCase();
    const rest = (item.restaurant as any);
    const park = rest?.park as any;

    // Skip if already has reasonable values
    if (nd.calories > 400 && nd.carbs > 30) continue;

    // Check against correction patterns
    let correction = null;
    for (const [key, value] of Object.entries(CORRECTIONS)) {
      if (name.includes(key)) {
        correction = value;
        break;
      }
    }

    if (!correction) continue;

    // Only fix if current values are suspiciously low
    const shouldFix = (
      (nd.calories < 300 && name.includes('hot dog')) ||
      (nd.calories < 400 && name.includes('burger')) ||
      (nd.carbs < 25 && (name.includes('hot dog') || name.includes('burger')))
    );

    if (shouldFix) {
      fixes.push({
        id: nd.id,
        name: item.name,
        restaurant: rest?.name,
        park: park?.name,
        old: { calories: nd.calories, carbs: nd.carbs, fat: nd.fat, protein: nd.protein },
        new: correction
      });
    }
  }

  console.log(`Found ${fixes.length} items to fix\n`);

  if (fixes.length === 0) {
    console.log('No items need fixing!');
    return;
  }

  // Show preview
  console.log('Preview (first 30):');
  for (const fix of fixes.slice(0, 30)) {
    console.log(`${fix.name} @ ${fix.restaurant} (${fix.park})`);
    console.log(`  OLD: ${fix.old.calories} cal, ${fix.old.carbs}g carbs`);
    console.log(`  NEW: ${fix.new.calories} cal, ${fix.new.carbs}g carbs`);
  }

  if (!DRY_RUN) {
    console.log(`\nApplying fixes...`);
    for (const fix of fixes) {
      await sb
        .from('nutritional_data')
        .update({
          calories: fix.new.calories,
          carbs: fix.new.carbs,
          fat: fix.new.fat,
          protein: fix.new.protein,
          sugar: fix.new.sugar,
          fiber: fix.new.fiber,
          sodium: fix.new.sodium,
          source: 'crowdsourced',
          confidence_score: 45  // Fixed estimate
        })
        .eq('id', fix.id);
      fixed++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Fixed: ${fixed}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN - no changes applied' : 'LIVE - changes applied to database'}`);
}

fixUndercounted();
