# Scheduled Audit System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automated daily audit pipeline with tiered auto-fix, GitHub Issue + email reporting, DB-level guards, and automatic graduation to weekly after 14 consecutive clean days.

**Architecture:** Modular scripts in `scripts/audit/` orchestrated by GitHub Actions. PostgreSQL CHECK constraints + soft validation trigger as a second defense layer. Email via Gmail API (same pattern as medical-briefer). GitHub Issues via `gh` CLI.

**Tech Stack:** TypeScript + tsx, Supabase JS client, Gmail API (`googleapis`), `gh` CLI, GitHub Actions, PostgreSQL triggers.

---

### Task 1: Add `googleapis` Dependency

**Files:**
- Modify: `package.json`

**Step 1: Install googleapis as devDependency**

Run: `cd C:/Users/medpe/diabetesguide && npm install --save-dev googleapis`

Expected: `googleapis` added to `devDependencies` in `package.json`

**Step 2: Verify install**

Run: `node -e "import('googleapis').then(m => console.log('OK', Object.keys(m.google).length + ' APIs'))"`

Expected: `OK` with API count

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add googleapis for audit email reporting"
```

---

### Task 2: Database Constraints (SQL Migration)

**Files:**
- Create: `scripts/audit/migrate-constraints.ts`

**Step 1: Write migration script**

```typescript
/**
 * Add CHECK constraints + audit_log table + soft validation trigger.
 * Run once via: npx tsx scripts/audit/migrate-constraints.ts
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv(): Record<string, string> {
  try {
    const content = readFileSync(resolve(__dirname, '..', '..', '.env.local'), 'utf-8')
    const vars: Record<string, string> = {}
    content.split('\n').forEach(line => {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx > 0) vars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
      }
    })
    return vars
  } catch { return {} }
}

const env = loadEnv()
const url = env['SUPABASE_URL'] || env['VITE_SUPABASE_URL'] || process.env.SUPABASE_URL!
const key = env['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, key)

const DRY_RUN = process.argv.includes('--dry-run')

const MIGRATION_SQL = `
-- Hard constraints: reject mathematically impossible values
DO $$ BEGIN
  ALTER TABLE nutritional_data ADD CONSTRAINT chk_fiber_lte_carbs
    CHECK (fiber IS NULL OR carbs IS NULL OR fiber <= carbs);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE nutritional_data ADD CONSTRAINT chk_sugar_lte_carbs
    CHECK (sugar IS NULL OR carbs IS NULL OR sugar <= carbs);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE nutritional_data ADD CONSTRAINT chk_calories_range
    CHECK (calories IS NULL OR (calories >= 0 AND calories <= 5000));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE nutritional_data ADD CONSTRAINT chk_sodium_range
    CHECK (sodium IS NULL OR (sodium >= 0 AND sodium <= 10000));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE nutritional_data ADD CONSTRAINT chk_macros_non_negative
    CHECK (
      (carbs IS NULL OR carbs >= 0) AND
      (fat IS NULL OR fat >= 0) AND
      (protein IS NULL OR protein >= 0) AND
      (sugar IS NULL OR sugar >= 0) AND
      (fiber IS NULL OR fiber >= 0)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  check_name TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('HIGH', 'MEDIUM', 'LOW')),
  message TEXT NOT NULL,
  details JSONB,
  auto_fixed BOOLEAN DEFAULT FALSE,
  reviewed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: public read, service-role write
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Public read audit_log" ON audit_log FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Service write audit_log" ON audit_log FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Service update audit_log" ON audit_log FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Soft validation trigger function
CREATE OR REPLACE FUNCTION validate_nutrition_soft()
RETURNS TRIGGER AS $$
DECLARE
  atwater_est NUMERIC;
  deviation NUMERIC;
  item_name TEXT;
  is_alcohol BOOLEAN := FALSE;
BEGIN
  -- Skip if no calories
  IF NEW.calories IS NULL OR NEW.calories = 0 THEN
    RETURN NEW;
  END IF;

  -- Get item name for context
  SELECT name INTO item_name FROM menu_items WHERE id = NEW.menu_item_id;

  -- Check for alcoholic items (skip Atwater check)
  IF item_name ~* '(beer|ale|lager|stout|ipa|wine|merlot|chardonnay|cabernet|prosecco|champagne|margarita|mojito|daiquiri|sangria|martini|cocktail|bourbon|whiskey|vodka|rum|tequila|gin|sake|mead|hard cider|seltzer|mimosa|bellini|spritz)'
     AND item_name !~* '(batter|bread|sauce|glaze|crust|brined|braised|cake|root beer|ginger beer|butterbeer)' THEN
    is_alcohol := TRUE;
  END IF;

  -- Atwater deviation check (non-alcohol only)
  IF NOT is_alcohol AND NEW.carbs IS NOT NULL AND NEW.fat IS NOT NULL AND NEW.protein IS NOT NULL THEN
    atwater_est := (NEW.protein * 4) + (NEW.carbs * 4) + (NEW.fat * 9);
    IF atwater_est > 0 THEN
      deviation := ABS(NEW.calories - atwater_est) / atwater_est * 100;
      IF deviation > 30 THEN
        INSERT INTO audit_log (table_name, record_id, check_name, severity, message, details)
        VALUES ('nutritional_data', NEW.id, 'atwater_deviation',
          CASE WHEN deviation > 50 THEN 'HIGH' ELSE 'MEDIUM' END,
          format('Atwater deviation %.0f%% for %s', deviation, COALESCE(item_name, 'unknown')),
          jsonb_build_object('calories', NEW.calories, 'estimated', atwater_est, 'deviation_pct', round(deviation)));
      END IF;
    END IF;
  END IF;

  -- Unusually high calories
  IF NEW.calories > 3000 THEN
    INSERT INTO audit_log (table_name, record_id, check_name, severity, message, details)
    VALUES ('nutritional_data', NEW.id, 'high_calories', 'MEDIUM',
      format('Calories %s for %s (>3000 unusual for single item)', NEW.calories, COALESCE(item_name, 'unknown')),
      jsonb_build_object('calories', NEW.calories));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_validate_nutrition ON nutritional_data;
CREATE TRIGGER trg_validate_nutrition
  BEFORE INSERT OR UPDATE ON nutritional_data
  FOR EACH ROW EXECUTE FUNCTION validate_nutrition_soft();

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
`

async function main() {
  if (DRY_RUN) {
    console.log('[DRY RUN] Would execute migration SQL:')
    console.log(MIGRATION_SQL)
    return
  }

  console.log('Running migration...')
  const { error } = await supabase.rpc('exec_sql', { sql: MIGRATION_SQL }).maybeSingle()

  // If rpc doesn't exist, fall back to running via SQL Editor instructions
  if (error) {
    console.log('Note: rpc exec_sql not available. Run this SQL in Supabase SQL Editor:')
    console.log(MIGRATION_SQL)
    console.log('\nThen run: NOTIFY pgrst, \'reload schema\';')
    process.exit(1)
  }

  console.log('Migration complete.')
}

main().catch(err => { console.error(err); process.exit(1) })
```

**Step 2: Run with --dry-run to verify SQL**

Run: `npx tsx scripts/audit/migrate-constraints.ts --dry-run`

Expected: SQL printed to console, no DB changes

**Step 3: Execute migration in Supabase SQL Editor**

Copy the SQL and run it in the Supabase dashboard SQL Editor. Verify constraints exist:
```sql
SELECT conname FROM pg_constraint WHERE conrelid = 'nutritional_data'::regclass;
SELECT * FROM audit_log LIMIT 0;  -- table exists
```

**Step 4: Commit**

```bash
git add scripts/audit/migrate-constraints.ts
git commit -m "feat(audit): database constraints + audit_log table + soft validation trigger"
```

---

### Task 3: Shared Types & Utilities

**Files:**
- Create: `scripts/audit/types.ts`
- Create: `scripts/audit/thresholds.ts`
- Create: `scripts/audit/utils.ts`

**Step 1: Write types**

```typescript
// scripts/audit/types.ts
export type Severity = 'HIGH' | 'MEDIUM' | 'LOW'

export interface AuditFinding {
  item: string
  restaurant: string
  park: string
  checkName: string
  severity: Severity
  message: string
  currentValue?: string
  suggestedValue?: string
  autoFixable: boolean
}

export interface AutoFix {
  nutritionDataId: string
  item: string
  restaurant: string
  park: string
  field: string
  before: number | null
  after: number
  reason: string
}

export interface AuditPassResult {
  pass: string               // 'accuracy' | 'completeness' | 'external'
  findings: AuditFinding[]
  autoFixes: AutoFix[]
  stats: Record<string, number>
}

export interface AuditReport {
  date: string
  mode: 'daily' | 'weekly'
  passes: AuditPassResult[]
  totalFindings: { high: number; medium: number; low: number }
  totalAutoFixes: number
  graduationDay: number
}

export interface GraduationState {
  mode: 'daily' | 'weekly'
  consecutiveCleanDays: number
  lastAudit: string
  autoFixesApplied: number
  graduationThreshold: number
  history: Array<{
    date: string
    high: number
    medium: number
    low: number
    autoFixes: number
  }>
}

export interface NutData {
  id: string
  calories: number | null
  carbs: number | null
  fat: number | null
  sugar: number | null
  protein: number | null
  fiber: number | null
  sodium: number | null
  cholesterol: number | null
  source: string
  confidence_score: number | null
}

export interface Item {
  id: string
  name: string
  category: string
  is_vegetarian: boolean
  is_fried: boolean
  description: string | null
  restaurant: { name: string; park: { name: string } }
  nutritional_data: NutData[]
}
```

**Step 2: Write thresholds**

```typescript
// scripts/audit/thresholds.ts
export const THRESHOLDS = {
  // Accuracy
  MAX_CALORIES: 5000,
  MAX_SODIUM: 10000,
  ATWATER_HIGH_PCT: 50,     // >50% deviation = HIGH
  ATWATER_MEDIUM_PCT: 20,   // >20% deviation = MEDIUM
  TEMPLATE_MIN_COUNT: 5,    // same macros across N+ items = template flag

  // Completeness
  MIN_RESTAURANTS_PER_PARK: 10,
  MIN_ITEMS_PER_RESTAURANT: 3,
  MAX_NULL_CALORIE_PCT: 30,
  MIN_CONFIDENCE_SCORE: 30,  // below this = MEDIUM flag

  // External
  CHAIN_DRIFT_PCT: 20,       // >20% calorie difference from chain official
  STALE_DATA_DAYS: 90,       // items unchanged for N days with low confidence
  STALE_CONFIDENCE_MAX: 50,  // only flag stale items below this confidence

  // Graduation
  GRADUATION_THRESHOLD: 14,  // consecutive clean days to switch to weekly

  // Auto-fix
  FIBER_CARB_RATIO: 0.10,    // when fiber > carbs, set fiber to 10% of carbs
  SODIUM_DIVISOR: 10,        // when sodium > 10000, divide by 10
} as const
```

**Step 3: Write shared utilities**

```typescript
// scripts/audit/utils.ts
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import type { Item, NutData, GraduationState } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..')

export function loadEnv(): Record<string, string> {
  try {
    const content = readFileSync(resolve(ROOT, '.env.local'), 'utf-8')
    const vars: Record<string, string> = {}
    content.split('\n').forEach(line => {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx > 0) vars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
      }
    })
    return vars
  } catch { return {} }
}

export function createSupabaseClient() {
  const env = loadEnv()
  const url = env['SUPABASE_URL'] || env['VITE_SUPABASE_URL'] || process.env.SUPABASE_URL!
  const key = env['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  return createClient(url, key)
}

export async function fetchAllItems(supabase: ReturnType<typeof createClient>): Promise<Item[]> {
  const all: Item[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from('menu_items')
      .select(`id, name, category, is_vegetarian, is_fried, description,
               restaurant:restaurants(name, park:parks(name)),
               nutritional_data(id, calories, carbs, fat, sugar, protein, fiber, sodium, cholesterol, source, confidence_score)`)
      .range(from, from + 499)
    if (error) { console.error('Fetch error:', error.message); break }
    if (!data?.length) break
    all.push(...(data as unknown as Item[]))
    from += 500
  }
  return all
}

export function nd(item: Item): NutData | null {
  return item.nutritional_data?.[0] ?? null
}

export function loc(item: Item): string {
  const r = item.restaurant as any
  return `${r?.name ?? '?'} @ ${r?.park?.name ?? '?'}`
}

export function isLikelyAlcoholic(name: string, item: Item): boolean {
  const nm = name.toLowerCase()
  const rName = ((item.restaurant as any)?.name ?? '').toLowerCase()

  // Alcoholic beverage indicators
  const alcoholPatterns = /\b(beer|ale|lager|stout|ipa|pilsner|porter|wheat beer|hefeweizen|witbier|saison|sour beer|gose|wine|merlot|chardonnay|cabernet|pinot|prosecco|champagne|riesling|moscato|rose|sangria|margarita|mojito|daiquiri|martini|manhattan|cosmopolitan|old fashioned|negroni|paloma|gimlet|sidecar|highball|cocktail|bourbon|whiskey|vodka|rum|tequila|gin|sake|mead|hard cider|hard seltzer|mimosa|bellini|spritz|aperol|pina colada|mai tai|long island|irish coffee|hot toddy|grog|julep|smash|mule|fizz|sling|punch)\b/
  const negativePatterns = /\b(batter|bread|sauce|glaze|crust|brined|braised|marinated|infused|cake|cookie|root beer|ginger beer|ginger ale|butterbeer|cream soda)\b/

  if (negativePatterns.test(nm)) return false
  if (alcoholPatterns.test(nm)) return true

  // Bar/lounge restaurant context
  const barContext = /\b(bar|lounge|cantina|pub|taproom|brewery)\b/
  if (barContext.test(rName) && item.category === 'beverage') return true

  return false
}

// Graduation state management
const GRADUATION_PATH = resolve(ROOT, 'audit', 'graduation-state.json')

export function loadGraduationState(): GraduationState {
  if (existsSync(GRADUATION_PATH)) {
    return JSON.parse(readFileSync(GRADUATION_PATH, 'utf-8'))
  }
  return {
    mode: 'daily',
    consecutiveCleanDays: 0,
    lastAudit: '',
    autoFixesApplied: 0,
    graduationThreshold: 14,
    history: [],
  }
}

export function saveGraduationState(state: GraduationState) {
  writeFileSync(GRADUATION_PATH, JSON.stringify(state, null, 2))
}

export function rootPath(...segments: string[]) {
  return resolve(ROOT, ...segments)
}
```

**Step 4: Commit**

```bash
git add scripts/audit/types.ts scripts/audit/thresholds.ts scripts/audit/utils.ts
git commit -m "feat(audit): shared types, thresholds, and utility functions"
```

---

### Task 4: Accuracy Check Module

**Files:**
- Create: `scripts/audit/accuracy.ts`
- Create: `scripts/audit/__tests__/accuracy.test.ts`

**Step 1: Write the failing test**

```typescript
// scripts/audit/__tests__/accuracy.test.ts
import { describe, it, expect } from 'vitest'
import { checkAccuracy } from '../accuracy.js'
import type { Item } from '../types.js'

function makeItem(overrides: Partial<Item> & { nd?: Partial<Item['nutritional_data'][0]> }): Item {
  const { nd: ndOverrides, ...itemOverrides } = overrides
  return {
    id: 'test-id',
    name: 'Test Item',
    category: 'entree',
    is_vegetarian: false,
    is_fried: false,
    description: null,
    restaurant: { name: 'Test Restaurant', park: { name: 'Test Park' } },
    nutritional_data: [{
      id: 'nd-id',
      calories: 500, carbs: 50, fat: 20, protein: 25,
      sugar: 10, fiber: 5, sodium: 800, cholesterol: 50,
      source: 'api_lookup', confidence_score: 60,
      ...ndOverrides,
    }],
    ...itemOverrides,
  }
}

describe('checkAccuracy', () => {
  it('flags fiber > carbs as HIGH auto-fixable', () => {
    const items = [makeItem({ nd: { fiber: 60, carbs: 30 } })]
    const result = checkAccuracy(items)
    const finding = result.findings.find(f => f.checkName === 'fiber_gt_carbs')
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('HIGH')
    expect(finding!.autoFixable).toBe(true)
  })

  it('flags sugar > carbs as HIGH auto-fixable', () => {
    const items = [makeItem({ nd: { sugar: 80, carbs: 50 } })]
    const result = checkAccuracy(items)
    const finding = result.findings.find(f => f.checkName === 'sugar_gt_carbs')
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('HIGH')
    expect(finding!.autoFixable).toBe(true)
  })

  it('flags sodium > 10000 as HIGH auto-fixable', () => {
    const items = [makeItem({ nd: { sodium: 48000 } })]
    const result = checkAccuracy(items)
    const finding = result.findings.find(f => f.checkName === 'sodium_extreme')
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('HIGH')
    expect(finding!.autoFixable).toBe(true)
  })

  it('flags Atwater deviation > 50% as HIGH non-fixable', () => {
    // 25*4 + 50*4 + 20*9 = 100+200+180 = 480, but cal=900 → 87% deviation
    const items = [makeItem({ nd: { calories: 900, carbs: 50, fat: 20, protein: 25 } })]
    const result = checkAccuracy(items)
    const finding = result.findings.find(f => f.checkName === 'atwater_deviation')
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('HIGH')
    expect(finding!.autoFixable).toBe(false)
  })

  it('skips Atwater check for alcoholic beverages', () => {
    const items = [makeItem({
      name: 'Frozen Margarita',
      category: 'beverage',
      nd: { calories: 400, carbs: 30, fat: 0, protein: 0 },
    })]
    const result = checkAccuracy(items)
    const finding = result.findings.find(f => f.checkName === 'atwater_deviation')
    expect(finding).toBeUndefined()
  })

  it('flags negative calories as HIGH', () => {
    const items = [makeItem({ nd: { calories: -50 } })]
    const result = checkAccuracy(items)
    const finding = result.findings.find(f => f.checkName === 'calories_range')
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('HIGH')
  })

  it('returns clean result for valid items', () => {
    // 25*4 + 50*4 + 20*9 = 480, cal=500 → 4% deviation — clean
    const items = [makeItem({})]
    const result = checkAccuracy(items)
    expect(result.findings).toHaveLength(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/audit/__tests__/accuracy.test.ts`

Expected: FAIL — `Cannot find module '../accuracy.js'`

**Step 3: Write accuracy module**

```typescript
// scripts/audit/accuracy.ts
import type { Item, AuditFinding, AutoFix, AuditPassResult } from './types.js'
import { THRESHOLDS } from './thresholds.js'
import { nd, loc, isLikelyAlcoholic } from './utils.js'

export function checkAccuracy(items: Item[]): AuditPassResult {
  const findings: AuditFinding[] = []
  const autoFixes: AutoFix[] = []
  const stats = { checked: 0, clean: 0, flagged: 0 }

  for (const item of items) {
    const n = nd(item)
    if (!n) continue
    stats.checked++
    let flagged = false

    const base = {
      item: item.name,
      restaurant: item.restaurant?.name ?? '?',
      park: (item.restaurant as any)?.park?.name ?? '?',
    }

    // Fiber > carbs (auto-fixable)
    if (n.fiber != null && n.carbs != null && n.fiber > n.carbs) {
      const suggested = Math.round(n.carbs * THRESHOLDS.FIBER_CARB_RATIO)
      findings.push({
        ...base, checkName: 'fiber_gt_carbs', severity: 'HIGH', autoFixable: true,
        message: `Fiber (${n.fiber}g) exceeds carbs (${n.carbs}g)`,
        currentValue: `fiber=${n.fiber}`, suggestedValue: `fiber=${suggested}`,
      })
      autoFixes.push({
        nutritionDataId: n.id, ...base,
        field: 'fiber', before: n.fiber, after: suggested,
        reason: 'Fiber cannot exceed total carbohydrates',
      })
      flagged = true
    }

    // Sugar > carbs (auto-fixable)
    if (n.sugar != null && n.carbs != null && n.sugar > n.carbs) {
      findings.push({
        ...base, checkName: 'sugar_gt_carbs', severity: 'HIGH', autoFixable: true,
        message: `Sugar (${n.sugar}g) exceeds carbs (${n.carbs}g)`,
        currentValue: `sugar=${n.sugar}`, suggestedValue: `sugar=${n.carbs}`,
      })
      autoFixes.push({
        nutritionDataId: n.id, ...base,
        field: 'sugar', before: n.sugar, after: n.carbs,
        reason: 'Sugar cannot exceed total carbohydrates',
      })
      flagged = true
    }

    // Sodium > 10,000 (auto-fixable — likely 10x error)
    if (n.sodium != null && n.sodium > THRESHOLDS.MAX_SODIUM) {
      const suggested = Math.round(n.sodium / THRESHOLDS.SODIUM_DIVISOR)
      findings.push({
        ...base, checkName: 'sodium_extreme', severity: 'HIGH', autoFixable: true,
        message: `Sodium ${n.sodium}mg exceeds ${THRESHOLDS.MAX_SODIUM}mg (likely 10x error)`,
        currentValue: `sodium=${n.sodium}`, suggestedValue: `sodium=${suggested}`,
      })
      autoFixes.push({
        nutritionDataId: n.id, ...base,
        field: 'sodium', before: n.sodium, after: suggested,
        reason: 'Sodium value 10x too high (likely mg/kg confusion)',
      })
      flagged = true
    }

    // Negative macros (auto-fixable)
    for (const field of ['calories', 'carbs', 'fat', 'protein', 'sugar', 'fiber'] as const) {
      const val = n[field]
      if (val != null && val < 0) {
        findings.push({
          ...base, checkName: 'negative_value', severity: 'HIGH', autoFixable: true,
          message: `${field} is negative (${val})`,
          currentValue: `${field}=${val}`, suggestedValue: `${field}=0`,
        })
        autoFixes.push({
          nutritionDataId: n.id, ...base,
          field, before: val, after: 0,
          reason: `Negative ${field} value corrected to 0`,
        })
        flagged = true
      }
    }

    // Calories out of range (not auto-fixable)
    if (n.calories != null && (n.calories < 0 || n.calories > THRESHOLDS.MAX_CALORIES)) {
      if (!findings.some(f => f.item === item.name && f.checkName === 'negative_value' && f.message.includes('calories'))) {
        findings.push({
          ...base, checkName: 'calories_range', severity: 'HIGH', autoFixable: false,
          message: `Calories ${n.calories} outside valid range (0-${THRESHOLDS.MAX_CALORIES})`,
          currentValue: `calories=${n.calories}`,
        })
        flagged = true
      }
    }

    // Atwater deviation (non-alcohol only, not auto-fixable)
    if (n.calories && n.carbs != null && n.fat != null && n.protein != null) {
      if (!isLikelyAlcoholic(item.name, item)) {
        const estimated = (n.protein * 4) + (n.carbs * 4) + (n.fat * 9)
        if (estimated > 0) {
          const deviation = Math.abs(n.calories - estimated) / estimated * 100
          if (deviation > THRESHOLDS.ATWATER_HIGH_PCT) {
            findings.push({
              ...base, checkName: 'atwater_deviation', severity: 'HIGH', autoFixable: false,
              message: `Atwater deviation ${deviation.toFixed(0)}% (stated ${n.calories} cal, estimated ${Math.round(estimated)} cal)`,
              currentValue: `calories=${n.calories}`, suggestedValue: `~${Math.round(estimated)}`,
            })
            flagged = true
          } else if (deviation > THRESHOLDS.ATWATER_MEDIUM_PCT) {
            findings.push({
              ...base, checkName: 'atwater_deviation', severity: 'MEDIUM', autoFixable: false,
              message: `Atwater deviation ${deviation.toFixed(0)}% (stated ${n.calories} cal, estimated ${Math.round(estimated)} cal)`,
              currentValue: `calories=${n.calories}`, suggestedValue: `~${Math.round(estimated)}`,
            })
            flagged = true
          }
        }
      }
    }

    // Fat = 0 on fried/pastry items (not auto-fixable)
    if (n.fat === 0 && (item.is_fried || /\b(fried|crispy|pastry|pie|croissant|donut|doughnut|fritter|churro)\b/i.test(item.name))) {
      findings.push({
        ...base, checkName: 'zero_fat_fried', severity: 'MEDIUM', autoFixable: false,
        message: `Fat is 0g but item appears fried/pastry`,
        currentValue: 'fat=0',
      })
      flagged = true
    }

    // Protein = 0 on meat items (not auto-fixable)
    if (n.protein === 0 && /\b(chicken|beef|pork|turkey|steak|ribs|brisket|fish|salmon|shrimp|lobster|lamb|sausage|bacon|ham)\b/i.test(item.name)) {
      findings.push({
        ...base, checkName: 'zero_protein_meat', severity: 'MEDIUM', autoFixable: false,
        message: `Protein is 0g but item contains meat/fish`,
        currentValue: 'protein=0',
      })
      flagged = true
    }

    if (!flagged) stats.clean++
    else stats.flagged++
  }

  return { pass: 'accuracy', findings, autoFixes, stats }
}

// CLI entry point
if (process.argv[1]?.endsWith('accuracy.ts') || process.argv[1]?.endsWith('accuracy.js')) {
  import('./utils.js').then(async ({ createSupabaseClient, fetchAllItems, rootPath }) => {
    const { writeFileSync } = await import('fs')
    console.log('Fetching all items...')
    const supabase = createSupabaseClient()
    const items = await fetchAllItems(supabase)
    console.log(`Checking ${items.length} items...`)
    const result = checkAccuracy(items)
    const { high, medium, low } = {
      high: result.findings.filter(f => f.severity === 'HIGH').length,
      medium: result.findings.filter(f => f.severity === 'MEDIUM').length,
      low: result.findings.filter(f => f.severity === 'LOW').length,
    }
    console.log(`Accuracy: ${high} HIGH, ${medium} MEDIUM, ${low} LOW, ${result.autoFixes.length} auto-fixable`)
    writeFileSync(rootPath('audit', 'accuracy-results.json'), JSON.stringify(result, null, 2))
    console.log('Results written to audit/accuracy-results.json')
  })
}
```

**Step 4: Run tests**

Run: `npx vitest run scripts/audit/__tests__/accuracy.test.ts`

Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add scripts/audit/accuracy.ts scripts/audit/__tests__/accuracy.test.ts
git commit -m "feat(audit): accuracy check module with tests (fiber, sugar, sodium, Atwater)"
```

---

### Task 5: Completeness Check Module

**Files:**
- Create: `scripts/audit/completeness.ts`
- Create: `scripts/audit/__tests__/completeness.test.ts`

**Step 1: Write the failing test**

```typescript
// scripts/audit/__tests__/completeness.test.ts
import { describe, it, expect } from 'vitest'
import { checkCompleteness } from '../completeness.js'
import type { Item } from '../types.js'

function makeItems(parkName: string, restaurantName: string, count: number, nullCalories = false): Item[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${parkName}-${restaurantName}-${i}`,
    name: `Item ${i}`,
    category: 'entree',
    is_vegetarian: false,
    is_fried: false,
    description: null,
    restaurant: { name: restaurantName, park: { name: parkName } },
    nutritional_data: [{
      id: `nd-${parkName}-${restaurantName}-${i}`,
      calories: nullCalories ? null : 500,
      carbs: 50, fat: 20, protein: 25,
      sugar: 10, fiber: 5, sodium: 800, cholesterol: 50,
      source: 'api_lookup', confidence_score: 60,
    }],
  }))
}

describe('checkCompleteness', () => {
  it('flags restaurants with < 3 items as MEDIUM', () => {
    const items = makeItems('Test Park', 'Tiny Place', 2)
    // Add enough restaurants to satisfy park threshold
    for (let i = 0; i < 10; i++) {
      items.push(...makeItems('Test Park', `Restaurant ${i}`, 5))
    }
    const result = checkCompleteness(items)
    const finding = result.findings.find(f => f.checkName === 'sparse_restaurant' && f.restaurant === 'Tiny Place')
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('MEDIUM')
  })

  it('flags parks with < 10 restaurants as HIGH', () => {
    const items = [
      ...makeItems('Tiny Park', 'Rest A', 5),
      ...makeItems('Tiny Park', 'Rest B', 5),
    ]
    const result = checkCompleteness(items)
    const finding = result.findings.find(f => f.checkName === 'sparse_park')
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('HIGH')
  })

  it('flags parks with >30% null calories as HIGH', () => {
    const items = [
      ...makeItems('Bad Park', 'Rest A', 4, false),
      ...makeItems('Bad Park', 'Rest A', 6, true),  // 60% null
    ]
    // Add more restaurants
    for (let i = 0; i < 10; i++) {
      items.push(...makeItems('Bad Park', `R ${i}`, 3))
    }
    const result = checkCompleteness(items)
    const finding = result.findings.find(f => f.checkName === 'null_calorie_coverage')
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('HIGH')
  })

  it('returns clean for well-populated parks', () => {
    const items: Item[] = []
    for (let i = 0; i < 15; i++) {
      items.push(...makeItems('Good Park', `Restaurant ${i}`, 10))
    }
    const result = checkCompleteness(items)
    expect(result.findings.filter(f => f.severity === 'HIGH')).toHaveLength(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/audit/__tests__/completeness.test.ts`

Expected: FAIL — module not found

**Step 3: Write completeness module**

```typescript
// scripts/audit/completeness.ts
import type { Item, AuditFinding, AuditPassResult } from './types.js'
import { THRESHOLDS } from './thresholds.js'
import { nd } from './utils.js'

export function checkCompleteness(items: Item[]): AuditPassResult {
  const findings: AuditFinding[] = []
  const stats: Record<string, number> = { parks: 0, restaurants: 0, items: items.length }

  // Group by park
  const parkMap = new Map<string, Map<string, Item[]>>()
  for (const item of items) {
    const parkName = (item.restaurant as any)?.park?.name ?? 'Unknown'
    const restName = item.restaurant?.name ?? 'Unknown'
    if (!parkMap.has(parkName)) parkMap.set(parkName, new Map())
    const restMap = parkMap.get(parkName)!
    if (!restMap.has(restName)) restMap.set(restName, [])
    restMap.get(restName)!.push(item)
  }

  stats.parks = parkMap.size

  for (const [parkName, restMap] of parkMap) {
    stats.restaurants += restMap.size

    // Park with < 10 restaurants
    if (restMap.size < THRESHOLDS.MIN_RESTAURANTS_PER_PARK) {
      findings.push({
        item: '-', restaurant: '-', park: parkName,
        checkName: 'sparse_park', severity: 'HIGH', autoFixable: false,
        message: `Park has only ${restMap.size} restaurants (minimum ${THRESHOLDS.MIN_RESTAURANTS_PER_PARK})`,
        currentValue: `${restMap.size} restaurants`,
      })
    }

    // Restaurants with < 3 items
    for (const [restName, restItems] of restMap) {
      if (restItems.length < THRESHOLDS.MIN_ITEMS_PER_RESTAURANT) {
        findings.push({
          item: '-', restaurant: restName, park: parkName,
          checkName: 'sparse_restaurant', severity: 'MEDIUM', autoFixable: false,
          message: `Restaurant has only ${restItems.length} items (minimum ${THRESHOLDS.MIN_ITEMS_PER_RESTAURANT})`,
          currentValue: `${restItems.length} items`,
        })
      }
    }

    // Park null calorie coverage
    const allParkItems = Array.from(restMap.values()).flat()
    const nullCalCount = allParkItems.filter(i => {
      const n = nd(i)
      return !n || n.calories == null || n.calories === 0
    }).length
    const nullPct = (nullCalCount / allParkItems.length) * 100
    if (nullPct > THRESHOLDS.MAX_NULL_CALORIE_PCT) {
      findings.push({
        item: '-', restaurant: '-', park: parkName,
        checkName: 'null_calorie_coverage', severity: 'HIGH', autoFixable: false,
        message: `${nullPct.toFixed(0)}% of items have null/zero calories (max ${THRESHOLDS.MAX_NULL_CALORIE_PCT}%)`,
        currentValue: `${nullCalCount}/${allParkItems.length} items`,
      })
    }

    // Low confidence items
    const lowConfItems = allParkItems.filter(i => {
      const n = nd(i)
      return n && n.confidence_score != null && n.confidence_score < THRESHOLDS.MIN_CONFIDENCE_SCORE
    })
    if (lowConfItems.length > 0) {
      findings.push({
        item: '-', restaurant: '-', park: parkName,
        checkName: 'low_confidence', severity: 'MEDIUM', autoFixable: false,
        message: `${lowConfItems.length} items with confidence score < ${THRESHOLDS.MIN_CONFIDENCE_SCORE}`,
        currentValue: `${lowConfItems.length} items`,
      })
    }
  }

  return { pass: 'completeness', findings, autoFixes: [], stats }
}

// CLI entry point
if (process.argv[1]?.endsWith('completeness.ts') || process.argv[1]?.endsWith('completeness.js')) {
  import('./utils.js').then(async ({ createSupabaseClient, fetchAllItems, rootPath }) => {
    const { writeFileSync } = await import('fs')
    console.log('Fetching all items...')
    const supabase = createSupabaseClient()
    const items = await fetchAllItems(supabase)
    console.log(`Checking completeness for ${items.length} items...`)
    const result = checkCompleteness(items)
    const { high, medium, low } = {
      high: result.findings.filter(f => f.severity === 'HIGH').length,
      medium: result.findings.filter(f => f.severity === 'MEDIUM').length,
      low: result.findings.filter(f => f.severity === 'LOW').length,
    }
    console.log(`Completeness: ${high} HIGH, ${medium} MEDIUM, ${low} LOW`)
    console.log(`Parks: ${result.stats.parks}, Restaurants: ${result.stats.restaurants}`)
    writeFileSync(rootPath('audit', 'completeness-results.json'), JSON.stringify(result, null, 2))
  })
}
```

**Step 4: Run tests**

Run: `npx vitest run scripts/audit/__tests__/completeness.test.ts`

Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add scripts/audit/completeness.ts scripts/audit/__tests__/completeness.test.ts
git commit -m "feat(audit): completeness check module (sparse parks, restaurants, null coverage)"
```

---

### Task 6: Auto-Fix Module

**Files:**
- Create: `scripts/audit/auto-fix.ts`
- Create: `scripts/audit/__tests__/auto-fix.test.ts`

**Step 1: Write the failing test**

```typescript
// scripts/audit/__tests__/auto-fix.test.ts
import { describe, it, expect, vi } from 'vitest'
import { buildFixBatch } from '../auto-fix.js'
import type { AutoFix } from '../types.js'

describe('buildFixBatch', () => {
  it('groups multiple fixes for the same record', () => {
    const fixes: AutoFix[] = [
      { nutritionDataId: 'nd-1', item: 'A', restaurant: 'R', park: 'P', field: 'fiber', before: 60, after: 5, reason: 'fiber>carbs' },
      { nutritionDataId: 'nd-1', item: 'A', restaurant: 'R', park: 'P', field: 'sugar', before: 80, after: 50, reason: 'sugar>carbs' },
    ]
    const batch = buildFixBatch(fixes)
    expect(batch).toHaveLength(1)
    expect(batch[0].id).toBe('nd-1')
    expect(batch[0].updates).toEqual({ fiber: 5, sugar: 50 })
  })

  it('separates fixes for different records', () => {
    const fixes: AutoFix[] = [
      { nutritionDataId: 'nd-1', item: 'A', restaurant: 'R', park: 'P', field: 'fiber', before: 60, after: 5, reason: 'test' },
      { nutritionDataId: 'nd-2', item: 'B', restaurant: 'R', park: 'P', field: 'sodium', before: 48000, after: 4800, reason: 'test' },
    ]
    const batch = buildFixBatch(fixes)
    expect(batch).toHaveLength(2)
  })

  it('returns empty batch for empty fixes', () => {
    expect(buildFixBatch([])).toHaveLength(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/audit/__tests__/auto-fix.test.ts`

Expected: FAIL

**Step 3: Write auto-fix module**

```typescript
// scripts/audit/auto-fix.ts
import type { AutoFix } from './types.js'

export interface FixBatchEntry {
  id: string
  updates: Record<string, number>
  fixes: AutoFix[]
}

export function buildFixBatch(fixes: AutoFix[]): FixBatchEntry[] {
  const map = new Map<string, FixBatchEntry>()
  for (const fix of fixes) {
    if (!map.has(fix.nutritionDataId)) {
      map.set(fix.nutritionDataId, { id: fix.nutritionDataId, updates: {}, fixes: [] })
    }
    const entry = map.get(fix.nutritionDataId)!
    entry.updates[fix.field] = fix.after
    entry.fixes.push(fix)
  }
  return Array.from(map.values())
}

// CLI entry point — applies auto-fixes from accuracy pass
if (process.argv[1]?.endsWith('auto-fix.ts') || process.argv[1]?.endsWith('auto-fix.js')) {
  import('./utils.js').then(async ({ createSupabaseClient, fetchAllItems, rootPath }) => {
    const { readFileSync, writeFileSync, existsSync } = await import('fs')
    const DRY_RUN = process.argv.includes('--dry-run')

    // Read accuracy results
    const accPath = rootPath('audit', 'accuracy-results.json')
    if (!existsSync(accPath)) {
      console.error('No accuracy-results.json found. Run accuracy.ts first.')
      process.exit(1)
    }
    const accResult = JSON.parse(readFileSync(accPath, 'utf-8'))
    const fixes: AutoFix[] = accResult.autoFixes ?? []

    if (fixes.length === 0) {
      console.log('No auto-fixes needed.')
      writeFileSync(rootPath('audit', 'autofix-results.json'), JSON.stringify({ applied: 0, fixes: [] }, null, 2))
      return
    }

    const batch = buildFixBatch(fixes)
    console.log(`${batch.length} records to fix (${fixes.length} total fixes)`)

    if (DRY_RUN) {
      for (const entry of batch) {
        for (const fix of entry.fixes) {
          console.log(`[DRY] ${fix.item} @ ${fix.restaurant}: ${fix.field} ${fix.before} → ${fix.after} (${fix.reason})`)
        }
      }
      return
    }

    const supabase = createSupabaseClient()
    let applied = 0
    let failed = 0

    for (const entry of batch) {
      const { error } = await supabase.from('nutritional_data')
        .update(entry.updates)
        .eq('id', entry.id)

      if (error) {
        console.error(`[FAIL] ${entry.fixes[0].item}: ${error.message}`)
        failed++
      } else {
        for (const fix of entry.fixes) {
          console.log(`[FIXED] ${fix.item} @ ${fix.restaurant}: ${fix.field} ${fix.before} → ${fix.after}`)
        }
        applied++
      }
    }

    console.log(`Applied: ${applied}, Failed: ${failed}`)
    writeFileSync(rootPath('audit', 'autofix-results.json'), JSON.stringify({ applied, failed, fixes }, null, 2))
  })
}
```

**Step 4: Run tests**

Run: `npx vitest run scripts/audit/__tests__/auto-fix.test.ts`

Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add scripts/audit/auto-fix.ts scripts/audit/__tests__/auto-fix.test.ts
git commit -m "feat(audit): auto-fix module with batch grouping and --dry-run"
```

---

### Task 7: Report Module (GitHub Issue + Email)

**Files:**
- Create: `scripts/audit/report.ts`

**Step 1: Write report module**

```typescript
// scripts/audit/report.ts
import { execSync } from 'child_process'
import { google } from 'googleapis'
import { readFileSync, existsSync } from 'fs'
import type { AuditReport, AuditPassResult } from './types.js'
import { loadEnv, rootPath } from './utils.js'

const RECIPIENT = 'medpeds@gmail.com'
const REPO = 'beilerman/DiabetesGuide'

function loadPassResult(filename: string): AuditPassResult | null {
  const path = rootPath('audit', filename)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function buildReport(): AuditReport {
  const accuracy = loadPassResult('accuracy-results.json')
  const completeness = loadPassResult('completeness-results.json')
  const autofix = (() => {
    const path = rootPath('audit', 'autofix-results.json')
    if (!existsSync(path)) return { applied: 0, fixes: [] }
    return JSON.parse(readFileSync(path, 'utf-8'))
  })()
  const graduation = (() => {
    const path = rootPath('audit', 'graduation-state.json')
    if (!existsSync(path)) return { mode: 'daily', consecutiveCleanDays: 0 }
    return JSON.parse(readFileSync(path, 'utf-8'))
  })()

  const passes = [accuracy, completeness].filter(Boolean) as AuditPassResult[]
  const allFindings = passes.flatMap(p => p.findings)

  return {
    date: new Date().toISOString().split('T')[0],
    mode: graduation.mode,
    passes,
    totalFindings: {
      high: allFindings.filter(f => f.severity === 'HIGH').length,
      medium: allFindings.filter(f => f.severity === 'MEDIUM').length,
      low: allFindings.filter(f => f.severity === 'LOW').length,
    },
    totalAutoFixes: autofix.applied ?? 0,
    graduationDay: graduation.consecutiveCleanDays ?? 0,
  }
}

function formatMarkdown(report: AuditReport): string {
  const { high, medium, low } = report.totalFindings
  const status = high > 0 ? '🔴 HIGH FINDINGS' : medium > 0 ? '🟡 NEEDS ATTENTION' : '🟢 CLEAN'

  let md = `# Daily Audit Report — ${report.date}\n\n`
  md += `## Status: ${status}\n\n`
  md += `| Severity | Count |\n|----------|-------|\n`
  md += `| HIGH | ${high} |\n| MEDIUM | ${medium} |\n| LOW | ${low} |\n\n`

  // Auto-fixes
  if (report.totalAutoFixes > 0) {
    const autofix = JSON.parse(readFileSync(rootPath('audit', 'autofix-results.json'), 'utf-8'))
    md += `### Auto-Fixes Applied (${report.totalAutoFixes})\n\n`
    for (const fix of (autofix.fixes ?? []).slice(0, 20)) {
      md += `- ✅ **${fix.item}** @ ${fix.restaurant}: ${fix.field} ${fix.before} → ${fix.after}\n`
    }
    if ((autofix.fixes?.length ?? 0) > 20) md += `- ... and ${autofix.fixes.length - 20} more\n`
    md += '\n'
  }

  // Findings requiring review (HIGH + MEDIUM only)
  const reviewFindings = report.passes
    .flatMap(p => p.findings)
    .filter(f => f.severity !== 'LOW' && !f.autoFixable)
  if (reviewFindings.length > 0) {
    md += `### Findings Requiring Review (${reviewFindings.length})\n\n`
    md += `| Severity | Item | Restaurant | Park | Issue |\n|----------|------|-----------|------|-------|\n`
    for (const f of reviewFindings.slice(0, 50)) {
      md += `| ${f.severity} | ${f.item} | ${f.restaurant} | ${f.park} | ${f.message} |\n`
    }
    if (reviewFindings.length > 50) md += `\n*... and ${reviewFindings.length - 50} more*\n`
    md += '\n'
  }

  // Completeness summary
  const comp = report.passes.find(p => p.pass === 'completeness')
  if (comp) {
    md += `### Completeness\n\n`
    md += `- Parks: ${comp.stats.parks}, Restaurants: ${comp.stats.restaurants}, Items: ${comp.stats.items}\n`
    const sparseParks = comp.findings.filter(f => f.checkName === 'sparse_park')
    const sparseRests = comp.findings.filter(f => f.checkName === 'sparse_restaurant')
    if (sparseParks.length) md += `- ⚠️ ${sparseParks.length} parks with <10 restaurants\n`
    else md += `- ✅ All parks have ≥10 restaurants\n`
    if (sparseRests.length) md += `- ⚠️ ${sparseRests.length} restaurants with <3 items\n`
    else md += `- ✅ All restaurants have ≥3 items\n`
    md += '\n'
  }

  // Graduation
  md += `### Graduation Progress\n\n`
  if (report.mode === 'weekly') {
    md += `✅ **Weekly mode** — stable\n`
  } else {
    md += `📅 Day **${report.graduationDay}** of 14 (need 14 consecutive clean days)\n`
    if (report.totalAutoFixes > 0 || high > 0 || medium > 0) {
      md += `⚠️ Counter reset today (auto-fixes or findings detected)\n`
    }
  }

  return md
}

function formatHtml(markdown: string): string {
  // Simple markdown → HTML conversion for email
  return '<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">'
    + markdown
        .replace(/^# (.+)$/gm, '<h1 style="border-bottom: 2px solid #0d9488; padding-bottom: 8px;">$1</h1>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/^\| (.+)$/gm, (_, row) => {
          const cells = row.split('|').map((c: string) => c.trim()).filter(Boolean)
          return '<tr>' + cells.map((c: string) => `<td style="padding: 4px 8px; border: 1px solid #ddd;">${c}</td>`).join('') + '</tr>'
        })
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/\n/g, '<br>')
    + '</div>'
}

async function postGitHubIssue(markdown: string, report: AuditReport) {
  const { high, medium } = report.totalFindings
  const label = high > 0 ? 'audit:high' : medium > 0 ? 'audit:medium' : 'audit:clean'
  const title = `Audit Report — ${report.date}`

  try {
    // Check for existing open audit issue
    const existing = execSync(
      `gh issue list --repo ${REPO} --label audit --state open --json number --limit 1`,
      { encoding: 'utf-8' }
    ).trim()
    const issues = JSON.parse(existing || '[]')

    if (issues.length > 0) {
      // Update existing issue
      execSync(`gh issue comment ${issues[0].number} --repo ${REPO} --body "${markdown.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`)
      console.log(`Updated GitHub issue #${issues[0].number}`)
    } else {
      // Create new issue
      execSync(`gh issue create --repo ${REPO} --title "${title}" --body "${markdown.replace(/"/g, '\\"').replace(/\n/g, '\\n')}" --label audit`)
      console.log('Created new GitHub audit issue')
    }
  } catch (err) {
    console.error('GitHub issue failed (continuing):', err instanceof Error ? err.message : err)
  }
}

async function sendEmail(subject: string, html: string) {
  const env = loadEnv()
  const clientId = env['GMAIL_CLIENT_ID'] || process.env.GMAIL_CLIENT_ID
  const clientSecret = env['GMAIL_CLIENT_SECRET'] || process.env.GMAIL_CLIENT_SECRET
  const refreshToken = env['GMAIL_REFRESH_TOKEN'] || process.env.GMAIL_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    console.log('Gmail credentials not configured — skipping email')
    return
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret)
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

  const messageParts = [
    `To: ${RECIPIENT}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
  ]
  const raw = Buffer.from(messageParts.join('\r\n')).toString('base64url')

  try {
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
    console.log(`Email sent to ${RECIPIENT}`)
  } catch (err) {
    console.error('Email send failed (continuing):', err instanceof Error ? err.message : err)
  }
}

async function main() {
  const report = buildReport()
  const markdown = formatMarkdown(report)

  // Save markdown report
  const { writeFileSync, mkdirSync } = await import('fs')
  mkdirSync(rootPath('audit', 'daily'), { recursive: true })
  writeFileSync(rootPath('audit', 'daily', `${report.date}.md`), markdown)
  console.log(`Report saved to audit/daily/${report.date}.md`)

  // Post to GitHub
  await postGitHubIssue(markdown, report)

  // Send email
  const { high, medium } = report.totalFindings
  const status = high > 0 ? '🔴' : medium > 0 ? '🟡' : '🟢'
  const subject = `${status} DiabetesGuide Audit — ${report.date}`
  await sendEmail(subject, formatHtml(markdown))
}

main().catch(err => { console.error(err); process.exit(1) })
```

**Step 2: Commit**

```bash
git add scripts/audit/report.ts
git commit -m "feat(audit): report module — GitHub Issue + email digest"
```

---

### Task 8: Graduation Module

**Files:**
- Create: `scripts/audit/graduation.ts`
- Create: `scripts/audit/__tests__/graduation.test.ts`

**Step 1: Write the failing test**

```typescript
// scripts/audit/__tests__/graduation.test.ts
import { describe, it, expect } from 'vitest'
import { updateGraduation } from '../graduation.js'
import type { GraduationState, AuditReport } from '../types.js'

function makeState(overrides: Partial<GraduationState> = {}): GraduationState {
  return {
    mode: 'daily',
    consecutiveCleanDays: 0,
    lastAudit: '2026-02-25',
    autoFixesApplied: 0,
    graduationThreshold: 14,
    history: [],
    ...overrides,
  }
}

describe('updateGraduation', () => {
  it('increments clean day counter on clean run', () => {
    const state = makeState({ consecutiveCleanDays: 5 })
    const result = updateGraduation(state, { high: 0, medium: 0, low: 10 }, 0)
    expect(result.consecutiveCleanDays).toBe(6)
  })

  it('resets counter when HIGH findings exist', () => {
    const state = makeState({ consecutiveCleanDays: 10 })
    const result = updateGraduation(state, { high: 1, medium: 0, low: 0 }, 0)
    expect(result.consecutiveCleanDays).toBe(0)
  })

  it('resets counter when auto-fixes were applied', () => {
    const state = makeState({ consecutiveCleanDays: 10 })
    const result = updateGraduation(state, { high: 0, medium: 0, low: 5 }, 3)
    expect(result.consecutiveCleanDays).toBe(0)
  })

  it('graduates to weekly after 14 clean days', () => {
    const state = makeState({ consecutiveCleanDays: 13 })
    const result = updateGraduation(state, { high: 0, medium: 0, low: 5 }, 0)
    expect(result.consecutiveCleanDays).toBe(14)
    expect(result.mode).toBe('weekly')
  })

  it('reverts to daily if weekly run has HIGH findings', () => {
    const state = makeState({ mode: 'weekly', consecutiveCleanDays: 20 })
    const result = updateGraduation(state, { high: 1, medium: 0, low: 0 }, 0)
    expect(result.mode).toBe('daily')
    expect(result.consecutiveCleanDays).toBe(0)
  })

  it('keeps history to 30 entries', () => {
    const state = makeState({ history: Array.from({ length: 30 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      high: 0, medium: 0, low: 0, autoFixes: 0,
    }))})
    const result = updateGraduation(state, { high: 0, medium: 0, low: 0 }, 0)
    expect(result.history).toHaveLength(30)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/audit/__tests__/graduation.test.ts`

Expected: FAIL

**Step 3: Write graduation module**

```typescript
// scripts/audit/graduation.ts
import type { GraduationState } from './types.js'
import { loadGraduationState, saveGraduationState, rootPath } from './utils.js'
import { readFileSync, existsSync } from 'fs'
import { THRESHOLDS } from './thresholds.js'

export function updateGraduation(
  state: GraduationState,
  findings: { high: number; medium: number; low: number },
  autoFixCount: number,
): GraduationState {
  const today = new Date().toISOString().split('T')[0]
  const isClean = findings.high === 0 && findings.medium === 0 && autoFixCount === 0

  const updated = { ...state }
  updated.lastAudit = today
  updated.autoFixesApplied = autoFixCount

  // Add to history (keep last 30)
  updated.history = [
    ...state.history,
    { date: today, high: findings.high, medium: findings.medium, low: findings.low, autoFixes: autoFixCount },
  ].slice(-30)

  if (isClean) {
    updated.consecutiveCleanDays = state.consecutiveCleanDays + 1
    // Graduate after threshold
    if (updated.consecutiveCleanDays >= THRESHOLDS.GRADUATION_THRESHOLD) {
      updated.mode = 'weekly'
    }
  } else {
    updated.consecutiveCleanDays = 0
    // Revert to daily if currently weekly and problems found
    if (state.mode === 'weekly' && (findings.high > 0 || findings.medium > 0)) {
      updated.mode = 'daily'
    }
  }

  return updated
}

// CLI entry point
if (process.argv[1]?.endsWith('graduation.ts') || process.argv[1]?.endsWith('graduation.js')) {
  const state = loadGraduationState()

  // Read today's results
  const accPath = rootPath('audit', 'accuracy-results.json')
  const compPath = rootPath('audit', 'completeness-results.json')
  const fixPath = rootPath('audit', 'autofix-results.json')

  let high = 0, medium = 0, low = 0
  for (const path of [accPath, compPath]) {
    if (existsSync(path)) {
      const result = JSON.parse(readFileSync(path, 'utf-8'))
      high += (result.findings ?? []).filter((f: any) => f.severity === 'HIGH').length
      medium += (result.findings ?? []).filter((f: any) => f.severity === 'MEDIUM').length
      low += (result.findings ?? []).filter((f: any) => f.severity === 'LOW').length
    }
  }

  const autoFixes = existsSync(fixPath)
    ? JSON.parse(readFileSync(fixPath, 'utf-8')).applied ?? 0
    : 0

  const updated = updateGraduation(state, { high, medium, low }, autoFixes)
  saveGraduationState(updated)

  console.log(`Mode: ${updated.mode}`)
  console.log(`Consecutive clean days: ${updated.consecutiveCleanDays}/${THRESHOLDS.GRADUATION_THRESHOLD}`)
  if (updated.mode !== state.mode) {
    console.log(`*** MODE CHANGED: ${state.mode} → ${updated.mode} ***`)
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run scripts/audit/__tests__/graduation.test.ts`

Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add scripts/audit/graduation.ts scripts/audit/__tests__/graduation.test.ts
git commit -m "feat(audit): graduation module — daily→weekly after 14 clean days"
```

---

### Task 9: Pipeline Orchestrator

**Files:**
- Create: `scripts/audit/pipeline.ts`

**Step 1: Write orchestrator**

```typescript
// scripts/audit/pipeline.ts
/**
 * Main audit pipeline orchestrator.
 * Runs: accuracy → auto-fix → completeness → report → graduation
 *
 * Usage: npx tsx scripts/audit/pipeline.ts [--dry-run] [--skip-email] [--skip-github]
 */
