import { expect, test, type Page } from '@playwright/test'

test('home uses the preloaded static catalog preview before live catalog requests settle', async ({ page }) => {
  await delayCatalogApi(page)

  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await expect(page.locator('link[rel="preload"][href="/data/catalog-preview.json"][as="fetch"]')).toHaveCount(1)
  await expect(page.getByText(/Catalog preview: .*menu items.*restaurants.*destinations/)).toBeVisible()
  await expect(page.getByRole('heading', { name: /walt disney world/i })).toBeVisible()
  await expect(page.getByText(/counts syncing/i)).toHaveCount(0)
})

test('resort section cards render cached counts without waiting for per-venue queries', async ({ page }) => {
  await delayCatalogApi(page)

  await page.goto('/resort/wdw/theme-parks', { waitUntil: 'domcontentloaded' })

  const venueCards = page.locator('a[href^="/resort/wdw/theme-parks/"]')
  await expect(venueCards.first()).toBeVisible()
  await expect(venueCards.filter({ hasText: /0 restaurants/i })).toHaveCount(0)
  await expect(venueCards.filter({ hasText: /0 items/i })).toHaveCount(0)
  await expect(page.getByLabel(/loading counts/i)).toHaveCount(0)
})

async function delayCatalogApi(page: Page) {
  await page.route('https://example.supabase.co/rest/v1/**', async route => {
    await new Promise(resolve => setTimeout(resolve, 5_000))
    await route.fulfill({ status: 503, body: 'delayed catalog unavailable' })
  })
}
