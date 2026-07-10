import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readMigrations(): string {
  const migrationsDir = resolve(process.cwd(), 'supabase/migrations')
  return readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort()
    .map(file => readFileSync(resolve(migrationsDir, file), 'utf8'))
    .join('\n')
}

describe('static deployment assets', () => {
  it('preloads the static catalog preview JSON from the shell document', () => {
    const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

    expect(indexHtml).toContain('rel="preload"')
    expect(indexHtml).toContain('href="/data/catalog-preview.json"')
    expect(indexHtml).toContain('as="fetch"')
  })

  it('sets one-hour cache headers for catalog preview data on Vercel', () => {
    const vercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
      headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>
    }

    const catalogHeader = vercelConfig.headers?.find(entry => entry.source === '/data/catalog-preview.json')

    expect(catalogHeader?.headers).toEqual(expect.arrayContaining([
      { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' },
    ]))
  })

  it('keeps Supabase migrations aligned with nutritional fields used by the app', () => {
    const migrations = readMigrations()

    expect(migrations).toMatch(/\bsource_detail\b/i)
    expect(migrations).toMatch(/\balcohol_grams\b/i)
  })

  it('reproduces catalog integrity and aggregate access in Supabase migrations', () => {
    const migrations = readMigrations()

    expect(migrations).toMatch(/uq_nutritional_data_menu_item_id/i)
    expect(migrations).toMatch(/chk_nutrition_confidence_range/i)
    expect(migrations).toMatch(/chk_nutrition_macros_non_negative/i)
    expect(migrations).toMatch(/chk_nutrition_fiber_lte_carbs/i)
    expect(migrations).toMatch(/chk_nutrition_sugar_lte_carbs/i)
    expect(migrations).toMatch(/get_park_menu_item_counts/i)
    expect(migrations).toMatch(/security\s+invoker/i)
    expect(migrations).toMatch(/revoke\s+execute[\s\S]*get_park_menu_item_counts[\s\S]*from\s+public/i)
    expect(migrations).toMatch(/grant\s+execute[\s\S]*get_park_menu_item_counts[\s\S]*to\s+anon\s*,\s*authenticated/i)
    expect(migrations).toMatch(/grant\s+select\s+on\s+table[\s\S]*public\.parks[\s\S]*public\.allergens[\s\S]*to\s+anon\s*,\s*authenticated/i)
  })

  it('derives PWA Supabase runtime caching from the configured environment URL', () => {
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')

    expect(viteConfig).toContain('process.env.VITE_SUPABASE_URL')
    expect(viteConfig).not.toContain('rcrzdpzwcbekgqgiwqcp')
  })
})
