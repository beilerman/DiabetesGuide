import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const sb = createClient(url, key)

async function main() {
  // Use the Supabase SQL editor via REST - we need to use the Management API
  // or run raw SQL. Since supabase-js doesn't support raw DDL, we'll use
  // the PostgREST rpc endpoint if available, or fall back to fetch.

  const sql = `
    create table if not exists nutrition_sources (
      id uuid primary key default gen_random_uuid(),
      menu_item_id uuid not null references menu_items(id) on delete cascade,
      source_name text not null,
      source_url text not null,
      confidence integer not null default 0 check (confidence between 0 and 100),
      notes text,
      created_at timestamptz default now()
    );

    create index if not exists nutrition_sources_menu_item_id_idx
      on nutrition_sources(menu_item_id);

    -- Enable RLS with public read
    alter table nutrition_sources enable row level security;

    create policy if not exists "Allow public read access"
      on nutrition_sources for select using (true);

    -- Notify PostgREST to reload schema
    notify pgrst, 'reload schema';
  `

  // Use the Supabase SQL endpoint directly
  const res = await fetch(`${url}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })

  if (!res.ok) {
    // RPC endpoint doesn't exist - use the pg-meta or SQL API
    console.log('Direct RPC not available. Trying pg-meta SQL endpoint...')

    const sqlRes = await fetch(`${url}/pg/query`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    })

    if (!sqlRes.ok) {
      console.log('pg-meta endpoint also not available.')
      console.log('Please run this SQL in the Supabase SQL Editor:')
      console.log('')
      console.log(sql)
      return
    }

    const result = await sqlRes.json()
    console.log('Table created via pg-meta:', result)
  } else {
    console.log('Table created successfully via RPC')
  }

  // Verify the table exists by trying to query it
  const { data, error } = await sb.from('nutrition_sources').select('id').limit(1)
  if (error) {
    console.log('Verification failed:', error.message)
    console.log('')
    console.log('The REST endpoints may not support DDL. Please run this SQL in the Supabase SQL Editor (https://supabase.com/dashboard):')
    console.log('')
    console.log(sql)
  } else {
    console.log('Table verified - nutrition_sources is accessible via API')
  }
}

main().catch(console.error)
