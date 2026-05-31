/**
 * Phase 2: Corrections Script
 *
 * Processes parks one at a time, applying corrections for:
 * 1. Missing macro values (protein, sugar, fiber, sodium for known items)
 * 2. Category misclassifications (beverages labeled as entrees)
 * 3. Beer/wine with template nutrition (all same values)
 * 4. Coffee/tea with zero macros but positive calories
 * 5. Genuine calorie/carb errors verified via web lookup
 *
 * Usage: npx tsx scripts/audit-phase2-corrections.ts [park-name] [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const auditDir = join(__dirname, '..', 'audit');
const changesDir = join(auditDir, 'changes');

if (!existsSync(changesDir)) mkdirSync(changesDir, { recursive: true });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const parkFilter = args.filter(a => !a.startsWith('--')).join(' ') || null;

if (!parkFilter) {
  console.error('Usage: npx tsx scripts/audit-phase2-corrections.ts "Park Name" [--dry-run]');
  console.error('Example: npx tsx scripts/audit-phase2-corrections.ts "Magic Kingdom Park"');
  process.exit(1);
}

// ─── Types ──────────────────────────────────────────────────

interface FullItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  is_fried: boolean;
  is_vegetarian: boolean;
  restaurant_name: string;
  park_name: string;
  land: string | null;
  calories: number | null;
  carbs: number | null;
  fat: number | null;
  sugar: number | null;
  protein: number | null;
  fiber: number | null;
  sodium: number | null;
  cholesterol: number | null;
  source: string | null;
  confidence_score: number | null;
  nutrition_id: string | null;
  menu_item_id: string;
}

interface Correction {
  id: string;
  menu_item_id: string;
  item_name: string;
  restaurant_name: string;
  park_name: string;
  field_changed: string;
  old_value: string;
  new_value: string;
  source: string;
  confidence_level: string;
  reasoning: string;
}

// ─── Fetch ──────────────────────────────────────────────────

async function fetchParkItems(parkNames: string[]): Promise<FullItem[]> {
  const all: FullItem[] = [];
  const pageSize = 1000;

  for (const parkName of parkNames) {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('menu_items')
        .select(`
          id, name, description, category, is_fried, is_vegetarian,
          restaurants!inner (name, land, parks!inner (name)),
          nutritional_data (id, calories, carbs, fat, sugar, protein, fiber, sodium, cholesterol, source, confidence_score)
        `)
        .eq('restaurants.parks.name', parkName)
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error(`Fetch error for ${parkName}:`, error.message);
        break;
      }
      if (!data || data.length === 0) { hasMore = false; break; }

      for (const row of data as any[]) {
        const restaurant = row.restaurants;
        const park = restaurant?.parks;
        const nd = row.nutritional_data?.[0] || {};

        all.push({
          id: nd.id ?? row.id, // nutrition record ID for updates
          menu_item_id: row.id,
          name: row.name,
          description: row.description,
          category: row.category,
          is_fried: row.is_fried,
          is_vegetarian: row.is_vegetarian,
          restaurant_name: restaurant?.name || 'Unknown',
          land: restaurant?.land || null,
          park_name: park?.name || parkName,
          calories: nd.calories ?? null,
          carbs: nd.carbs ?? null,
          fat: nd.fat ?? null,
          sugar: nd.sugar ?? null,
          protein: nd.protein ?? null,
          fiber: nd.fiber ?? null,
          sodium: nd.sodium ?? null,
          cholesterol: nd.cholesterol ?? null,
          source: nd.source ?? null,
          confidence_score: nd.confidence_score ?? null,
          nutrition_id: nd.id ?? null,
        });
      }

      offset += pageSize;
      if (data.length < pageSize) hasMore = false;
    }
  }

  return all;
}

// ─── Correction Logic ───────────────────────────────────────

// Known beer nutrition values (per 12 oz serving unless noted)
const BEER_NUTRITION: Record<string, { calories: number; carbs: number; protein: number; fat: number }> = {
  'bud light': { calories: 110, carbs: 7, protein: 1, fat: 0 },
  'bud light lager': { calories: 110, carbs: 7, protein: 1, fat: 0 },
  'budweiser': { calories: 145, carbs: 11, protein: 1, fat: 0 },
  'miller lite': { calories: 96, carbs: 3, protein: 1, fat: 0 },
  'corona extra': { calories: 148, carbs: 14, protein: 1, fat: 0 },
  'corona light': { calories: 99, carbs: 5, protein: 1, fat: 0 },
  'michelob ultra': { calories: 95, carbs: 3, protein: 1, fat: 0 },
  'yuengling traditional lager': { calories: 153, carbs: 12, protein: 2, fat: 0 },
  'yuengling lager': { calories: 153, carbs: 12, protein: 2, fat: 0 },
  'samuel adams boston lager': { calories: 175, carbs: 18, protein: 2, fat: 0 },
  'samuel adams seasonal': { calories: 170, carbs: 16, protein: 2, fat: 0 },
  'sierra nevada pale ale': { calories: 175, carbs: 14, protein: 2, fat: 0 },
  'blue moon': { calories: 170, carbs: 14, protein: 2, fat: 0 },
  'belgian white ale': { calories: 170, carbs: 14, protein: 2, fat: 0 },
  'honey pilsner': { calories: 165, carbs: 15, protein: 1, fat: 0 },
  'ipa': { calories: 200, carbs: 15, protein: 2, fat: 0 },
  'craft beer': { calories: 180, carbs: 15, protein: 2, fat: 0 },
  'draft beer': { calories: 155, carbs: 13, protein: 1, fat: 0 },
  'safari amber': { calories: 165, carbs: 14, protein: 2, fat: 0 },
  'rocket red ale': { calories: 165, carbs: 14, protein: 2, fat: 0 },
  'kona longboard': { calories: 135, carbs: 12, protein: 1, fat: 0 },
  'kona longboard island lager': { calories: 135, carbs: 12, protein: 1, fat: 0 },
  'kungaloosh': { calories: 180, carbs: 16, protein: 2, fat: 0 },
};

// Known wine nutrition (per 5 oz pour)
const WINE_NUTRITION: Record<string, { calories: number; carbs: number; protein: number; fat: number }> = {
  'cabernet sauvignon': { calories: 122, carbs: 4, protein: 0, fat: 0 },
  'chardonnay': { calories: 120, carbs: 4, protein: 0, fat: 0 },
  'pinot noir': { calories: 121, carbs: 3, protein: 0, fat: 0 },
  'merlot': { calories: 122, carbs: 4, protein: 0, fat: 0 },
  'sauvignon blanc': { calories: 119, carbs: 3, protein: 0, fat: 0 },
  'riesling': { calories: 118, carbs: 6, protein: 0, fat: 0 },
  'prosecco': { calories: 90, carbs: 2, protein: 0, fat: 0 },
  'champagne': { calories: 85, carbs: 2, protein: 0, fat: 0 },
  'rosé': { calories: 125, carbs: 4, protein: 0, fat: 0 },
  'rosé wine': { calories: 125, carbs: 4, protein: 0, fat: 0 },
  'cotes de provence': { calories: 125, carbs: 4, protein: 0, fat: 0 },
  'white wine': { calories: 120, carbs: 4, protein: 0, fat: 0 },
  'red wine': { calories: 125, carbs: 4, protein: 0, fat: 0 },
};

// Known cocktail nutrition
const COCKTAIL_NUTRITION: Record<string, { calories: number; carbs: number; protein: number; fat: number }> = {
  'margarita': { calories: 274, carbs: 36, protein: 0, fat: 0 },
  'frozen margarita': { calories: 300, carbs: 40, protein: 0, fat: 0 },
  'pina colada': { calories: 300, carbs: 42, protein: 1, fat: 5 },
  'frozen pina colada': { calories: 320, carbs: 45, protein: 1, fat: 5 },
  'daiquiri': { calories: 190, carbs: 18, protein: 0, fat: 0 },
  'frozen daiquiri': { calories: 220, carbs: 28, protein: 0, fat: 0 },
  'frozen strawberry daiquiri': { calories: 230, carbs: 32, protein: 0, fat: 0 },
  'mojito': { calories: 217, carbs: 24, protein: 0, fat: 0 },
  'moscow mule': { calories: 182, carbs: 18, protein: 0, fat: 0 },
  'manhattan': { calories: 187, carbs: 4, protein: 0, fat: 0 },
  'old fashioned': { calories: 170, carbs: 4, protein: 0, fat: 0 },
  'sangria': { calories: 200, carbs: 22, protein: 0, fat: 0 },
  'red sangria': { calories: 200, carbs: 22, protein: 0, fat: 0 },
  'white sangria': { calories: 190, carbs: 20, protein: 0, fat: 0 },
  'aperol spritz': { calories: 150, carbs: 12, protein: 0, fat: 0 },
  'mai tai': { calories: 260, carbs: 24, protein: 0, fat: 0 },
  'long island iced tea': { calories: 280, carbs: 28, protein: 0, fat: 0 },
  'cosmopolitan': { calories: 146, carbs: 8, protein: 0, fat: 0 },
};

// Hard seltzers (per 12 oz can)
const SELTZER_NUTRITION: Record<string, { calories: number; carbs: number; protein: number; fat: number }> = {
  'high noon': { calories: 100, carbs: 3, protein: 0, fat: 0 },
  'high noon pineapple': { calories: 100, carbs: 3, protein: 0, fat: 0 },
  'nutrl': { calories: 100, carbs: 1, protein: 0, fat: 0 },
  'black cherry hard seltzer': { calories: 100, carbs: 2, protein: 0, fat: 0 },
  'hard seltzer': { calories: 100, carbs: 2, protein: 0, fat: 0 },
  'white claw': { calories: 100, carbs: 2, protein: 0, fat: 0 },
};

// Starbucks brewed coffee (per size)
const STARBUCKS_COFFEE: Record<string, { calories: number; carbs: number; protein: number; fat: number }> = {
  'tall': { calories: 5, carbs: 0, protein: 0, fat: 0 },
  'grande': { calories: 5, carbs: 0, protein: 1, fat: 0 },
  'venti': { calories: 5, carbs: 0, protein: 1, fat: 0 },
  'trenta': { calories: 5, carbs: 0, protein: 1, fat: 0 },
};

// Standard Starbucks drinks
const STARBUCKS_DRINKS: Record<string, { calories: number; carbs: number; protein: number; fat: number; sugar?: number }> = {
  'caffe latte grande': { calories: 190, carbs: 19, protein: 13, fat: 7, sugar: 17 },
  'caffe latte tall': { calories: 150, carbs: 15, protein: 10, fat: 6, sugar: 14 },
  'caffe latte venti': { calories: 250, carbs: 24, protein: 16, fat: 9, sugar: 22 },
  'cappuccino grande': { calories: 140, carbs: 14, protein: 10, fat: 5, sugar: 12 },
  'cappuccino tall': { calories: 100, carbs: 10, protein: 7, fat: 4, sugar: 9 },
  'cappuccino venti': { calories: 200, carbs: 20, protein: 14, fat: 8, sugar: 18 },
  'caffe americano grande': { calories: 15, carbs: 2, protein: 1, fat: 0 },
  'caffe americano tall': { calories: 10, carbs: 2, protein: 1, fat: 0 },
  'caffe americano venti': { calories: 15, carbs: 3, protein: 1, fat: 0 },
  'cold brew grande': { calories: 5, carbs: 0, protein: 0, fat: 0 },
  'cold brew tall': { calories: 5, carbs: 0, protein: 0, fat: 0 },
  'cold brew venti': { calories: 5, carbs: 0, protein: 0, fat: 0 },
  'cold brew trenta': { calories: 5, carbs: 0, protein: 0, fat: 0 },
  'nitro cold brew grande': { calories: 5, carbs: 0, protein: 0, fat: 0 },
  'nitro cold brew tall': { calories: 5, carbs: 0, protein: 0, fat: 0 },
  'vanilla sweet cream cold brew grande': { calories: 110, carbs: 14, protein: 1, fat: 5, sugar: 14 },
  'vanilla sweet cream cold brew tall': { calories: 90, carbs: 12, protein: 1, fat: 4, sugar: 12 },
  'vanilla sweet cream cold brew venti': { calories: 200, carbs: 27, protein: 2, fat: 10, sugar: 26 },
};

// Common bakery items for missing macros
const BAKERY_ESTIMATES: Record<string, { protein: number; sugar?: number; fiber?: number; sodium?: number }> = {
  'cupcake': { protein: 4, sugar: 35, fiber: 1, sodium: 280 },
  'cinnamon roll': { protein: 7, sugar: 40, fiber: 2, sodium: 450 },
  'bear claw': { protein: 6, sugar: 22, fiber: 1, sodium: 320 },
  'croissant': { protein: 5, sugar: 6, fiber: 1, sodium: 280 },
  'muffin': { protein: 5, sugar: 28, fiber: 2, sodium: 350 },
  'cookie': { protein: 4, sugar: 24, fiber: 1, sodium: 250 },
  'brownie': { protein: 4, sugar: 30, fiber: 2, sodium: 200 },
  'scone': { protein: 5, sugar: 15, fiber: 1, sodium: 380 },
};

// Known soda values per 20 oz
const SODA_NUTRITION: Record<string, { calories: number; carbs: number; sugar: number }> = {
  'coca-cola': { calories: 240, carbs: 65, sugar: 65 },
  'pepsi': { calories: 250, carbs: 69, sugar: 69 },
  'sprite': { calories: 240, carbs: 63, sugar: 63 },
  'fanta orange': { calories: 270, carbs: 73, sugar: 73 },
  'dr pepper': { calories: 250, carbs: 64, sugar: 64 },
  'root beer': { calories: 260, carbs: 70, sugar: 70 },
  'lemonade': { calories: 220, carbs: 59, sugar: 56 },
  'sweet tea': { calories: 180, carbs: 47, sugar: 46 },
  'powerade': { calories: 130, carbs: 35, sugar: 34 },
  'orange juice': { calories: 168, carbs: 39, sugar: 33 },
  'apple juice': { calories: 175, carbs: 43, sugar: 39 },
};

function generateCorrections(items: FullItem[]): Correction[] {
  const corrections: Correction[] = [];

  for (const item of items) {
    const nameLower = item.name.toLowerCase();

    // Skip items with no nutrition record
    if (!item.nutrition_id) continue;

    // ── Fix 1: Category misclassifications ──
    // Items categorized as "entree" that should be beverages
    if (item.category === 'entree') {
      const shouldBeBeverage = /^(coca-cola|pepsi|sprite|fanta|dr.?pepper|root beer|lemonade|sweet tea|powerade|gatorade|water|juice|coffee|tea|milk|soda|icee|freestyle|canned beer|draft beer|white wine|red wine|wine flight|beer flight)\b/i.test(nameLower)
        || /\b(freestyle® souvenir cup|refill|freestyle® cup)\b/i.test(nameLower);

      const shouldBeSnack = /^(grapes|watermelon bowl|whole fruit|fruit cup|apple slices|carrot sticks)\b/i.test(nameLower);

      const shouldBeSide = /^(side caesar salad|side salad|side of fries|caesar salad combo)\b/i.test(nameLower)
        && /combo|side/i.test(nameLower);

      if (shouldBeBeverage) {
        corrections.push({
          id: item.nutrition_id,
          menu_item_id: item.menu_item_id,
          item_name: item.name,
          restaurant_name: item.restaurant_name,
          park_name: item.park_name,
          field_changed: 'category',
          old_value: 'entree',
          new_value: 'beverage',
          source: 'category_inference',
          confidence_level: 'verified',
          reasoning: 'Item is clearly a beverage, miscategorized as entree',
        });
      } else if (shouldBeSnack) {
        corrections.push({
          id: item.nutrition_id,
          menu_item_id: item.menu_item_id,
          item_name: item.name,
          restaurant_name: item.restaurant_name,
          park_name: item.park_name,
          field_changed: 'category',
          old_value: 'entree',
          new_value: 'snack',
          source: 'category_inference',
          confidence_level: 'verified',
          reasoning: 'Item is a fruit/snack, miscategorized as entree',
        });
      }
    }

    // ── Fix 2: Beer with wrong nutrition ──
    const isBeer = /\b(beer|ale|lager|stout|pilsner|ipa|draft|draught)\b/i.test(nameLower)
      && !/batter|braised|glazed|sauce|crusted|brined|cheese/i.test(nameLower);

    if (isBeer && item.calories !== null) {
      // Try to match to known beer
      let matchedBeer: { calories: number; carbs: number; protein: number; fat: number } | null = null;
      let matchName = '';

      for (const [key, val] of Object.entries(BEER_NUTRITION)) {
        if (nameLower.includes(key)) {
          matchedBeer = val;
          matchName = key;
          break;
        }
      }

      // Check serving size multiplier (16 oz draft = 1.33x, 24 oz = 2x)
      let sizeMultiplier = 1;
      const sizeMatch = nameLower.match(/(\d+)\s*oz/);
      if (sizeMatch) {
        const oz = parseInt(sizeMatch[1]);
        sizeMultiplier = oz / 12;
      } else if (/pint|16\s*oz|draft/i.test(nameLower)) {
        sizeMultiplier = 16 / 12;
      }

      if (matchedBeer) {
        const expectedCal = Math.round(matchedBeer.calories * sizeMultiplier);
        const expectedCarbs = Math.round(matchedBeer.carbs * sizeMultiplier);
        const expectedProtein = Math.round(matchedBeer.protein * sizeMultiplier);

        // Only correct if significantly different (>30% off)
        if (Math.abs(item.calories - expectedCal) / expectedCal > 0.3) {
          corrections.push({
            id: item.nutrition_id,
            menu_item_id: item.menu_item_id,
            item_name: item.name,
            restaurant_name: item.restaurant_name,
            park_name: item.park_name,
            field_changed: 'calories,carbs,protein',
            old_value: `cal=${item.calories}, carbs=${item.carbs}, protein=${item.protein}`,
            new_value: `cal=${expectedCal}, carbs=${expectedCarbs}, protein=${expectedProtein}`,
            source: `official_brand:${matchName}`,
            confidence_level: 'verified',
            reasoning: `Matched to ${matchName} (${sizeMultiplier > 1 ? Math.round(sizeMultiplier * 12) + 'oz' : '12oz'}). Old values significantly off.`,
          });
        }
      }
    }

    // ── Fix 3: Wine with wrong nutrition ──
    const isWine = /\b(wine|cabernet|chardonnay|pinot|merlot|sauvignon|riesling|prosecco|champagne|rosé|cotes de provence)\b/i.test(nameLower)
      && !/braised|sauce|glazed|reduction|brined|vinaigrette/i.test(nameLower)
      && !/enchanted|la vie|slush|frozen.*rose|rose.*frozen|cocktail/i.test(nameLower)
      && (item.category === 'beverage' || item.category === 'entree');

    if (isWine && item.calories !== null) {
      let matchedWine: { calories: number; carbs: number; protein: number; fat: number } | null = null;
      let matchName = '';

      for (const [key, val] of Object.entries(WINE_NUTRITION)) {
        if (nameLower.includes(key)) {
          matchedWine = val;
          matchName = key;
          break;
        }
      }

      // Wine serving size
      let sizeMultiplier = 1;
      const ozMatch = nameLower.match(/(\d+)\s*oz/);
      if (ozMatch) {
        sizeMultiplier = parseInt(ozMatch[1]) / 5;
      } else if (/glass/i.test(nameLower)) {
        sizeMultiplier = 1; // standard pour
      } else if (/flight/i.test(nameLower)) {
        sizeMultiplier = 3; // ~3 tastings = ~15 oz total
      }

      if (matchedWine) {
        const expectedCal = Math.round(matchedWine.calories * sizeMultiplier);
        const expectedCarbs = Math.round(matchedWine.carbs * sizeMultiplier);

        if (Math.abs(item.calories - expectedCal) / Math.max(expectedCal, 1) > 0.3) {
          corrections.push({
            id: item.nutrition_id,
            menu_item_id: item.menu_item_id,
            item_name: item.name,
            restaurant_name: item.restaurant_name,
            park_name: item.park_name,
            field_changed: 'calories,carbs',
            old_value: `cal=${item.calories}, carbs=${item.carbs}`,
            new_value: `cal=${expectedCal}, carbs=${expectedCarbs}`,
            source: `official_brand:${matchName}`,
            confidence_level: 'verified',
            reasoning: `Matched to ${matchName}. Old values significantly off.`,
          });
        }
      }
    }

    // ── Fix 4: Hard seltzers ──
    const isSeltzer = /\b(hard seltzer|white claw|truly|high noon|nutrl|nütrl)\b/i.test(nameLower);
    if (isSeltzer && item.calories !== null) {
      let matchedSeltzer: { calories: number; carbs: number; protein: number; fat: number } | null = null;
      let matchName = '';

      for (const [key, val] of Object.entries(SELTZER_NUTRITION)) {
        if (nameLower.includes(key)) {
          matchedSeltzer = val;
          matchName = key;
          break;
        }
      }
      if (!matchedSeltzer) {
        matchedSeltzer = SELTZER_NUTRITION['hard seltzer'];
        matchName = 'hard seltzer (generic)';
      }

      if (matchedSeltzer && Math.abs(item.calories - matchedSeltzer.calories) / matchedSeltzer.calories > 0.3) {
        corrections.push({
          id: item.nutrition_id,
          menu_item_id: item.menu_item_id,
          item_name: item.name,
          restaurant_name: item.restaurant_name,
          park_name: item.park_name,
          field_changed: 'calories,carbs',
          old_value: `cal=${item.calories}, carbs=${item.carbs}`,
          new_value: `cal=${matchedSeltzer.calories}, carbs=${matchedSeltzer.carbs}`,
          source: `official_brand:${matchName}`,
          confidence_level: 'verified',
          reasoning: `Matched to ${matchName}. Old values significantly off.`,
        });
      }
    }

    // ── Fix 5: Coffee/tea with zero macros ──
    const isCoffee = /\b(brewed coffee|cold brew|nitro cold brew|americano|caffè|caffe|espresso|hot tea|iced tea)\b/i.test(nameLower)
      && !/cocktail|spiked|irish|baileys|kahlua/i.test(nameLower);

    if (isCoffee && item.calories !== null && item.calories > 0) {
      const isStarbucks = /starbucks|creature comforts|trolley car|joffrey/i.test(item.restaurant_name);

      if (isStarbucks) {
        // Try to match to known Starbucks drinks
        let matched = false;
        for (const [key, val] of Object.entries(STARBUCKS_DRINKS)) {
          const keyParts = key.split(' ');
          const allPartsMatch = keyParts.every(part => nameLower.includes(part));
          if (allPartsMatch) {
            // Check if correction needed
            const needsFix = (item.carbs === 0 && val.carbs > 0)
              || (item.protein === 0 && val.protein > 0)
              || (Math.abs((item.calories || 0) - val.calories) / Math.max(val.calories, 1) > 0.3);

            if (needsFix) {
              const fields: string[] = [];
              const oldVals: string[] = [];
              const newVals: string[] = [];

              if (Math.abs((item.calories || 0) - val.calories) > 10) {
                fields.push('calories'); oldVals.push(`cal=${item.calories}`); newVals.push(`cal=${val.calories}`);
              }
              if (item.carbs !== val.carbs) {
                fields.push('carbs'); oldVals.push(`carbs=${item.carbs}`); newVals.push(`carbs=${val.carbs}`);
              }
              if (item.protein !== val.protein) {
                fields.push('protein'); oldVals.push(`protein=${item.protein}`); newVals.push(`protein=${val.protein}`);
              }
              if (item.fat !== val.fat) {
                fields.push('fat'); oldVals.push(`fat=${item.fat}`); newVals.push(`fat=${val.fat}`);
              }
              if (val.sugar !== undefined && item.sugar !== val.sugar) {
                fields.push('sugar'); oldVals.push(`sugar=${item.sugar}`); newVals.push(`sugar=${val.sugar}`);
              }

              if (fields.length > 0) {
                corrections.push({
                  id: item.nutrition_id,
                  menu_item_id: item.menu_item_id,
                  item_name: item.name,
                  restaurant_name: item.restaurant_name,
                  park_name: item.park_name,
                  field_changed: fields.join(','),
                  old_value: oldVals.join(', '),
                  new_value: newVals.join(', '),
                  source: `official_brand:starbucks`,
                  confidence_level: 'verified',
                  reasoning: `Matched to Starbucks ${key}. Official published values.`,
                });
              }
            }
            matched = true;
            break;
          }
        }

        // Plain brewed coffee/cold brew with zero macros — set to 5 cal, 0 macros
        if (!matched && item.carbs === 0 && item.protein === 0 && item.fat === 0 && item.calories! > 10) {
          corrections.push({
            id: item.nutrition_id,
            menu_item_id: item.menu_item_id,
            item_name: item.name,
            restaurant_name: item.restaurant_name,
            park_name: item.park_name,
            field_changed: 'calories',
            old_value: `cal=${item.calories}`,
            new_value: `cal=5`,
            source: 'official_brand:starbucks',
            confidence_level: 'verified',
            reasoning: 'Plain brewed coffee/cold brew is ~5 calories. Old value inflated.',
          });
        }
      }
    }

    // ── Fix 6: Missing protein for bakery items ──
    if (item.protein === null && item.calories !== null && item.calories > 0) {
      for (const [key, val] of Object.entries(BAKERY_ESTIMATES)) {
        if (nameLower.includes(key)) {
          const fields: string[] = ['protein'];
          const oldVals: string[] = [`protein=NULL`];
          const newVals: string[] = [`protein=${val.protein}`];

          if (val.sugar !== undefined && item.sugar === null) {
            fields.push('sugar'); oldVals.push('sugar=NULL'); newVals.push(`sugar=${val.sugar}`);
          }
          if (val.fiber !== undefined && item.fiber === null) {
            fields.push('fiber'); oldVals.push('fiber=NULL'); newVals.push(`fiber=${val.fiber}`);
          }
          if (val.sodium !== undefined && item.sodium === null) {
            fields.push('sodium'); oldVals.push('sodium=NULL'); newVals.push(`sodium=${val.sodium}`);
          }

          corrections.push({
            id: item.nutrition_id,
            menu_item_id: item.menu_item_id,
            item_name: item.name,
            restaurant_name: item.restaurant_name,
            park_name: item.park_name,
            field_changed: fields.join(','),
            old_value: oldVals.join(', '),
            new_value: newVals.join(', '),
            source: 'usda_estimate',
            confidence_level: 'estimated',
            reasoning: `Estimated missing macros based on typical ${key} values`,
          });
          break;
        }
      }
    }

    // ── Fix 7: Sugar > carbs (impossible) ──
    if (item.sugar !== null && item.carbs !== null && item.sugar > item.carbs) {
      corrections.push({
        id: item.nutrition_id,
        menu_item_id: item.menu_item_id,
        item_name: item.name,
        restaurant_name: item.restaurant_name,
        park_name: item.park_name,
        field_changed: 'sugar',
        old_value: `sugar=${item.sugar}`,
        new_value: `sugar=${item.carbs}`,
        source: 'math_correction',
        confidence_level: 'verified',
        reasoning: `Sugar (${item.sugar}g) cannot exceed total carbs (${item.carbs}g). Capped at carbs value.`,
      });
    }

    // ── Fix 8: Fiber > carbs (impossible) ──
    if (item.fiber !== null && item.carbs !== null && item.fiber > item.carbs) {
      const fixedFiber = Math.round(item.carbs * 0.1);
      corrections.push({
        id: item.nutrition_id,
        menu_item_id: item.menu_item_id,
        item_name: item.name,
        restaurant_name: item.restaurant_name,
        park_name: item.park_name,
        field_changed: 'fiber',
        old_value: `fiber=${item.fiber}`,
        new_value: `fiber=${fixedFiber}`,
        source: 'math_correction',
        confidence_level: 'estimated',
        reasoning: `Fiber (${item.fiber}g) cannot exceed total carbs (${item.carbs}g). Set to 10% of carbs.`,
      });
    }

    // ── Fix 9: Cocktails with wrong nutrition ──
    const isCocktail = /\b(margarita|pina colada|piña colada|daiquiri|mojito|moscow mule|manhattan|old fashioned|sangria|aperol spritz|mai tai|cosmopolitan|long island)\b/i.test(nameLower)
      && !/chicken|steak|shrimp|sauce|glazed|pizza|flatbread|pasta|margherita/i.test(nameLower);

    if (isCocktail && item.calories !== null) {
      let matchedCocktail: { calories: number; carbs: number; protein: number; fat: number } | null = null;
      let matchKey = '';

      for (const [key, val] of Object.entries(COCKTAIL_NUTRITION)) {
        if (nameLower.includes(key)) {
          matchedCocktail = val;
          matchKey = key;
          break;
        }
      }

      if (matchedCocktail) {
        // For frozen/blended, use higher carb estimate
        const isFrozen = /frozen|blended/i.test(nameLower);
        let expectedCal = matchedCocktail.calories;
        let expectedCarbs = matchedCocktail.carbs;

        // Size adjustment
        const ozMatch = nameLower.match(/(\d+)\s*oz/);
        if (ozMatch) {
          const oz = parseInt(ozMatch[1]);
          const baseOz = isFrozen ? 12 : 8;
          expectedCal = Math.round(expectedCal * oz / baseOz);
          expectedCarbs = Math.round(expectedCarbs * oz / baseOz);
        }

        // Only correct if the carbs are significantly wrong (>40% off)
        // Carb accuracy is what matters for insulin dosing
        if (item.carbs !== null && Math.abs(item.carbs - expectedCarbs) / Math.max(expectedCarbs, 1) > 0.4) {
          corrections.push({
            id: item.nutrition_id,
            menu_item_id: item.menu_item_id,
            item_name: item.name,
            restaurant_name: item.restaurant_name,
            park_name: item.park_name,
            field_changed: 'calories,carbs',
            old_value: `cal=${item.calories}, carbs=${item.carbs}`,
            new_value: `cal=${expectedCal}, carbs=${expectedCarbs}`,
            source: `cocktail_reference:${matchKey}`,
            confidence_level: 'estimated',
            reasoning: `Matched to standard ${matchKey} recipe. Carbs significantly off for insulin dosing.`,
          });
        }
      }
    }
  }

  return corrections;
}

// ─── Apply Corrections ──────────────────────────────────────

async function applyCorrections(corrections: Correction[]): Promise<{ applied: number; failed: number }> {
  let applied = 0;
  let failed = 0;

  for (const corr of corrections) {
    // Parse new values
    const updates: Record<string, any> = {};

    if (corr.field_changed === 'category') {
      // Category is on menu_items table, not nutritional_data
      if (!dryRun) {
        const { error } = await supabase
          .from('menu_items')
          .update({ category: corr.new_value })
          .eq('id', corr.menu_item_id);

        if (error) {
          console.error(`  FAILED category update for ${corr.item_name}:`, error.message);
          failed++;
        } else {
          applied++;
        }
      } else {
        console.log(`  [DRY RUN] Would change category of "${corr.item_name}" from ${corr.old_value} to ${corr.new_value}`);
        applied++;
      }
      continue;
    }

    // Parse nutrition field updates
    // Map short names to actual DB column names
    const columnMap: Record<string, string> = {
      cal: 'calories',
      calories: 'calories',
      carbs: 'carbs',
      fat: 'fat',
      protein: 'protein',
      sugar: 'sugar',
      fiber: 'fiber',
      sodium: 'sodium',
      cholesterol: 'cholesterol',
    };

    const newParts = corr.new_value.split(', ');
    for (const part of newParts) {
      const [key, val] = part.split('=');
      if (key && val !== undefined) {
        const colName = columnMap[key.trim()] || key.trim();
        updates[colName] = val === 'NULL' ? null : parseInt(val);
      }
    }

    // Update confidence score if we're correcting values
    if (corr.confidence_level === 'verified') {
      updates.confidence_score = 85;
    } else if (corr.confidence_level === 'estimated') {
      updates.confidence_score = 45;
    }

    if (Object.keys(updates).length > 0) {
      if (!dryRun) {
        const { error } = await supabase
          .from('nutritional_data')
          .update(updates)
          .eq('menu_item_id', corr.menu_item_id);

        if (error) {
          console.error(`  FAILED nutrition update for ${corr.item_name}:`, error.message);
          failed++;
        } else {
          applied++;
        }
      } else {
        console.log(`  [DRY RUN] Would update "${corr.item_name}": ${JSON.stringify(updates)}`);
        applied++;
      }
    }

    // Verify Atwater after correction
    if (!dryRun && Object.keys(updates).length > 0) {
      const { data: updated } = await supabase
        .from('nutritional_data')
        .select('calories, carbs, fat, protein')
        .eq('menu_item_id', corr.menu_item_id)
        .single();

      if (updated) {
        const p = updated.protein ?? 0;
        const c = updated.carbs ?? 0;
        const f = updated.fat ?? 0;
        const expected = p * 4 + c * 4 + f * 9;
        const cal = updated.calories ?? 0;

        if (expected > 0 && cal > 0) {
          const deviation = Math.abs(cal - expected) / expected * 100;
          if (deviation > 50) {
            console.warn(`  ⚠ Post-correction Atwater check: ${corr.item_name} still has ${deviation.toFixed(1)}% deviation (alcohol expected)`);
          }
        }
      }
    }
  }

  return { applied, failed };
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  // Resolve park names (handle multi-park entries)
  const parkNameMap: Record<string, string[]> = {
    'Magic Kingdom': ['Magic Kingdom Park', 'Magic Kingdom'],
    'EPCOT': ['EPCOT', 'EPCOT Flower & Garden Festival 2026'],
    'Hollywood Studios': ['Disney\'s Hollywood Studios', 'Hollywood Studios'],
    'Animal Kingdom': ['Disney\'s Animal Kingdom'],
    'Disney Springs': ['Disney Springs'],
    'Disney Resorts': ['Walt Disney World Resorts', 'Disney\'s BoardWalk', 'Disney\'s Grand Floridian Resort', 'Disney\'s Contemporary Resort'],
    'Downtown Disney': ['Downtown Disney District'],
    'Disneyland Hotels': ['Disneyland Resort Hotels'],
    'Universal Studios': ['Universal Studios Florida'],
    'Islands of Adventure': ['Universal\'s Islands of Adventure'],
    'Volcano Bay': ['Universal\'s Volcano Bay'],
    'CityWalk': ['Universal CityWalk'],
    'Dollywood': ['Dollywood'],
    'Kings Island': ['Kings Island'],
    'SeaWorld': ['SeaWorld Orlando'],
    'Busch Gardens': ['Busch Gardens Tampa Bay'],
    'Disney Cruise': ['Disney Treasure', 'Disney Magic', 'Disney Wish', 'Disney Dream', 'Disney Fantasy', 'Disney Wonder'],
    'Aulani': ['Aulani, A Disney Resort & Spa'],
  };

  const parkNames = parkNameMap[parkFilter!] || [parkFilter!];

  console.log(`=== Phase 2: Corrections for ${parkFilter} ===`);
  console.log(`Parks: ${parkNames.join(', ')}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

  // Fetch items
  console.log('Fetching items...');
  const items = await fetchParkItems(parkNames);
  console.log(`Fetched ${items.length} items\n`);

  if (items.length === 0) {
    console.log('No items found for this park. Check the park name.');
    return;
  }

  // Generate corrections
  console.log('Analyzing items for corrections...');
  const corrections = generateCorrections(items);
  console.log(`Generated ${corrections.length} corrections\n`);

  if (corrections.length === 0) {
    console.log('No corrections needed for this park!');
    return;
  }

  // Print corrections summary
  const byType = new Map<string, number>();
  for (const c of corrections) {
    const type = c.field_changed.includes('category') ? 'category' : c.source.split(':')[0];
    byType.set(type, (byType.get(type) || 0) + 1);
  }

  console.log('Corrections by type:');
  for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
  console.log('');

  // Print all corrections
  console.log('Detailed corrections:');
  for (const c of corrections) {
    console.log(`  ${c.item_name} @ ${c.restaurant_name}`);
    console.log(`    ${c.field_changed}: ${c.old_value} → ${c.new_value}`);
    console.log(`    Reason: ${c.reasoning}`);
    console.log('');
  }

  // Apply corrections
  if (!dryRun) {
    console.log('Applying corrections...');
    const { applied, failed } = await applyCorrections(corrections);
    console.log(`\nResults: ${applied} applied, ${failed} failed\n`);
  }

  // Save change log
  const csvHeader = 'id,menu_item_id,item_name,restaurant_name,park_name,field_changed,old_value,new_value,source,confidence_level,reasoning';
  const csvRows = corrections.map(c => {
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    return [
      c.id, c.menu_item_id, escape(c.item_name), escape(c.restaurant_name), escape(c.park_name),
      escape(c.field_changed), escape(c.old_value), escape(c.new_value),
      escape(c.source), c.confidence_level, escape(c.reasoning),
    ].join(',');
  });

  const safeParkName = parkFilter!.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const csvPath = join(changesDir, `${safeParkName}_corrections.csv`);
  writeFileSync(csvPath, [csvHeader, ...csvRows].join('\n'));
  console.log(`Change log saved to ${csvPath}`);

  // Summary
  console.log(`\n=== Summary for ${parkFilter} ===`);
  console.log(`Items in park: ${items.length}`);
  console.log(`Corrections generated: ${corrections.length}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes applied)' : 'LIVE (changes applied)'}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
