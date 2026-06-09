-- ============================================================
-- DiabetesGuide: nutritional_data provenance + alcohol fields
--
-- The app surfaces free-text nutrition provenance (`source_detail`) and uses
-- alcohol grams in grading/filtering. Keep fresh Supabase projects aligned with
-- the TypeScript model and production data shape.
-- ============================================================

ALTER TABLE nutritional_data
  ADD COLUMN IF NOT EXISTS source_detail TEXT;

ALTER TABLE nutritional_data
  ADD COLUMN IF NOT EXISTS alcohol_grams NUMERIC;

DO $$ BEGIN
  ALTER TABLE nutritional_data
    ADD CONSTRAINT chk_alcohol_grams_non_negative
    CHECK (alcohol_grams IS NULL OR alcohol_grams >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
