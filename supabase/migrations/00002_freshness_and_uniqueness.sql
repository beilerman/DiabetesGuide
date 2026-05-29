-- DiabetesGuide: freshness metadata and duplicate prevention.
-- Safe for existing projects after duplicate restaurant/menu/nutrition rows are cleaned up.

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE nutritional_data
  ADD COLUMN IF NOT EXISTS alcohol_grams DECIMAL(6, 2),
  ADD COLUMN IF NOT EXISTS source_detail TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurants_park_name_unique
  ON restaurants(park_id, lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_items_restaurant_name_unique
  ON menu_items(restaurant_id, lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS idx_nutritional_data_menu_item_unique
  ON nutritional_data(menu_item_id);

NOTIFY pgrst, 'reload schema';
