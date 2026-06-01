/**
 * Phase 1: Math-Based Audit
 *
 * Connects to Supabase, runs inventory counts, then performs
 * Atwater calorie validation and consistency checks on all items.
 *
 * Outputs:
 *   audit/00_inventory.md       - Schema and counts
 *   audit/01_math_audit.csv     - Full audit results
 *   audit/01_math_audit_summary.md - Summary with stats
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const auditDir = join(__dirname, '..', 'audit');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Helpers ────────────────────────────────────────────────

interface FullItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  is_fried: boolean;
  is_vegetarian: boolean;
  restaurant_name: string;
  park_name: string;
  park_location: string;
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
}

async function fetchAllItems(): Promise<FullItem[]> {
  const all: FullItem[] = [];
  const pageSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('menu_items')
      .select(`
        id, name, description, category, is_fried, is_vegetarian,
        restaurants!inner (name, land, parks!inner (name, location)),
        nutritional_data (id, calories, carbs, fat, sugar, protein, fiber, sodium, cholesterol, source, confidence_score)
      `)
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error(`Fetch error at offset ${offset}:`, error.message);
      break;
    }

    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }

    for (const row of data as any[]) {
      const restaurant = row.restaurants;
      const park = restaurant?.parks;
      const nd = row.nutritional_data?.[0] || {};

      all.push({
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category,
        is_fried: row.is_fried,
        is_vegetarian: row.is_vegetarian,
        restaurant_name: restaurant?.name || 'Unknown',
        land: restaurant?.land || null,
        park_name: park?.name || 'Unknown',
        park_location: park?.location || 'Unknown',
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

    console.log(`  Fetched ${all.length} items...`);
    offset += pageSize;
    if (data.length < pageSize) hasMore = false;
  }

  return all;
}

// ─── Audit Checks ───────────────────────────────────────────

type Severity = 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO';

interface AuditFinding {
  id: string;
  item_name: string;
  restaurant_name: string;
  park_name: string;
  check_name: string;
  severity: Severity;
  field_affected: string;
  current_value: string;
  expected_range_or_issue: string;
  atwater_expected_kcal: string;
  atwater_deviation_pct: string;
}

function runAuditChecks(item: FullItem): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const base = {
    id: item.id,
    item_name: item.name,
    restaurant_name: item.restaurant_name,
    park_name: item.park_name,
  };

  // ── Check 1: Atwater Calorie Validation ──
  const p = item.protein ?? 0;
  const c = item.carbs ?? 0;
  const f = item.fat ?? 0;
  const cal = item.calories;

  const expectedKcal = p * 4 + c * 4 + f * 9;

  if (cal !== null && cal > 0 && expectedKcal > 0) {
    const deviation = Math.abs(cal - expectedKcal) / expectedKcal * 100;

    if (deviation > 50) {
      findings.push({
        ...base,
        check_name: 'atwater_calorie',
        severity: 'CRITICAL',
        field_affected: 'calories',
        current_value: String(cal),
        expected_range_or_issue: `Atwater expected ${expectedKcal}, deviation ${deviation.toFixed(1)}% (>50%)`,
        atwater_expected_kcal: String(expectedKcal),
        atwater_deviation_pct: deviation.toFixed(1),
      });
    } else if (deviation > 20) {
      findings.push({
        ...base,
        check_name: 'atwater_calorie',
        severity: 'ERROR',
        field_affected: 'calories',
        current_value: String(cal),
        expected_range_or_issue: `Atwater expected ${expectedKcal}, deviation ${deviation.toFixed(1)}% (20-50%)`,
        atwater_expected_kcal: String(expectedKcal),
        atwater_deviation_pct: deviation.toFixed(1),
      });
    } else if (deviation > 10) {
      findings.push({
        ...base,
        check_name: 'atwater_calorie',
        severity: 'WARNING',
        field_affected: 'calories',
        current_value: String(cal),
        expected_range_or_issue: `Atwater expected ${expectedKcal}, deviation ${deviation.toFixed(1)}% (10-20%)`,
        atwater_expected_kcal: String(expectedKcal),
        atwater_deviation_pct: deviation.toFixed(1),
      });
    }
  }

  // Special: all macros zero but calories > 0
  if (cal !== null && cal > 0 && expectedKcal === 0) {
    findings.push({
      ...base,
      check_name: 'atwater_zero_macros',
      severity: 'CRITICAL',
      field_affected: 'calories',
      current_value: String(cal),
      expected_range_or_issue: 'Calories > 0 but all macros are zero/null',
      atwater_expected_kcal: '0',
      atwater_deviation_pct: '100',
    });
  }

  // Special: calories 0/null but macros > 0
  if ((cal === null || cal === 0) && expectedKcal > 0) {
    findings.push({
      ...base,
      check_name: 'atwater_no_calories',
      severity: 'CRITICAL',
      field_affected: 'calories',
      current_value: String(cal ?? 'NULL'),
      expected_range_or_issue: `Calories missing but macros give ${expectedKcal} kcal`,
      atwater_expected_kcal: String(expectedKcal),
      atwater_deviation_pct: '100',
    });
  }

  // ── Check 2: Impossible Values ──
  if (item.sugar !== null && item.carbs !== null && item.sugar > item.carbs) {
    findings.push({
      ...base,
      check_name: 'impossible_sugar_gt_carbs',
      severity: 'CRITICAL',
      field_affected: 'sugar',
      current_value: `sugar=${item.sugar}, carbs=${item.carbs}`,
      expected_range_or_issue: 'Sugar cannot exceed total carbs',
      atwater_expected_kcal: '', atwater_deviation_pct: '',
    });
  }

  if (item.fiber !== null && item.carbs !== null && item.fiber > item.carbs) {
    findings.push({
      ...base,
      check_name: 'impossible_fiber_gt_carbs',
      severity: 'CRITICAL',
      field_affected: 'fiber',
      current_value: `fiber=${item.fiber}, carbs=${item.carbs}`,
      expected_range_or_issue: 'Fiber cannot exceed total carbs',
      atwater_expected_kcal: '', atwater_deviation_pct: '',
    });
  }

  if (item.calories !== null && item.calories < 0) {
    findings.push({
      ...base,
      check_name: 'impossible_negative',
      severity: 'CRITICAL',
      field_affected: 'calories',
      current_value: String(item.calories),
      expected_range_or_issue: 'Negative calorie value',
      atwater_expected_kcal: '', atwater_deviation_pct: '',
    });
  }

  for (const [field, val] of [['carbs', item.carbs], ['fat', item.fat], ['protein', item.protein], ['sugar', item.sugar], ['fiber', item.fiber], ['sodium', item.sodium], ['cholesterol', item.cholesterol]] as [string, number | null][]) {
    if (val !== null && val < 0) {
      findings.push({
        ...base,
        check_name: 'impossible_negative',
        severity: 'CRITICAL',
        field_affected: field,
        current_value: String(val),
        expected_range_or_issue: `Negative ${field} value`,
        atwater_expected_kcal: '', atwater_deviation_pct: '',
      });
    }
  }

  // ── Check 3: Category-Based Plausibility ──
  const nameLower = item.name.toLowerCase();
  const cat = item.category;

  // Determine if item is likely alcoholic (for Atwater exceptions)
  const isLikelyAlcoholic = /\b(beer|ale|lager|stout|wine|champagne|prosecco|sangria|margarita|cocktail|mojito|daiquiri|martini|mimosa|bellini|spritz|mule|sour|old fashioned|manhattan|negroni|paloma|tequila|vodka|rum|whiskey|bourbon|gin|sake|soju|hard cider|hard seltzer|mezcal|pisco)\b/i.test(nameLower)
    && !/batter|braised|glazed|sauce|crusted|infused|brined|cake|cookie|float/i.test(nameLower);

  // Entrees
  if (cat === 'entree') {
    if (cal !== null && cal > 0 && cal < 100) {
      findings.push({
        ...base,
        check_name: 'plausibility_entree_too_low',
        severity: 'CRITICAL',
        field_affected: 'calories',
        current_value: String(cal),
        expected_range_or_issue: 'Entree with < 100 cal is almost certainly wrong',
        atwater_expected_kcal: String(expectedKcal), atwater_deviation_pct: '',
      });
    }
    if (cal !== null && cal > 3000) {
      findings.push({
        ...base,
        check_name: 'plausibility_entree_too_high',
        severity: 'ERROR',
        field_affected: 'calories',
        current_value: String(cal),
        expected_range_or_issue: 'Entree with > 3000 cal is extreme',
        atwater_expected_kcal: String(expectedKcal), atwater_deviation_pct: '',
      });
    }
    // Meat entree with very low protein
    if (item.protein !== null && item.protein < 5 && /\b(steak|sirloin|chicken|beef|pork|fish|salmon|shrimp|lobster|turkey|lamb|duck|ribs|brisket|burger)\b/i.test(nameLower)) {
      findings.push({
        ...base,
        check_name: 'plausibility_meat_low_protein',
        severity: 'ERROR',
        field_affected: 'protein',
        current_value: String(item.protein),
        expected_range_or_issue: 'Meat/fish entree with < 5g protein',
        atwater_expected_kcal: '', atwater_deviation_pct: '',
      });
    }
    // Starch entree with zero carbs
    if (item.carbs !== null && item.carbs === 0 && /\b(pasta|rice|noodle|sandwich|wrap|burger|pizza|flatbread|bread|bun|tortilla|taco|burrito|mac.?(?:and|&|n).?cheese|ramen|udon)\b/i.test(nameLower)) {
      findings.push({
        ...base,
        check_name: 'plausibility_starch_zero_carbs',
        severity: 'ERROR',
        field_affected: 'carbs',
        current_value: '0',
        expected_range_or_issue: 'Starch-based entree with 0g carbs',
        atwater_expected_kcal: '', atwater_deviation_pct: '',
      });
    }
  }

  // Beverages
  if (cat === 'beverage') {
    const isDiet = /\b(diet|zero|sugar.?free|unsweetened|water|sparkling|seltzer)\b/i.test(nameLower);
    const isRegularSoda = /\b(coca.?cola|pepsi|sprite|fanta|dr.?pepper|root.?beer|lemonade|sweet tea|juice|soda)\b/i.test(nameLower) && !isDiet;

    if (isDiet && cal !== null && cal > 15) {
      findings.push({
        ...base,
        check_name: 'plausibility_diet_drink_calories',
        severity: 'WARNING',
        field_affected: 'calories',
        current_value: String(cal),
        expected_range_or_issue: 'Diet/zero drink with > 15 cal',
        atwater_expected_kcal: '', atwater_deviation_pct: '',
      });
    }

    if (isRegularSoda) {
      if (item.carbs !== null && item.carbs < 15) {
        findings.push({
          ...base,
          check_name: 'plausibility_soda_low_carbs',
          severity: 'ERROR',
          field_affected: 'carbs',
          current_value: String(item.carbs),
          expected_range_or_issue: 'Regular soda/juice with < 15g carbs',
          atwater_expected_kcal: '', atwater_deviation_pct: '',
        });
      }
      if (item.fat !== null && item.fat > 3) {
        findings.push({
          ...base,
          check_name: 'plausibility_soda_has_fat',
          severity: 'ERROR',
          field_affected: 'fat',
          current_value: String(item.fat),
          expected_range_or_issue: 'Regular soda/juice with > 3g fat',
          atwater_expected_kcal: '', atwater_deviation_pct: '',
        });
      }
      if (item.protein !== null && item.protein > 3) {
        findings.push({
          ...base,
          check_name: 'plausibility_soda_has_protein',
          severity: 'ERROR',
          field_affected: 'protein',
          current_value: String(item.protein),
          expected_range_or_issue: 'Regular soda/juice with > 3g protein',
          atwater_expected_kcal: '', atwater_deviation_pct: '',
        });
      }
    }
  }

  // Desserts
  if (cat === 'dessert') {
    if (cal !== null && cal > 0 && cal < 50) {
      findings.push({
        ...base,
        check_name: 'plausibility_dessert_too_low',
        severity: 'ERROR',
        field_affected: 'calories',
        current_value: String(cal),
        expected_range_or_issue: 'Dessert with < 50 cal',
        atwater_expected_kcal: '', atwater_deviation_pct: '',
      });
    }
    if (item.carbs !== null && item.carbs < 10 && !/sugar.?free/i.test(nameLower)) {
      findings.push({
        ...base,
        check_name: 'plausibility_dessert_low_carbs',
        severity: 'ERROR',
        field_affected: 'carbs',
        current_value: String(item.carbs),
        expected_range_or_issue: 'Non-sugar-free dessert with < 10g carbs',
        atwater_expected_kcal: '', atwater_deviation_pct: '',
      });
    }
    if (item.sugar !== null && item.sugar === 0 && !/sugar.?free/i.test(nameLower)) {
      findings.push({
        ...base,
        check_name: 'plausibility_dessert_no_sugar',
        severity: 'ERROR',
        field_affected: 'sugar',
        current_value: '0',
        expected_range_or_issue: 'Non-sugar-free dessert with 0g sugar',
        atwater_expected_kcal: '', atwater_deviation_pct: '',
      });
    }
  }

  // Sides
  if (cat === 'side') {
    const isFried = item.is_fried || /\b(fries|fried|onion rings|tater tots|chips|fritters|tempura)\b/i.test(nameLower);
    if (isFried) {
      if (item.fat !== null && item.fat < 5 && cal !== null && cal > 0) {
        findings.push({
          ...base,
          check_name: 'plausibility_fried_low_fat',
          severity: 'ERROR',
          field_affected: 'fat',
          current_value: String(item.fat),
          expected_range_or_issue: 'Fried item with < 5g fat',
          atwater_expected_kcal: '', atwater_deviation_pct: '',
        });
      }
      if (item.carbs !== null && item.carbs < 10 && cal !== null && cal > 0) {
        findings.push({
          ...base,
          check_name: 'plausibility_fried_low_carbs',
          severity: 'ERROR',
          field_affected: 'carbs',
          current_value: String(item.carbs),
          expected_range_or_issue: 'Fried item with < 10g carbs',
          atwater_expected_kcal: '', atwater_deviation_pct: '',
        });
      }
    }
  }

  // Extreme sodium (any category)
  if (item.sodium !== null && item.sodium > 5000) {
    findings.push({
      ...base,
      check_name: 'plausibility_extreme_sodium',
      severity: 'ERROR',
      field_affected: 'sodium',
      current_value: String(item.sodium),
      expected_range_or_issue: 'Sodium > 5000mg is extreme (possible decimal error)',
      atwater_expected_kcal: '', atwater_deviation_pct: '',
    });
  }

  // ── Check 4: Suspiciously Round Values ──
  if (cal !== null && cal > 0 && item.protein !== null && item.carbs !== null && item.fat !== null) {
    const allRound = (item.protein % 5 === 0) && (item.carbs % 5 === 0) && (item.fat % 5 === 0) && (cal % 5 === 0);
    if (allRound && item.protein > 0 && item.carbs > 0 && item.fat > 0) {
      findings.push({
        ...base,
        check_name: 'round_values',
        severity: 'INFO',
        field_affected: 'all_macros',
        current_value: `cal=${cal}, p=${item.protein}, c=${item.carbs}, f=${item.fat}`,
        expected_range_or_issue: 'All macros are round multiples of 5 — suggests rough estimation',
        atwater_expected_kcal: String(expectedKcal), atwater_deviation_pct: '',
      });
    }

    // Exact Atwater match (zero deviation)
    if (cal === expectedKcal && cal > 50) {
      findings.push({
        ...base,
        check_name: 'exact_atwater',
        severity: 'INFO',
        field_affected: 'calories',
        current_value: String(cal),
        expected_range_or_issue: 'Calories = exact Atwater sum (may be calculated, not measured)',
        atwater_expected_kcal: String(expectedKcal), atwater_deviation_pct: '0',
      });
    }
  }

  // ── Check 5: Missing Data Completeness ──
  const coreNull: string[] = [];
  if (item.calories === null) coreNull.push('calories');
  if (item.carbs === null) coreNull.push('carbs');
  if (item.protein === null) coreNull.push('protein');
  if (item.fat === null) coreNull.push('fat');

  if (coreNull.length > 0) {
    findings.push({
      ...base,
      check_name: 'missing_core_fields',
      severity: coreNull.length >= 3 ? 'ERROR' : 'WARNING',
      field_affected: coreNull.join(','),
      current_value: `${coreNull.length} core field(s) missing`,
      expected_range_or_issue: `Missing: ${coreNull.join(', ')}`,
      atwater_expected_kcal: '', atwater_deviation_pct: '',
    });
  }

  // Calories present but no macros (useless for insulin dosing)
  if (item.calories !== null && item.calories > 0 && item.carbs === null && item.protein === null && item.fat === null) {
    findings.push({
      ...base,
      check_name: 'calories_only_no_macros',
      severity: 'ERROR',
      field_affected: 'carbs,protein,fat',
      current_value: `cal=${item.calories}, macros=NULL`,
      expected_range_or_issue: 'Has calories but no macros — useless for insulin dosing',
      atwater_expected_kcal: '', atwater_deviation_pct: '',
    });
  }

  const importantNull: string[] = [];
  if (item.sodium === null) importantNull.push('sodium');
  if (item.fiber === null) importantNull.push('fiber');
  if (item.sugar === null) importantNull.push('sugar');

  if (importantNull.length >= 3) {
    findings.push({
      ...base,
      check_name: 'missing_important_fields',
      severity: 'INFO',
      field_affected: importantNull.join(','),
      current_value: `${importantNull.length} important field(s) missing`,
      expected_range_or_issue: `Missing: ${importantNull.join(', ')}`,
      atwater_expected_kcal: '', atwater_deviation_pct: '',
    });
  }

  // No nutrition record at all
  if (item.nutrition_id === null) {
    findings.push({
      ...base,
      check_name: 'no_nutrition_record',
      severity: 'ERROR',
      field_affected: 'all',
      current_value: 'No nutritional_data row',
      expected_range_or_issue: 'Item has no nutrition record at all',
      atwater_expected_kcal: '', atwater_deviation_pct: '',
    });
  }

  return findings;
}

// ─── Check for duplicate nutrition profiles ─────────────────

function findDuplicateProfiles(items: FullItem[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // Group by restaurant + nutrition fingerprint
  const byRestaurant = new Map<string, FullItem[]>();
  for (const item of items) {
    if (item.calories === null) continue;
    const key = item.restaurant_name;
    if (!byRestaurant.has(key)) byRestaurant.set(key, []);
    byRestaurant.get(key)!.push(item);
  }

  for (const [restaurant, restItems] of byRestaurant) {
    if (restItems.length < 2) continue;

    const fingerprints = new Map<string, FullItem[]>();
    for (const item of restItems) {
      const fp = `${item.calories}-${item.carbs}-${item.fat}-${item.protein}`;
      if (!fingerprints.has(fp)) fingerprints.set(fp, []);
      fingerprints.get(fp)!.push(item);
    }

    for (const [fp, dupes] of fingerprints) {
      if (dupes.length >= 2 && dupes[0].calories! > 0) {
        // Only flag if items have different names (same name = intentional duplicate)
        const uniqueNames = new Set(dupes.map(d => d.name));
        if (uniqueNames.size >= 2) {
          for (const dupe of dupes) {
            findings.push({
              id: dupe.id,
              item_name: dupe.name,
              restaurant_name: dupe.restaurant_name,
              park_name: dupe.park_name,
              check_name: 'duplicate_nutrition_profile',
              severity: 'WARNING',
              field_affected: 'all_macros',
              current_value: fp,
              expected_range_or_issue: `Same nutrition as ${dupes.length - 1} other item(s) at ${restaurant}: ${[...uniqueNames].filter(n => n !== dupe.name).join(', ')}`,
              atwater_expected_kcal: '',
              atwater_deviation_pct: '',
            });
          }
        }
      }
    }
  }

  return findings;
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  console.log('=== Phase 1: Math-Based Audit ===\n');

  // ── Step 1: Fetch all items ──
  console.log('Fetching all items from Supabase...');
  const items = await fetchAllItems();
  console.log(`Total items fetched: ${items.length}\n`);

  // ── Step 2: Generate Inventory ──
  console.log('Generating inventory...');

  // Per-park counts
  const parkCounts = new Map<string, number>();
  const parkLocationMap = new Map<string, string>();
  for (const item of items) {
    const key = item.park_name;
    parkCounts.set(key, (parkCounts.get(key) || 0) + 1);
    parkLocationMap.set(key, item.park_location);
  }

  // Per-restaurant counts (top 30)
  const restCounts = new Map<string, { count: number; park: string }>();
  for (const item of items) {
    const key = `${item.restaurant_name}|||${item.park_name}`;
    if (!restCounts.has(key)) restCounts.set(key, { count: 0, park: item.park_name });
    restCounts.get(key)!.count++;
  }

  // Category counts
  const catCounts = new Map<string, number>();
  for (const item of items) {
    catCounts.set(item.category, (catCounts.get(item.category) || 0) + 1);
  }

  // Source counts
  const sourceCounts = new Map<string, number>();
  for (const item of items) {
    const src = item.source || 'no_nutrition';
    sourceCounts.set(src, (sourceCounts.get(src) || 0) + 1);
  }

  // NULL counts per nutrition field
  const nullCounts: Record<string, number> = {
    calories: 0, carbs: 0, fat: 0, sugar: 0, protein: 0,
    fiber: 0, sodium: 0, cholesterol: 0,
  };
  const zeroCounts: Record<string, number> = { ...nullCounts };

  for (const item of items) {
    for (const field of Object.keys(nullCounts)) {
      const val = (item as any)[field];
      if (val === null) nullCounts[field]++;
      if (val === 0) zeroCounts[field]++;
    }
  }

  // Items with no nutrition record at all
  const noNutrition = items.filter(i => i.nutrition_id === null).length;

  // Items with calories > 0
  const withCalories = items.filter(i => i.calories !== null && i.calories > 0).length;

  // Confidence score distribution
  const confidenceDist = new Map<number, number>();
  for (const item of items) {
    if (item.confidence_score !== null) {
      confidenceDist.set(item.confidence_score, (confidenceDist.get(item.confidence_score) || 0) + 1);
    }
  }

  // Build inventory markdown
  let inventory = `# Database Inventory\n\n`;
  inventory += `**Generated:** ${new Date().toISOString()}\n\n`;

  inventory += `## Schema Overview\n\n`;
  inventory += `| Table | Purpose |\n|---|---|\n`;
  inventory += `| parks | Park/venue info (name, location) |\n`;
  inventory += `| restaurants | Restaurant within parks (name, land, park_id FK) |\n`;
  inventory += `| menu_items | Food items (name, description, category, is_fried, is_vegetarian, price) |\n`;
  inventory += `| nutritional_data | Nutrition per item (cal, carbs, fat, sugar, protein, fiber, sodium, cholesterol) |\n`;
  inventory += `| allergens | Allergen records per item |\n\n`;

  inventory += `### Nutritional Data Columns\n\n`;
  inventory += `| Column | Type | Notes |\n|---|---|---|\n`;
  inventory += `| calories | INTEGER | nullable |\n`;
  inventory += `| carbs | INTEGER | nullable |\n`;
  inventory += `| fat | INTEGER | nullable |\n`;
  inventory += `| sugar | INTEGER | nullable |\n`;
  inventory += `| protein | INTEGER | nullable |\n`;
  inventory += `| fiber | INTEGER | nullable |\n`;
  inventory += `| sodium | INTEGER | nullable |\n`;
  inventory += `| cholesterol | INTEGER | nullable |\n`;
  inventory += `| source | ENUM | official, crowdsourced, api_lookup |\n`;
  inventory += `| confidence_score | INTEGER | 0-100 |\n\n`;

  inventory += `### Columns NOT Available (from audit template)\n\n`;
  inventory += `- saturated_fat_g, trans_fat_g, added_sugars_g — not tracked\n`;
  inventory += `- serving_size — not tracked\n`;
  inventory += `- last_verified, notes, updated_at — not tracked (only created_at)\n\n`;

  inventory += `## Summary Counts\n\n`;
  inventory += `| Metric | Count |\n|---|---|\n`;
  inventory += `| Total menu items | ${items.length} |\n`;
  inventory += `| Items with calories > 0 | ${withCalories} (${(withCalories / items.length * 100).toFixed(1)}%) |\n`;
  inventory += `| Items with no nutrition record | ${noNutrition} |\n`;
  inventory += `| Items with null calories | ${nullCounts.calories} |\n`;
  inventory += `| Items with zero calories | ${zeroCounts.calories} |\n\n`;

  inventory += `## Items by Park\n\n`;
  inventory += `| Park | Location | Items |\n|---|---|---|\n`;
  const sortedParks = [...parkCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [park, count] of sortedParks) {
    inventory += `| ${park} | ${parkLocationMap.get(park)} | ${count} |\n`;
  }

  inventory += `\n## Items by Category\n\n`;
  inventory += `| Category | Count | % |\n|---|---|---|\n`;
  const sortedCats = [...catCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sortedCats) {
    inventory += `| ${cat} | ${count} | ${(count / items.length * 100).toFixed(1)}% |\n`;
  }

  inventory += `\n## Items by Nutrition Source\n\n`;
  inventory += `| Source | Count | % |\n|---|---|---|\n`;
  const sortedSources = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [src, count] of sortedSources) {
    inventory += `| ${src} | ${count} | ${(count / items.length * 100).toFixed(1)}% |\n`;
  }

  inventory += `\n## NULL Counts by Nutrition Field\n\n`;
  inventory += `| Field | NULL | Zero | Has Value |\n|---|---|---|---|\n`;
  for (const field of Object.keys(nullCounts)) {
    const hasVal = items.length - nullCounts[field] - zeroCounts[field];
    inventory += `| ${field} | ${nullCounts[field]} | ${zeroCounts[field]} | ${hasVal} |\n`;
  }

  inventory += `\n## Confidence Score Distribution\n\n`;
  inventory += `| Score | Count | Meaning |\n|---|---|---|\n`;
  const sortedConf = [...confidenceDist.entries()].sort((a, b) => b[0] - a[0]);
  const confMeanings: Record<number, string> = {
    70: 'Original import (official)',
    60: 'Good USDA match',
    50: 'USDA match',
    45: 'Audit-fixed',
    40: 'Audit-fixed',
    35: 'AI-estimated (Groq)',
    30: 'Keyword-estimated',
  };
  for (const [score, count] of sortedConf) {
    inventory += `| ${score} | ${count} | ${confMeanings[score] || ''} |\n`;
  }

  inventory += `\n## Top 30 Restaurants by Item Count\n\n`;
  inventory += `| Restaurant | Park | Items |\n|---|---|---|\n`;
  const sortedRest = [...restCounts.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 30);
  for (const [key, val] of sortedRest) {
    const name = key.split('|||')[0];
    inventory += `| ${name} | ${val.park} | ${val.count} |\n`;
  }

  writeFileSync(join(auditDir, '00_inventory.md'), inventory);
  console.log(`Inventory saved to audit/00_inventory.md\n`);

  // ── Step 3: Run Audit Checks ──
  console.log('Running audit checks on all items...');
  const allFindings: AuditFinding[] = [];

  for (const item of items) {
    const itemFindings = runAuditChecks(item);
    allFindings.push(...itemFindings);
  }

  // Duplicate nutrition profiles
  console.log('Checking for duplicate nutrition profiles...');
  const dupeFindings = findDuplicateProfiles(items);
  allFindings.push(...dupeFindings);

  console.log(`Total findings: ${allFindings.length}\n`);

  // ── Step 4: Write CSV ──
  const csvHeader = 'id,item_name,restaurant_name,park_name,check_name,severity,field_affected,current_value,expected_range_or_issue,atwater_expected_kcal,atwater_deviation_pct';
  const csvRows = allFindings.map(f => {
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    return [
      f.id, escape(f.item_name), escape(f.restaurant_name), escape(f.park_name),
      f.check_name, f.severity, f.field_affected,
      escape(f.current_value), escape(f.expected_range_or_issue),
      f.atwater_expected_kcal, f.atwater_deviation_pct,
    ].join(',');
  });

  writeFileSync(join(auditDir, '01_math_audit.csv'), [csvHeader, ...csvRows].join('\n'));
  console.log(`Full audit saved to audit/01_math_audit.csv (${csvRows.length} rows)\n`);

  // ── Step 5: Build Summary ──
  const bySeverity = { CRITICAL: 0, ERROR: 0, WARNING: 0, INFO: 0 };
  for (const f of allFindings) bySeverity[f.severity]++;

  const byCheck = new Map<string, number>();
  for (const f of allFindings) {
    byCheck.set(f.check_name, (byCheck.get(f.check_name) || 0) + 1);
  }

  // Park error rates (excluding INFO)
  const parkErrors = new Map<string, { total: number; errors: number }>();
  for (const item of items) {
    if (!parkErrors.has(item.park_name)) parkErrors.set(item.park_name, { total: 0, errors: 0 });
    parkErrors.get(item.park_name)!.total++;
  }
  for (const f of allFindings) {
    if (f.severity !== 'INFO' && parkErrors.has(f.park_name)) {
      parkErrors.get(f.park_name)!.errors++;
    }
  }

  // Restaurant error rates (top 20)
  const restErrors = new Map<string, { total: number; errors: number; park: string }>();
  for (const item of items) {
    const key = `${item.restaurant_name}|||${item.park_name}`;
    if (!restErrors.has(key)) restErrors.set(key, { total: 0, errors: 0, park: item.park_name });
    restErrors.get(key)!.total++;
  }
  for (const f of allFindings) {
    if (f.severity !== 'INFO') {
      const key = `${f.restaurant_name}|||${f.park_name}`;
      if (restErrors.has(key)) restErrors.get(key)!.errors++;
    }
  }

  // CRITICAL items detail
  const criticalItems = allFindings.filter(f => f.severity === 'CRITICAL');

  let summary = `# Phase 1: Math-Based Audit Summary\n\n`;
  summary += `**Generated:** ${new Date().toISOString()}\n`;
  summary += `**Total items audited:** ${items.length}\n`;
  summary += `**Items with nutrition data:** ${withCalories}\n\n`;

  summary += `## Findings by Severity\n\n`;
  summary += `| Severity | Count | % of items |\n|---|---|---|\n`;
  for (const [sev, count] of Object.entries(bySeverity)) {
    summary += `| ${sev} | ${count} | ${(count / items.length * 100).toFixed(1)}% |\n`;
  }
  const actionable = bySeverity.CRITICAL + bySeverity.ERROR;
  summary += `| **Actionable (CRITICAL+ERROR)** | **${actionable}** | **${(actionable / items.length * 100).toFixed(1)}%** |\n`;

  summary += `\n## Findings by Check Type\n\n`;
  summary += `| Check | Count |\n|---|---|\n`;
  const sortedChecks = [...byCheck.entries()].sort((a, b) => b[1] - a[1]);
  for (const [check, count] of sortedChecks) {
    summary += `| ${check} | ${count} |\n`;
  }

  summary += `\n## Error Rate by Park\n\n`;
  summary += `| Park | Total Items | Findings (excl INFO) | Rate |\n|---|---|---|---|\n`;
  const sortedParkErrors = [...parkErrors.entries()].sort((a, b) => (b[1].errors / b[1].total) - (a[1].errors / a[1].total));
  for (const [park, stats] of sortedParkErrors) {
    const rate = stats.total > 0 ? (stats.errors / stats.total * 100).toFixed(1) : '0.0';
    summary += `| ${park} | ${stats.total} | ${stats.errors} | ${rate}% |\n`;
  }

  summary += `\n## Top 20 Restaurants by Error Count\n\n`;
  summary += `| Restaurant | Park | Items | Errors | Rate |\n|---|---|---|---|---|\n`;
  const sortedRestErrors = [...restErrors.entries()]
    .filter(([_, s]) => s.errors > 0)
    .sort((a, b) => b[1].errors - a[1].errors)
    .slice(0, 20);
  for (const [key, stats] of sortedRestErrors) {
    const name = key.split('|||')[0];
    const rate = (stats.errors / stats.total * 100).toFixed(1);
    summary += `| ${name} | ${stats.park} | ${stats.total} | ${stats.errors} | ${rate}% |\n`;
  }

  summary += `\n## All CRITICAL Findings (${criticalItems.length} items)\n\n`;
  if (criticalItems.length > 0) {
    summary += `| Item | Restaurant | Park | Check | Issue |\n|---|---|---|---|---|\n`;
    for (const f of criticalItems.slice(0, 100)) {
      summary += `| ${f.item_name} | ${f.restaurant_name} | ${f.park_name} | ${f.check_name} | ${f.expected_range_or_issue} |\n`;
    }
    if (criticalItems.length > 100) {
      summary += `\n*...and ${criticalItems.length - 100} more CRITICAL findings. See 01_math_audit.csv for full list.*\n`;
    }
  }

  // Sample of ERROR findings
  const errorItems = allFindings.filter(f => f.severity === 'ERROR');
  summary += `\n## Sample ERROR Findings (first 50 of ${errorItems.length})\n\n`;
  if (errorItems.length > 0) {
    summary += `| Item | Restaurant | Park | Check | Issue |\n|---|---|---|---|---|\n`;
    for (const f of errorItems.slice(0, 50)) {
      summary += `| ${f.item_name} | ${f.restaurant_name} | ${f.park_name} | ${f.check_name} | ${f.expected_range_or_issue} |\n`;
    }
  }

  writeFileSync(join(auditDir, '01_math_audit_summary.md'), summary);
  console.log(`Summary saved to audit/01_math_audit_summary.md\n`);

  // ── Print highlights to console ──
  console.log('=== SUMMARY ===\n');
  console.log(`Items audited: ${items.length}`);
  console.log(`Items with nutrition: ${withCalories} (${(withCalories / items.length * 100).toFixed(1)}%)`);
  console.log(`\nFindings:`);
  console.log(`  CRITICAL: ${bySeverity.CRITICAL}`);
  console.log(`  ERROR:    ${bySeverity.ERROR}`);
  console.log(`  WARNING:  ${bySeverity.WARNING}`);
  console.log(`  INFO:     ${bySeverity.INFO}`);
  console.log(`\nTop error patterns:`);
  for (const [check, count] of sortedChecks.slice(0, 10)) {
    console.log(`  ${check}: ${count}`);
  }

  if (criticalItems.length > 0) {
    console.log(`\nFirst 10 CRITICAL items:`);
    for (const f of criticalItems.slice(0, 10)) {
      console.log(`  [${f.park_name}] ${f.item_name} @ ${f.restaurant_name}`);
      console.log(`    ${f.check_name}: ${f.expected_range_or_issue}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
