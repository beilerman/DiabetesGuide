/**
 * Audit Round 12 — Fix remaining HIGH findings + fat=0 pies
 *
 * 1. Scale up 7 undersized "Whole" pizzas (personal-sized at Universal, ~650-730 cal → ~1600-1800)
 * 2. Fix fat=0 on cream/lemonade pies (pastry crust always has fat)
 *
 * Usage: npx tsx scripts/fix-round12.ts [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DRY_RUN = process.argv.includes('--dry-run');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log(`\n=== Audit Round 12: Fix remaining HIGH + pie fat ===`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  let fixed = 0;

  // ────────────────────────────────────────
  // Phase 1: Scale up undersized whole pizzas
  // Universal parks sell personal-sized (~12") "Whole" pizzas.
  // Current values (~650 cal) are per-slice USDA matches.
  // Personal 12" pizza = ~1600-1800 cal. Scale by 2.5x.
  // ────────────────────────────────────────
  console.log('--- Phase 1: Scale up undersized whole pizzas ---');

  const { data: pizzas, error: pErr } = await supabase
    .from('menu_items')
    .select('id, name, restaurant:restaurants(name, park:parks(name)), nutritional_data(id, calories, carbs, fat, protein, sugar, fiber, sodium, confidence_score)')
    .ilike('name', '%Whole%Pizza%');

  if (pErr) { console.error('Query error:', pErr.message); return; }

  for (const pizza of pizzas || []) {
    const nd = (pizza.nutritional_data as any[])?.[0];
    if (!nd || !nd.calories) continue;

    // Skip if already correctly sized (e.g., Pesto Chicken at 2000 cal)
    if (nd.calories >= 1200) {
      console.log(`  [SKIP] ${pizza.name} @ ${(pizza.restaurant as any)?.name}: already ${nd.calories} cal`);
      continue;
    }

    const scale = 2.5;
    const update = {
      calories: Math.round(nd.calories * scale),
      carbs: Math.round(nd.carbs * scale),
      fat: Math.round(nd.fat * scale),
      protein: Math.round(nd.protein * scale),
      sugar: nd.sugar != null ? Math.round(nd.sugar * scale) : null,
      fiber: nd.fiber != null ? Math.round(nd.fiber * scale) : null,
      sodium: nd.sodium != null ? Math.round(nd.sodium * scale) : null,
      confidence_score: 45,
    };

    const label = `${pizza.name} @ ${(pizza.restaurant as any)?.name} (${nd.calories}→${update.calories} cal)`;

    if (DRY_RUN) {
      console.log(`  [DRY] ${label}`);
    } else {
      const { error } = await supabase.from('nutritional_data').update(update).eq('id', nd.id);
      if (error) { console.error(`  FAIL: ${label} — ${error.message}`); continue; }
      console.log(`  [OK]  ${label}`);
    }
    fixed++;
  }

  // ────────────────────────────────────────
  // Phase 2: Fix fat=0 on cream/lemonade pies
  // Lemonade pies have cream/butter pastry crust.
  // fat=0 is clearly wrong — estimate fat from caloric gap.
  // ────────────────────────────────────────
  console.log('\n--- Phase 2: Fix fat=0 on cream/lemonade pies ---');

  const pieFixes = [
    // Strawberry Lemonade Pie: cal 289, C=44, F=0, P=3 → add 12g fat
    // Macro check: 3*4 + 44*4 + 12*9 = 12 + 176 + 108 = 296 ≈ 289 ✓
    { namePattern: '%Strawberry Lemonade Pie%', fat: 12 },
    // Berry Lemonade Pie: cal 350, C=50, F=0, P=3 → add 15g fat
    // Macro check: 3*4 + 50*4 + 15*9 = 12 + 200 + 135 = 347 ≈ 350 ✓
    { namePattern: 'Berry Lemonade Pie%', fat: 15 },
  ];

  for (const fix of pieFixes) {
    const { data: items, error: e } = await supabase
      .from('menu_items')
      .select('id, name, restaurant:restaurants(name), nutritional_data(id, fat, confidence_score)')
      .ilike('name', fix.namePattern);

    if (e) { console.error('Query error:', e.message); continue; }

    for (const item of items || []) {
      const nd = (item.nutritional_data as any[])?.[0];
      if (!nd) continue;

      if (nd.fat > 0) {
        console.log(`  [SKIP] ${item.name} @ ${(item.restaurant as any)?.name}: fat already ${nd.fat}g`);
        continue;
      }

      const label = `${item.name} @ ${(item.restaurant as any)?.name} (fat 0→${fix.fat}g)`;

      if (DRY_RUN) {
        console.log(`  [DRY] ${label}`);
      } else {
        const { error } = await supabase.from('nutritional_data')
          .update({ fat: fix.fat, confidence_score: 45 })
          .eq('id', nd.id);
        if (error) { console.error(`  FAIL: ${label} — ${error.message}`); continue; }
        console.log(`  [OK]  ${label}`);
      }
      fixed++;
    }
  }

  // ────────────────────────────────────────
  // Phase 3: Fix cream float undercounted fat
  // Pineapple-Mango Cream Float at EPCOT has fat=6g but cream floats
  // have more fat from ice cream. Stated 380 cal vs macro 270 = 110 cal gap.
  // Raising fat to 12g → macro 324, ratio 1.17 (below MEDIUM threshold).
  // ────────────────────────────────────────
  console.log('\n--- Phase 3: Fix cream float fat ---');

  const { data: floats, error: fErr } = await supabase
    .from('menu_items')
    .select('id, name, restaurant:restaurants(name), nutritional_data(id, fat, confidence_score)')
    .ilike('name', '%Pineapple-Mango Cream Float%');

  if (fErr) { console.error('Query error:', fErr.message); }

  for (const item of floats || []) {
    const nd = (item.nutritional_data as any[])?.[0];
    if (!nd) continue;
    if (nd.fat >= 12) {
      console.log(`  [SKIP] ${item.name}: fat already ${nd.fat}g`);
      continue;
    }
    const label = `${item.name} @ ${(item.restaurant as any)?.name} (fat ${nd.fat}→12g)`;
    if (DRY_RUN) {
      console.log(`  [DRY] ${label}`);
    } else {
      const { error } = await supabase.from('nutritional_data')
        .update({ fat: 12, confidence_score: 45 })
        .eq('id', nd.id);
      if (error) { console.error(`  FAIL: ${label} — ${error.message}`); continue; }
      console.log(`  [OK]  ${label}`);
    }
    fixed++;
  }

  console.log(`\n=== DONE: ${fixed} items ${DRY_RUN ? 'would be' : ''} fixed ===`);
}

main().catch(console.error);
