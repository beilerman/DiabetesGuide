import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const SQL = `
-- Add updated_at column to menu_items
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Add updated_at column to nutritional_data
ALTER TABLE nutritional_data
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Add updated_at column to restaurants
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Create or replace trigger function to auto-update the timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers (drop first to avoid duplicates)
DROP TRIGGER IF EXISTS set_updated_at ON menu_items;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON nutritional_data;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON nutritional_data
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON restaurants;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON restaurants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Backfill existing rows with created_at as initial updated_at
UPDATE menu_items SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE nutritional_data SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE restaurants SET updated_at = created_at WHERE updated_at IS NULL;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
`

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  if (dryRun) {
    console.log('DRY RUN — SQL that would be executed:')
    console.log(SQL)
    return
  }

  console.log('Running migration: add updated_at columns + triggers...')
  const { error } = await supabase.rpc('exec_sql', { sql: SQL }).single()

  if (error) {
    // rpc('exec_sql') may not exist — fall back to running via REST
    console.log('rpc exec_sql not available, running statements individually...')

    const statements = SQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    for (const stmt of statements) {
      console.log(`  Running: ${stmt.substring(0, 80)}...`)
      const { error: stmtErr } = await supabase.from('_migrations').select('*').limit(0)
      // Since we can't run raw SQL via the REST API directly,
      // this migration needs to be run in the Supabase SQL Editor
      if (stmtErr) {
        console.log('  (ignoring non-critical error)')
      }
    }

    console.log('\n⚠️  Raw SQL execution via REST API is not supported.')
    console.log('Please run the following SQL in the Supabase SQL Editor:')
    console.log('─'.repeat(60))
    console.log(SQL)
    console.log('─'.repeat(60))
    return
  }

  console.log('Migration completed successfully!')
}

main().catch(console.error)
