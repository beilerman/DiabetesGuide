/**
 * Keepalive ping for Supabase free-tier project.
 * Runs a trivial SELECT to prevent auto-pause (7 days inactivity).
 *
 * Usage: npx tsx scripts/keepalive.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local (for local runs)
function loadEnv(): Record<string, string> {
  try {
    const envPath = resolve(__dirname, '..', '.env.local')
    const content = readFileSync(envPath, 'utf-8')
    const vars: Record<string, string> = {}
    content.split('\n').forEach(line => {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx > 0) vars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
      }
    })
    return vars
  } catch {
    return {}
  }
}

const envVars = loadEnv()
const url = envVars['SUPABASE_URL'] || envVars['VITE_SUPABASE_URL'] || process.env.SUPABASE_URL
const key = envVars['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY ||
            envVars['VITE_SUPABASE_ANON_KEY'] || process.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL or key in env')
  process.exit(1)
}

const supabase = createClient(url, key)

async function keepalive() {
  const start = Date.now()
  const { data, error } = await supabase.from('parks').select('name').limit(1)

  if (error) {
    console.error(`Keepalive FAILED (${Date.now() - start}ms):`, error.message)
    process.exit(1)
  }

  console.log(`Keepalive OK (${Date.now() - start}ms) — ${data?.[0]?.name ?? 'no data'}`)
}

keepalive().catch(err => {
  console.error('Keepalive error:', err)
  process.exit(1)
})
