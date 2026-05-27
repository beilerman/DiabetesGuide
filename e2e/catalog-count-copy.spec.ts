import { expect, test, type Page, type Route } from '@playwright/test'

test('home and browse clarify catalog item, restaurant, and destination counts', async ({ page }) => {
  await mockCatalogApi(page)

  await page.goto('/')

  await expect(page.getByText(/Catalog preview: 15 menu items.*2 restaurants.*2 destinations/)).toBeVisible()
  await expect(page.getByText('15 menu items across 2 destinations')).toBeVisible()

  await page.goto('/browse')

  await expect(page.locator('p').filter({ hasText: 'All Parks shows a 3,000-item preview for speed; pick a destination for the full catalog.' })).toBeVisible()
  await expect(page.getByText('Full catalog: 15 menu items. Choose a destination for complete listings.')).toBeVisible()

  const previewTooltipTrigger = page.getByRole('button', { name: 'loaded preview items' })
  await expect(previewTooltipTrigger).toBeVisible()
  await previewTooltipTrigger.focus()
  await expect(page.getByRole('tooltip')).toContainText('All Parks shows a 3,000-item preview for speed')
})

async function mockCatalogApi(page: Page) {
  await page.route('https://example.supabase.co/rest/v1/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const table = url.pathname.split('/').filter(Boolean).at(-1)
    const select = url.searchParams.get('select') ?? ''

    if (request.method() === 'HEAD') {
      if (table === 'restaurants') {
        await fulfillHeadCount(route, 2)
        return
      }

      if (table === 'menu_items') {
        await fulfillHeadCount(route, 15)
        return
      }
    }

    if (table === 'parks') {
      await fulfillJson(route, parks)
      return
    }

    if (table === 'restaurants') {
      await fulfillJson(route, restaurants)
      return
    }

    if (table === 'menu_items' && select === 'restaurant_id') {
      await fulfillJson(route, menuItemCountRows)
      return
    }

    if (table === 'menu_items') {
      await fulfillJson(route, menuItems)
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

async function fulfillHeadCount(route: Route, count: number) {
  await route.fulfill({
    status: 200,
    headers: {
      'content-range': `0-0/${count}`,
      'access-control-expose-headers': 'content-range',
    },
  })
}

const parks = [
  {
    id: 'magic-kingdom',
    name: 'Magic Kingdom Park',
    location: 'Orlando, Florida',
    timezone: 'America/New_York',
    first_aid_locations: [],
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'epcot',
    name: 'EPCOT',
    location: 'Orlando, Florida',
    timezone: 'America/New_York',
    first_aid_locations: [],
    created_at: '2026-01-01T00:00:00.000Z',
  },
]

const restaurants = [
  {
    id: 'aloha-isle',
    park_id: 'magic-kingdom',
    name: 'Aloha Isle',
    land: 'Adventureland',
    cuisine_type: null,
    hours: null,
    lat: null,
    lon: null,
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'sunshine-seasons',
    park_id: 'epcot',
    name: 'Sunshine Seasons',
    land: 'World Nature',
    cuisine_type: null,
    hours: null,
    lat: null,
    lon: null,
    created_at: '2026-01-01T00:00:00.000Z',
  },
]

const menuItemCountRows = [
  ...Array.from({ length: 10 }, () => ({ restaurant_id: 'aloha-isle' })),
  ...Array.from({ length: 5 }, () => ({ restaurant_id: 'sunshine-seasons' })),
]

const menuItems = [
  makeMenuItem('dole-whip', 'DOLE Whip Cup', restaurants[0], parks[0]),
  makeMenuItem('power-salad', 'Power Salad', restaurants[1], parks[1]),
]

function makeMenuItem(
  id: string,
  name: string,
  restaurant: (typeof restaurants)[number],
  park: (typeof parks)[number],
) {
  return {
    id,
    restaurant_id: restaurant.id,
    name,
    description: null,
    price: null,
    category: 'snack',
    is_seasonal: false,
    is_fried: false,
    is_vegetarian: false,
    photo_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    restaurant: {
      ...restaurant,
      park,
    },
    nutritional_data: [{
      id: `${id}-nutrition`,
      menu_item_id: id,
      calories: 120,
      carbs: 22,
      fat: 3,
      sugar: 18,
      protein: 1,
      fiber: 0,
      sodium: 20,
      cholesterol: 0,
      alcohol_grams: null,
      source: 'official',
      source_detail: null,
      confidence_score: 85,
      created_at: '2026-01-01T00:00:00.000Z',
    }],
    allergens: [],
  }
}
