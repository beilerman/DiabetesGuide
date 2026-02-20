/**
 * Fix the last few items with special characters
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const envVars: Record<string, string> = {}
envContent.split('\n').forEach(line => {
  const trimmed = line.trim()
  if (trimmed && !trimmed.startsWith('#')) {
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) envVars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
  }
})

const url = envVars['SUPABASE_URL'] || process.env.SUPABASE_URL!
const key = envVars['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, key)

async function main() {
  // Update items containing "trl" that have no description
  const { data: items } = await supabase
    .from('menu_items')
    .select('id, name, description')
    .ilike('name', '%trl%')
    .is('description', null)

  console.log(`Found ${items?.length || 0} items containing "trl" without descriptions:`)

  for (const item of items || []) {
    console.log(`  - ${item.name}`)

    // Update with description
    const { error } = await supabase
      .from('menu_items')
      .update({ description: 'Nutrl vodka seltzer.' })
      .eq('id', item.id)

    if (error) {
      console.error(`    Error: ${error.message}`)
    } else {
      console.log(`    Updated!`)
    }
  }

  // Check for any remaining items without descriptions
  const { count } = await supabase
    .from('menu_items')
    .select('*', { count: 'exact', head: true })
    .is('description', null)

  console.log(`\nRemaining items without descriptions: ${count}`)
}

main().catch(console.error)
