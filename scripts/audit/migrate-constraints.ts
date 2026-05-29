/**
 * Database constraints migration script for the scheduled audit system.
 *
 * Outputs SQL for the user to run in Supabase SQL Editor.
 * This script does NOT execute SQL directly -- it only prints it.
 *
 * Includes:
 *  - CHECK constraints on nutritional_data (fiber<=carbs, sugar<=carbs, ranges, non-negative)
 *  - audit_log table with RLS (public SELECT, service-role INSERT/UPDATE)
 *  - Soft validation trigger on nutritional_data (logs Atwater deviations and high calories)
 *
 * Usage:
 *   npx tsx scripts/audit/migrate-constraints.ts
 *   npx tsx scripts/audit/migrate-constraints.ts --dry-run
 */

const SQL = `
-- ============================================================
-- DiabetesGuide: Database Constraints Migration
-- Run this in the Supabase SQL Editor.
-- All statements are idempotent (safe to re-run).
-- ============================================================

-- -------------------------------------------------------
-- 1. CHECK constraints on nutritional_data — two-step (NOT VALID + VALIDATE)
-- -------------------------------------------------------
--
-- Step 1 below runs a pre-check that counts existing violations BEFORE adding
-- the constraint. If any pre-check returns > 0, STOP and run a data-fix script
-- (e.g. fix-data-anomalies.ts, fix-audit-findings.ts) before re-running.
--
-- Step 2 adds each constraint as NOT VALID. ADD CONSTRAINT NOT VALID takes the
-- ACCESS EXCLUSIVE lock only briefly (writes a catalog row; no full-table scan).
-- The constraint applies to new and updated rows immediately.
--
-- Step 3 issues VALIDATE CONSTRAINT for each. VALIDATE takes only SHARE UPDATE
-- EXCLUSIVE — concurrent reads continue, concurrent writes are blocked
-- briefly. VALIDATE is restartable: failure leaves the constraint in NOT VALID
-- state, and the same VALIDATE can be re-issued after fixing offending rows.

-- Step 1: Pre-check violation counts. Re-run after any data-fix until each
-- count is 0; only then proceed to Step 2.
SELECT
  COUNT(*) FILTER (WHERE fiber IS NOT NULL AND carbs IS NOT NULL AND fiber > carbs)      AS violations_fiber_gt_carbs,
  COUNT(*) FILTER (WHERE sugar IS NOT NULL AND carbs IS NOT NULL AND sugar > carbs)      AS violations_sugar_gt_carbs,
  COUNT(*) FILTER (WHERE calories IS NOT NULL AND (calories < 0 OR calories > 5000))     AS violations_calories_range,
  COUNT(*) FILTER (WHERE sodium IS NOT NULL AND (sodium < 0 OR sodium > 10000))          AS violations_sodium_range,
  COUNT(*) FILTER (WHERE
    (carbs IS NOT NULL AND carbs < 0) OR (fat IS NOT NULL AND fat < 0) OR
    (protein IS NOT NULL AND protein < 0) OR (sugar IS NOT NULL AND sugar < 0) OR
    (fiber IS NOT NULL AND fiber < 0)
  ) AS violations_macros_negative
FROM nutritional_data;

-- Step 2: Add constraints as NOT VALID (catalog-only, no table scan).
DO $$ BEGIN
  ALTER TABLE nutritional_data
    ADD CONSTRAINT chk_fiber_lte_carbs
    CHECK (fiber IS NULL OR carbs IS NULL OR fiber <= carbs) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE nutritional_data
    ADD CONSTRAINT chk_sugar_lte_carbs
    CHECK (sugar IS NULL OR carbs IS NULL OR sugar <= carbs) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE nutritional_data
    ADD CONSTRAINT chk_calories_range
    CHECK (calories IS NULL OR (calories >= 0 AND calories <= 5000)) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE nutritional_data
    ADD CONSTRAINT chk_sodium_range
    CHECK (sodium IS NULL OR (sodium >= 0 AND sodium <= 10000)) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE nutritional_data
    ADD CONSTRAINT chk_macros_non_negative
    CHECK (
      (carbs   IS NULL OR carbs   >= 0) AND
      (fat     IS NULL OR fat     >= 0) AND
      (protein IS NULL OR protein >= 0) AND
      (sugar   IS NULL OR sugar   >= 0) AND
      (fiber   IS NULL OR fiber   >= 0)
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Step 3: VALIDATE existing rows against the new constraints. Restartable.
-- Run AFTER step 2 succeeds; can be re-run if a violation is found.
ALTER TABLE nutritional_data VALIDATE CONSTRAINT chk_fiber_lte_carbs;
ALTER TABLE nutritional_data VALIDATE CONSTRAINT chk_sugar_lte_carbs;
ALTER TABLE nutritional_data VALIDATE CONSTRAINT chk_calories_range;
ALTER TABLE nutritional_data VALIDATE CONSTRAINT chk_sodium_range;
ALTER TABLE nutritional_data VALIDATE CONSTRAINT chk_macros_non_negative;

-- Rollback: ALTER TABLE nutritional_data DROP CONSTRAINT <name>;

-- freshness / source detail columns used by audit and alcohol filtering
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE nutritional_data
  ADD COLUMN IF NOT EXISTS alcohol_grams DECIMAL(6, 2),
  ADD COLUMN IF NOT EXISTS source_detail TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurants_park_name_unique
  ON restaurants(park_id, lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_items_restaurant_name_unique
  ON menu_items(restaurant_id, lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS idx_nutritional_data_menu_item_unique
  ON nutritional_data(menu_item_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $updated_at$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$updated_at$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_restaurants_updated_at ON restaurants;
CREATE TRIGGER trg_restaurants_updated_at
  BEFORE UPDATE ON restaurants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_menu_items_updated_at ON menu_items;
CREATE TRIGGER trg_menu_items_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_nutritional_data_updated_at ON nutritional_data;
CREATE TRIGGER trg_nutritional_data_updated_at
  BEFORE UPDATE ON nutritional_data
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- -------------------------------------------------------
-- 2. audit_log table
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name  TEXT         NOT NULL,
  record_id   UUID         NOT NULL,
  check_name  TEXT         NOT NULL,
  severity    TEXT         NOT NULL CHECK (severity IN ('HIGH', 'MEDIUM', 'LOW')),
  message     TEXT         NOT NULL,
  details     JSONB,
  auto_fixed  BOOLEAN      DEFAULT FALSE,
  reviewed    BOOLEAN      DEFAULT FALSE,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_audit_log_record   ON audit_log (record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_severity ON audit_log (severity);
CREATE INDEX IF NOT EXISTS idx_audit_log_check    ON audit_log (check_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_created  ON audit_log (created_at DESC);

-- RLS: enable and add policies
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Public SELECT (read-only via anon key, matching other tables)
DO $$ BEGIN
  CREATE POLICY "audit_log_select_all"
    ON audit_log FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service-role INSERT
DO $$ BEGIN
  CREATE POLICY "audit_log_insert_service"
    ON audit_log FOR INSERT
    TO service_role
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service-role UPDATE
DO $$ BEGIN
  CREATE POLICY "audit_log_update_service"
    ON audit_log FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- -------------------------------------------------------
-- 3. Soft validation trigger on nutritional_data
-- -------------------------------------------------------
-- Logs warnings to audit_log instead of rejecting writes.
-- Detects Atwater caloric-math deviations and very high calorie items.
-- -------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_nutrition_soft_validate()
RETURNS TRIGGER AS $fn$
DECLARE
  v_item_name  TEXT;
  v_is_alcohol BOOLEAN := FALSE;
  v_atwater    NUMERIC;
  v_deviation  NUMERIC;
BEGIN
  -- Skip rows with no calorie data
  IF NEW.calories IS NULL OR NEW.calories = 0 THEN
    RETURN NEW;
  END IF;

  -- Look up item name for alcohol detection
  SELECT name INTO v_item_name
    FROM menu_items
   WHERE id = NEW.menu_item_id;

  -- Detect alcoholic items by name.
  -- Match beer/wine/cocktail/margarita/sangria/mimosa/martini/daiquiri/mojito,
  -- but EXCLUDE food items that merely contain those words as ingredients:
  --   beer-battered, beer-braised, wine-braised, wine-infused, root beer, butterbeer, ginger beer
  IF v_item_name IS NOT NULL THEN
    v_is_alcohol := (
      v_item_name ~* '\\m(beer|ale|lager|stout|ipa|pilsner|porter)\\M'
      OR v_item_name ~* '\\m(wine|sangria|mimosa|champagne|prosecco|bellini)\\M'
      OR v_item_name ~* '\\m(cocktail|margarita|martini|daiquiri|mojito|paloma|mule|spritz|sour|old fashioned|negroni)\\M'
      OR v_item_name ~* '\\m(bourbon|whiskey|vodka|rum|tequila|gin|sake|soju|mead|cider)\\M'
    )
    AND NOT (
      v_item_name ~* '(beer[- ]batter|beer[- ]brais|beer[- ]cheese|beer[- ]bread)'
      OR v_item_name ~* '(wine[- ]brais|wine[- ]infus|wine[- ]poach|wine[- ]reduc|wine[- ]sauce|wine[- ]glaz)'
      OR v_item_name ~* '(root beer|butterbeer|ginger beer|birch beer)'
      OR v_item_name ~* '(rum[- ]cake|rum[- ]glaz|rum[- ]sauce|rum[- ]infus)'
    );
  END IF;

  -- Atwater caloric math check (non-alcohol only)
  IF NOT v_is_alcohol
     AND NEW.protein IS NOT NULL
     AND NEW.carbs   IS NOT NULL
     AND NEW.fat     IS NOT NULL
  THEN
    v_atwater := (NEW.protein * 4) + (NEW.carbs * 4) + (NEW.fat * 9);

    IF v_atwater > 0 THEN
      v_deviation := ABS(NEW.calories - v_atwater) / v_atwater;

      IF v_deviation > 0.30 THEN
        INSERT INTO audit_log (table_name, record_id, check_name, severity, message, details)
        VALUES (
          'nutritional_data',
          NEW.menu_item_id,
          'atwater_deviation',
          CASE WHEN v_deviation > 0.50 THEN 'HIGH' ELSE 'MEDIUM' END,
          format('Caloric math deviation %.0f%% for "%s": stated %s cal vs Atwater estimate %s cal',
                 v_deviation * 100, COALESCE(v_item_name, 'unknown'), NEW.calories, ROUND(v_atwater)),
          jsonb_build_object(
            'stated_calories', NEW.calories,
            'atwater_estimate', ROUND(v_atwater),
            'deviation_pct', ROUND(v_deviation * 100),
            'protein', NEW.protein,
            'carbs', NEW.carbs,
            'fat', NEW.fat,
            'item_name', v_item_name
          )
        );
      END IF;
    END IF;
  END IF;

  -- Very high calorie check
  IF NEW.calories > 3000 THEN
    INSERT INTO audit_log (table_name, record_id, check_name, severity, message, details)
    VALUES (
      'nutritional_data',
      NEW.menu_item_id,
      'extreme_calories',
      'MEDIUM',
      format('Very high calories (%s) for "%s"', NEW.calories, COALESCE(v_item_name, 'unknown')),
      jsonb_build_object(
        'calories', NEW.calories,
        'item_name', v_item_name
      )
    );
  END IF;

  -- Always allow the write (soft validation)
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger (drop first for idempotency)
DROP TRIGGER IF EXISTS trg_nutrition_soft_validate ON nutritional_data;

CREATE TRIGGER trg_nutrition_soft_validate
  BEFORE INSERT OR UPDATE ON nutritional_data
  FOR EACH ROW
  EXECUTE FUNCTION fn_nutrition_soft_validate();


-- -------------------------------------------------------
-- 4. Reload PostgREST schema cache
-- -------------------------------------------------------
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- Migration complete.
-- New objects: 5 CHECK constraints, audit_log table, 1 trigger.
-- ============================================================
`.trim()

function main() {
  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')

  if (isDryRun) {
    console.log('-- DRY RUN: SQL would be applied via Supabase SQL Editor\n')
  }

  console.log('-- Copy the SQL below and run it in the Supabase SQL Editor:')
  console.log('-- https://supabase.com/dashboard/project/rcrzdpzwcbekgqgiwqcp/sql/new')
  console.log('')
  console.log(SQL)
}

main()
