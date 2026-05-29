-- DiabetesGuide: enforce park-name uniqueness with apostrophe-insensitive matching.
-- Prior to this migration the weekly menu sync re-introduced duplicate parks
-- ("Universal Epic Universe" vs "Universal's Epic Universe") on every run.
-- The application code in scripts/approve.ts now normalizes apostrophes when
-- looking up parks, but a database-level constraint protects against any
-- future code path that bypasses that helper.

CREATE UNIQUE INDEX IF NOT EXISTS idx_parks_normalized_name_unique
  ON parks(lower(regexp_replace(name, '[^a-zA-Z0-9 ]', '', 'g')));

NOTIFY pgrst, 'reload schema';
