-- Production predates the committed migrations and already has this uniqueness
-- rule under a legacy index name. Keep the new index on fresh databases, but do
-- not retain two identical unique indexes when upgrading that legacy schema.
DO $$
BEGIN
  IF to_regclass('public.idx_nutritional_data_menu_item_unique') IS NOT NULL
     AND to_regclass('public.uq_nutritional_data_menu_item_id') IS NOT NULL THEN
    DROP INDEX public.uq_nutritional_data_menu_item_id;
  END IF;
END $$;
