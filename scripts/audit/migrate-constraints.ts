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
-- 1. CHECK constraints on nutritional_data
-- -------------------------------------------------------

-- fiber <= carbs
DO $$ BEGIN
  ALTER TABLE nutritional_data
    ADD CONSTRAINT chk_fiber_lte_carbs
    CHECK (fiber IS NULL OR carbs IS NULL OR fiber <= carbs);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- sugar <= carbs
DO $$ BEGIN
  ALTER TABLE nutritional_data
    ADD CONSTRAINT chk_sugar_lte_carbs
    CHECK (sugar IS NULL OR carbs IS NULL OR sugar <= carbs);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- calories 0-5000
DO $$ BEGIN
  ALTER TABLE nutritional_data
    ADD CONSTRAINT chk_calories_range
    CHECK (calories IS NULL OR (calories >= 0 AND calories <= 5000));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- sodium 0-10000
DO $$ BEGIN
  ALTER TABLE nutritional_data
    ADD CONSTRAINT chk_sodium_range
    CHECK (sodium IS NULL OR (sodium >= 0 AND sodium <= 10000));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- all macros non-negative
DO $$ BEGIN
  ALTER TABLE nutritional_data
    ADD CONSTRAINT chk_macros_non_negative
    CHECK (
      (carbs   IS NULL OR carbs   >= 0) AND
      (fat     IS NULL OR fat     >= 0) AND
      (protein IS NULL OR protein >= 0) AND
      (sugar   IS NULL OR sugar   >= 0) AND
      (fiber   IS NULL OR fiber   >= 0)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


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
