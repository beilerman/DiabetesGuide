-- Enums
CREATE TYPE menu_category AS ENUM ('entree', 'snack', 'beverage', 'dessert', 'side');
CREATE TYPE nutrition_source AS ENUM ('official', 'crowdsourced', 'api_lookup');
CREATE TYPE allergen_severity AS ENUM ('contains', 'may_contain');

-- Parks
CREATE TABLE parks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  first_aid_locations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Restaurants
CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  park_id UUID NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  land TEXT,
  cuisine_type TEXT,
  hours JSONB,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Menu items
CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2),
  category menu_category NOT NULL DEFAULT 'entree',
  is_seasonal BOOLEAN DEFAULT FALSE,
  is_fried BOOLEAN DEFAULT FALSE,
  is_vegetarian BOOLEAN DEFAULT FALSE,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nutritional data
CREATE TABLE nutritional_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  calories INTEGER,
  carbs INTEGER,
  fat INTEGER,
  sugar INTEGER,
  protein INTEGER,
  fiber INTEGER,
  sodium INTEGER,
  cholesterol INTEGER,
  source nutrition_source NOT NULL DEFAULT 'official',
  confidence_score INTEGER DEFAULT 50 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allergens
CREATE TABLE allergens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  allergen_type TEXT NOT NULL,
  severity allergen_severity NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_restaurants_park_id ON restaurants(park_id);
CREATE INDEX idx_menu_items_restaurant_id ON menu_items(restaurant_id);
CREATE INDEX idx_menu_items_category ON menu_items(category);
CREATE INDEX idx_nutritional_data_menu_item_id ON nutritional_data(menu_item_id);
CREATE INDEX idx_allergens_menu_item_id ON allergens(menu_item_id);

-- RLS: read-only for anonymous
ALTER TABLE parks ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutritional_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE allergens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read parks" ON parks FOR SELECT USING (true);
CREATE POLICY "Public read restaurants" ON restaurants FOR SELECT USING (true);
CREATE POLICY "Public read menu_items" ON menu_items FOR SELECT USING (true);
CREATE POLICY "Public read nutritional_data" ON nutritional_data FOR SELECT USING (true);
CREATE POLICY "Public read allergens" ON allergens FOR SELECT USING (true);
