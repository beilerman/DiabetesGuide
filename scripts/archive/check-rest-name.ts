import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const name = process.argv[2] || 'Gideon'
async function main() {
  const { data } = await sb.from('restaurants').select('id, name').eq('park_id', '54cddc44-ed3e-4475-bbfc-87369c7092c3').ilike('name', `%${name}%`)
  console.log(JSON.stringify(data, null, 2))
}
main().then(() => process.exit(0))
