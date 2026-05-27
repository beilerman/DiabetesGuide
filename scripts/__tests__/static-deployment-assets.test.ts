import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

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
})
