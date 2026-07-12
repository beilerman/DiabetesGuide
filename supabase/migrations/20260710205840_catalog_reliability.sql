-- Keep the database aligned with the application's one-to-one nutrition model.
-- Production is preflighted before this migration is applied; duplicates are
-- treated as a blocker rather than deleted by the migration.
CREATE UNIQUE INDEX IF NOT EXISTS uq_nutritional_data_menu_item_id
  ON public.nutritional_data (menu_item_id);

-- Install named, reproducible data-quality checks. NOT VALID keeps the initial
-- lock short; the explicit VALIDATE statements below prove all existing rows
-- satisfy the same rules enforced for future writes.
DO $$ BEGIN
  ALTER TABLE public.nutritional_data
    ADD CONSTRAINT chk_nutrition_confidence_range
    CHECK (
      confidence_score IS NULL
      OR confidence_score BETWEEN 0 AND 100
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.nutritional_data
    ADD CONSTRAINT chk_nutrition_calories_range
    CHECK (calories IS NULL OR calories BETWEEN 0 AND 5000) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.nutritional_data
    ADD CONSTRAINT chk_nutrition_macros_non_negative
    CHECK (
      (carbs IS NULL OR carbs >= 0)
      AND (fat IS NULL OR fat >= 0)
      AND (sugar IS NULL OR sugar >= 0)
      AND (protein IS NULL OR protein >= 0)
      AND (fiber IS NULL OR fiber >= 0)
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.nutritional_data
    ADD CONSTRAINT chk_nutrition_fiber_lte_carbs
    CHECK (fiber IS NULL OR carbs IS NULL OR fiber <= carbs) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.nutritional_data
    ADD CONSTRAINT chk_nutrition_sugar_lte_carbs
    CHECK (sugar IS NULL OR carbs IS NULL OR sugar <= carbs) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.nutritional_data
    ADD CONSTRAINT chk_nutrition_sodium_range
    CHECK (sodium IS NULL OR sodium BETWEEN 0 AND 20000) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.nutritional_data
    ADD CONSTRAINT chk_nutrition_cholesterol_non_negative
    CHECK (cholesterol IS NULL OR cholesterol >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.nutritional_data
  VALIDATE CONSTRAINT chk_nutrition_confidence_range;
ALTER TABLE public.nutritional_data
  VALIDATE CONSTRAINT chk_nutrition_calories_range;
ALTER TABLE public.nutritional_data
  VALIDATE CONSTRAINT chk_nutrition_macros_non_negative;
ALTER TABLE public.nutritional_data
  VALIDATE CONSTRAINT chk_nutrition_fiber_lte_carbs;
ALTER TABLE public.nutritional_data
  VALIDATE CONSTRAINT chk_nutrition_sugar_lte_carbs;
ALTER TABLE public.nutritional_data
  VALIDATE CONSTRAINT chk_nutrition_sodium_range;
ALTER TABLE public.nutritional_data
  VALIDATE CONSTRAINT chk_nutrition_cholesterol_non_negative;

-- Return one compact count row per park instead of transferring every menu
-- item's restaurant_id to the browser. SECURITY INVOKER preserves table RLS.
CREATE OR REPLACE FUNCTION public.get_park_menu_item_counts()
RETURNS TABLE (park_id UUID, item_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT restaurants.park_id, COUNT(menu_items.id)::BIGINT AS item_count
  FROM public.restaurants
  LEFT JOIN public.menu_items
    ON menu_items.restaurant_id = restaurants.id
  GROUP BY restaurants.park_id
$$;

-- Functions are executable by PUBLIC unless explicitly restricted.
REVOKE EXECUTE ON FUNCTION public.get_park_menu_item_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_park_menu_item_counts() TO anon, authenticated;

-- Supabase no longer exposes new Data API objects by default. Keep fresh
-- deployments explicit and reproducible while RLS remains the row-level gate.
GRANT SELECT ON TABLE
  public.parks,
  public.restaurants,
  public.menu_items,
  public.nutritional_data,
  public.allergens
TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