import { createSupabaseClient, fetchAllItems, rootPath } from './utils.js'
import { checkAccuracy } from './accuracy.js'
import { checkCompleteness } from './completeness.js'
import { buildFixBatch } from './auto-fix.js'
import { writeFileSync, mkdirSync } from 'fs'

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  const startTime = Date.now()
  mkdirSync(rootPath('audit', 'daily'), { recursive: true })

  console.log(`=== Audit Pipeline ${new Date().toISOString().split('T')[0]} ===\n`)

  // 1. Fetch all items
  console.log('[1/5] Fetching data...')
  const supabase = createSupabaseClient()
  const items = await fetchAllItems(supabase)
  console.log(`  ${items.length} items loaded\n`)

  // 2. Accuracy checks
  console.log('[2/5] Accuracy checks...')
  const accuracy = checkAccuracy(items)
  writeFileSync(rootPath('audit', 'accuracy-results.json'), JSON.stringify(accuracy, null, 2))
  const accH = accuracy.findings.filter(f => f.severity === 'HIGH').length
  const accM = accuracy.findings.filter(f => f.severity === 'MEDIUM').length
  console.log(`  ${accH} HIGH, ${accM} MEDIUM, ${accuracy.autoFixes.length} auto-fixable\n`)

  // 3. Auto-fix
  console.log('[3/5] Auto-fix...')
  if (accuracy.autoFixes.length > 0 && !DRY_RUN) {
    const batch = buildFixBatch(accuracy.autoFixes)
    let applied = 0, failed = 0
    for (const entry of batch) {
      const { error } = await supabase.from('nutritional_data')
        .update(entry.updates).eq('id', entry.id)
      if (error) { failed++; console.error(`  [FAIL] ${entry.fixes[0].item}: ${error.message}`) }
      else { applied++; entry.fixes.forEach(f => console.log(`  [FIXED] ${f.item}: ${f.field} ${f.before} → ${f.after}`)) }
    }
    writeFileSync(rootPath('audit', 'autofix-results.json'), JSON.stringify({ applied, failed, fixes: accuracy.autoFixes }, null, 2))
    console.log(`  Applied: ${applied}, Failed: ${failed}\n`)
  } else {
    writeFileSync(rootPath('audit', 'autofix-results.json'), JSON.stringify({ applied: 0, fixes: [] }, null, 2))
    console.log(`  ${DRY_RUN ? '[DRY RUN] ' : ''}No fixes needed\n`)
  }

  // 4. Completeness checks
  console.log('[4/5] Completeness checks...')
  const completeness = checkCompleteness(items)
  writeFileSync(rootPath('audit', 'completeness-results.json'), JSON.stringify(completeness, null, 2))
  const compH = completeness.findings.filter(f => f.severity === 'HIGH').length
  const compM = completeness.findings.filter(f => f.severity === 'MEDIUM').length
  console.log(`  ${compH} HIGH, ${compM} MEDIUM\n`)

  // 5. Report + Graduation (dynamic imports for optional deps)
  console.log('[5/5] Reporting...')
  if (!process.argv.includes('--skip-report')) {
    // Report and graduation are run as separate scripts to isolate failures
    const { execSync } = await import('child_process')
    try {
      execSync('npx tsx scripts/audit/graduation.ts', { stdio: 'inherit', cwd: rootPath() })
    } catch { console.error('  Graduation step failed (continuing)') }
    try {
      const skipFlags = [
        process.argv.includes('--skip-email') ? '--skip-email' : '',
        process.argv.includes('--skip-github') ? '--skip-github' : '',
      ].filter(Boolean).join(' ')
      execSync(`npx tsx scripts/audit/report.ts ${skipFlags}`, { stdio: 'inherit', cwd: rootPath() })
    } catch { console.error('  Report step failed (continuing)') }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n=== Done in ${elapsed}s ===`)
  console.log(`Total: ${accH + compH} HIGH, ${accM + compM} MEDIUM`)
  if (accH + compH > 0) process.exit(1)
}

main().catch(err => { console.error(err); process.exit(1) })
```

**Step 2: Commit**

```bash
git add scripts/audit/pipeline.ts
git commit -m "feat(audit): pipeline orchestrator — runs accuracy → fix → completeness → report"
```

---

### Task 10: External Check Module (Stub)

**Files:**
- Create: `scripts/audit/external.ts`

**Step 1: Write external check stub**

This is the most complex module (scraper health, chain cross-reference). Start with a stub that checks scraper health and flag stale data. Chain cross-reference will be a follow-up enhancement.

```typescript
// scripts/audit/external.ts
import type { AuditFinding, AuditPassResult } from './types.js'
import { createSupabaseClient, rootPath } from './utils.js'
import { THRESHOLDS } from './thresholds.js'
import { writeFileSync } from 'fs'

async function checkScraperHealth(): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = []
  const scrapers = [
    { name: 'Universal', cmd: 'npx tsx scripts/scrapers/universal.ts --dry-run' },
    // AllEars known blocked — just report status
    { name: 'AllEars', cmd: null, status: 'blocked_cloudflare' },
  ]

  for (const s of scrapers) {
    if (!s.cmd) {
      findings.push({
        item: '-', restaurant: '-', park: s.name,
        checkName: 'scraper_health', severity: 'LOW', autoFixable: false,
        message: `${s.name} scraper: ${s.status}`,
      })
      continue
    }
    // Scraper health checks would go here — skipping actual execution for now
    // to avoid scraping on every audit run. Only check on weekly runs.
  }

  return findings
}

async function checkStaleData(): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = []
  const supabase = createSupabaseClient()

  // Find items with low confidence not updated in 90+ days
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - THRESHOLDS.STALE_DATA_DAYS)
  const cutoffStr = cutoff.toISOString()

  // Supabase doesn't have updated_at on nutritional_data by default
  // This check will work once the column is added; for now, use confidence as proxy
  const { data, error } = await supabase.from('nutritional_data')
    .select('id, confidence_score, menu_item:menu_items(name, restaurant:restaurants(name, park:parks(name)))')
    .lt('confidence_score', THRESHOLDS.STALE_CONFIDENCE_MAX)
    .limit(100)

  if (!error && data) {
    // Group by park for summary
    const parkCounts = new Map<string, number>()
    for (const row of data as any[]) {
      const park = row.menu_item?.restaurant?.park?.name ?? 'Unknown'
      parkCounts.set(park, (parkCounts.get(park) ?? 0) + 1)
    }

    for (const [park, count] of parkCounts) {
      if (count >= 10) {
        findings.push({
          item: '-', restaurant: '-', park,
          checkName: 'low_confidence_cluster', severity: 'LOW', autoFixable: false,
          message: `${count} items with confidence < ${THRESHOLDS.STALE_CONFIDENCE_MAX} — may need re-estimation`,
        })
      }
    }
  }

  return findings
}

async function main() {
  console.log('Running external checks...')
  const scraperFindings = await checkScraperHealth()
  const staleFindings = await checkStaleData()

  const result: AuditPassResult = {
    pass: 'external',
    findings: [...scraperFindings, ...staleFindings],
    autoFixes: [],
    stats: { scraperChecks: scraperFindings.length, staleChecks: staleFindings.length },
  }

  writeFileSync(rootPath('audit', 'external-results.json'), JSON.stringify(result, null, 2))
  console.log(`External: ${result.findings.length} findings`)
}

main().catch(err => { console.error(err); process.exit(1) })
```

**Step 2: Commit**

```bash
git add scripts/audit/external.ts
git commit -m "feat(audit): external check module (scraper health, stale data detection)"
```

---

### Task 11: npm Scripts

**Files:**
- Modify: `package.json`

**Step 1: Add audit scripts to package.json**

Add these to the `"scripts"` section:

```json
"audit:pipeline": "tsx scripts/audit/pipeline.ts",
"audit:accuracy": "tsx scripts/audit/accuracy.ts",
"audit:completeness": "tsx scripts/audit/completeness.ts",
"audit:autofix": "tsx scripts/audit/auto-fix.ts",
"audit:external": "tsx scripts/audit/external.ts",
"audit:report": "tsx scripts/audit/report.ts",
"audit:graduation": "tsx scripts/audit/graduation.ts",
"audit:migrate": "tsx scripts/audit/migrate-constraints.ts"
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore: add audit pipeline npm scripts"
```

---

### Task 12: GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/daily-audit.yml`

**Step 1: Write workflow**

```yaml
name: Daily Audit

on:
  schedule:
    # 6 AM UTC = 1 AM ET daily
    - cron: '0 6 * * *'
  workflow_dispatch:

jobs:
  audit:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run audit pipeline
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          GMAIL_CLIENT_ID: ${{ secrets.GMAIL_CLIENT_ID }}
          GMAIL_CLIENT_SECRET: ${{ secrets.GMAIL_CLIENT_SECRET }}
          GMAIL_REFRESH_TOKEN: ${{ secrets.GMAIL_REFRESH_TOKEN }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npm run audit:pipeline

      - name: Run external checks
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: npm run audit:external
        continue-on-error: true

      - name: Upload audit artifacts
        uses: actions/upload-artifact@v4
        with:
          name: audit-report-${{ github.run_id }}
          path: |
            audit/accuracy-results.json
            audit/completeness-results.json
            audit/autofix-results.json
            audit/external-results.json
            audit/daily/*.md
          retention-days: 30

      - name: Commit audit results
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add audit/graduation-state.json audit/daily/
          git diff --cached --quiet || git commit -m "audit: daily run $(date +%Y-%m-%d) [skip ci]"
          git push
```

**Step 2: Verify secrets exist**

Confirm these GitHub repo secrets are set: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`

Run: `gh secret list --repo beilerman/DiabetesGuide`

**Step 3: Commit**

```bash
git add .github/workflows/daily-audit.yml
git commit -m "feat(audit): GitHub Actions daily audit workflow (6 AM UTC)"
```

---

### Task 13: Initialize Graduation State + Create audit Label

**Step 1: Create initial graduation state file**

```bash
mkdir -p audit/daily
```

Write `audit/graduation-state.json`:
```json
{
  "mode": "daily",
  "consecutiveCleanDays": 0,
  "lastAudit": "",
  "autoFixesApplied": 0,
  "graduationThreshold": 14,
  "history": []
}
```

**Step 2: Create GitHub label for audit issues**

Run: `gh label create audit --repo beilerman/DiabetesGuide --description "Automated audit findings" --color "D4C5F9"`

**Step 3: Commit**

```bash
git add audit/graduation-state.json
git commit -m "chore: initialize graduation state + audit label"
```

---

### Task 14: Local Smoke Test

**Step 1: Run the full pipeline locally with --dry-run**

Run:
```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) \
SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) \
npx tsx scripts/audit/pipeline.ts --dry-run --skip-email --skip-github
```

Expected: Pipeline completes, prints finding counts, writes JSON files to audit/

**Step 2: Run all audit tests**

Run: `npx vitest run scripts/audit/__tests__/`

Expected: All tests pass (accuracy: 7, completeness: 4, auto-fix: 3, graduation: 6 = 20 tests)

**Step 3: Run pipeline for real (no --dry-run)**

Run:
```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) \
SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) \
npx tsx scripts/audit/pipeline.ts --skip-email --skip-github
```

Expected: Pipeline completes, auto-fixes applied (if any), results files written

**Step 4: Verify results files exist**

Run: `ls -la audit/accuracy-results.json audit/completeness-results.json audit/autofix-results.json`

**Step 5: Commit clean state**

```bash
git add -A audit/
git commit -m "audit: first pipeline run results"
```

---

### Task 15: Trigger GitHub Actions + Verify

**Step 1: Push all changes**

Run: `git push origin main`

**Step 2: Manually trigger workflow**

Run: `gh workflow run daily-audit.yml --repo beilerman/DiabetesGuide`

**Step 3: Monitor run**

Run: `gh run watch --repo beilerman/DiabetesGuide`

Expected: Workflow completes successfully, audit artifacts uploaded, graduation state committed

**Step 4: Verify GitHub Issue was created**

Run: `gh issue list --repo beilerman/DiabetesGuide --label audit`

Expected: One open issue with today's audit report
