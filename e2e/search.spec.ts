import { expect, test, type Page, type Route } from '@playwright/test'

test('search pending label clears after results resolve and filters stay inline', async ({ page }) => {
  await mockSearchCatalogApi(page, { delayMenuItemsMs: 500 })

  await page.goto('/search?q=chicken&grade=B')

  await expect(page.getByRole('status')).toContainText('Searching')
  const count = page.getByText(/showing 1 of 1 matching result/i)
  await expect(count).toBeVisible()
  await expect(count).toHaveAttribute('aria-live', 'polite')
  await expect(page.getByText(/searching/i)).toHaveCount(0)
  await expect(page.getByRole('region', { name: /search filters/i })).toBeVisible()
  await expect(page.locator('button.fixed, button[class*="fixed"]').filter({ hasText: /filter/i })).toHaveCount(0)

  const gradeB = page.getByRole('button', { name: /B - Good choice/i })
  await expect(gradeB).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('link', { name: /what do grades mean/i })).toHaveAttribute('href', '/data-sources#grade-rubric')

  await gradeB.click()
  await expect(gradeB).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(() => new URL(page.url()).searchParams.get('grade')).toBeNull()
})

async function mockSearchCatalogApi(page: Page, options?: { delayMenuItemsMs?: number }) {
  await page.route('https://example.supabase.co/rest/v1/**', async route => {
    const url = new URL(route.request().url())
    const table = url.pathname.split('/').at(-1)

    if (table === 'parks') {
      await fulfillJson(route, [park])
      return
    }

    if (table === 'menu_items') {
      if (options?.delayMenuItemsMs) {
        await new Promise(resolve => setTimeout(resolve, options.delayMenuItemsMs))
      }
      await fulfillJson(route, [menuItem])
      return
    }

    await route.fulfill({ status: 404, body: 'Not mocked' })
  })
}

async function fulfillJson(route: Route, json: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    json,
  })
}

const park = {
  id: 'park-1',
  name: 'Test Park',
  location: 'Orlando, Florida',
  timezone: 'America/New_York',
  first_aid_locations: [],
  created_at: '2026-01-01T00:00:00.000Z',
}

const restaurant = {
  id: 'restaurant-1',
  park_id: park.id,
  name: 'Test Restaurant',
  land: 'Test Land',
  cuisine_type: null,
  hours: null,
  lat: null,
  lon: null,
  created_at: '2026-01-01T00:00:00.000Z',
  park,
}

const menuItem = {
  id: 'item-1',
  restaurant_id: restaurant.id,
  name: 'Grilled Chicken Sandwich',
  description: null,
  price: null,
  category: 'entree',
  is_seasonal: false,
  is_fried: false,
  is_vegetarian: false,
  photo_url: null,
  created_at: '2026-01-01T00:00:00.000Z',
  restaurant,
  nutritional_data: [{
    id: 'nutrition-1',
    menu_item_id: 'item-1',
    calories: 420,
    carbs: 38,
    fat: 12,
    sugar: 4,
    protein: 28,
    fiber: 2,
    sodium: 740,
    cholesterol: 65,
    alcohol_grams: null,
    source: 'official',
    source_detail: null,
    confidence_score: 85,
    created_at: '2026-01-01T00:00:00.000Z',
  }],
  allergens: [],
}
