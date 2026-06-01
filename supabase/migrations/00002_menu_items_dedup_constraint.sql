-- ============================================================
-- DiabetesGuide: menu_items de-duplication + uniqueness net
-- Run this in the Supabase SQL Editor (or via the Supabase CLI).
-- Idempotent: safe to re-run.
--
-- Why: the import path (approve.ts) dedupes in application code, but without a
-- DB constraint a retried/concurrent run (cron + manual workflow_dispatch) could
-- race past the read-then-write check and double-insert. This adds the missing
-- safety net so the database itself rejects duplicate (restaurant, name) rows.
-- ============================================================

-- 1. Remove existing exact (case-insensitive) duplicate menu items within a
--    restaurant, keeping one deterministic row per group. FK is ON DELETE
--    CASCADE, so the duplicates' nutritional_data and allergens go with them.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY restaurant_id, lower(btrim(name))
           ORDER BY id
         ) AS rn
  FROM menu_items
)
DELETE FROM menu_items m
USING ranked r
WHERE m.id = r.id
  AND r.rn > 1;

-- 2. Enforce uniqueness going forward. Matches approve.ts's case-insensitive,
--    whitespace-trimmed dedup key. CONCURRENTLY is not used so this can run in
--    a single SQL Editor transaction.
CREATE UNIQUE INDEX IF NOT EXISTS uq_menu_items_restaurant_lower_name
  ON menu_items (restaurant_id, lower(btrim(name)));

-- 3. Refresh PostgREST's schema cache so the new index is visible to the API.
NOTIFY pgrst, 'reload schema';
