-- The unique menu_item_id index introduced by catalog_reliability covers the
-- same lookup path, so retaining the original non-unique index only adds write
-- and storage overhead.
DROP INDEX IF EXISTS public.idx_nutritional_data_menu_item_id;
