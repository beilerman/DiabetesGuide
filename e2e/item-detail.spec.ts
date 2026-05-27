import { expect, test, type Page, type Route } from '@playwright/test'

test('item detail shows concise nutrition and grade context', async ({ page }) => {
  await mockItemDetailApi(page)

  await page.goto('/item/item-f')

  await expect(page.getByRole('heading', { name: 'Giant Funnel Cake Sundae' })).toBeVisible()
  await expect(page.getByText('Sodium:')).toHaveCount(0)
  await expect(page.getByText(/Updated Feb 15, 2026/i)).toBeVisible()
  await expect(page.getByText(/fewer is better - scale shows item vs\. category median \(0-5\)/i)).toBeVisible()

  await page.getByText('What does grade F mean?').click()
  await expect(page.getByRole('link', { name: /grade rubric/i })).toHaveAttribute('href', '/data-sources#grade-rubric')
})

async function mockItemDetailApi(page: Page) {
  await page.route('https://example.supabase.co/rest/v1/**', async route => {
    const url = new URL(route.request().url())
    const table = url.pathname.split('/').filter(Boolean).at(-1)

    if (table === 'menu_items') {
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
  created_at: '2026-02-15T00:00:00.000Z',
}

const restaurant = {
  id: 'restaurant-1',
  park_id: park.id,
  name: 'Test Bakery',
  land: 'Test Land',
  cuisine_type: null,
  hours: null,
  lat: null,
  lon: null,
  created_at: '2026-02-15T00:00:00.000Z',
}

const menuItem = {
  id: 'item-f',
  restaurant_id: restaurant.id,
  name: 'Giant Funnel Cake Sundae',
  description: 'A large dessert with ice cream and chocolate sauce.',
  price: null,
  category: 'dessert',
  is_seasonal: false,
  is_fried: false,
  is_vegetarian: true,
  photo_url: null,
  created_at: '2026-02-15T00:00:00.000Z',
  restaurant: {
    ...restaurant,
    park,
  },
  nutritional_data: [{
    id: 'nutrition-1',
    menu_item_id: 'item-f',
    calories: 1100,
    carbs: 140,
    fat: 48,
    sugar: 90,
    protein: 8,
    fiber: 2,
    sodium: 40,
    cholesterol: 80,
    alcohol_grams: null,
    source: 'official',
    source_detail: 'Test source',
    confidence_score: 85,
    created_at: '2026-02-15T00:00:00.000Z',
  }],
  allergens: [],
}
