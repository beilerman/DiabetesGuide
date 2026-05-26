import { expect, test, type Page, type Route } from '@playwright/test'

test('home hero badge and quick-filter chips are mobile responsive', async ({ page }) => {
  await mockCatalog(page)
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')

  const titleBox = await page.getByRole('heading', { name: /diabetesguide/i }).boundingBox()
  const badgeBox = await page.getByText(/catalog preview:/i).boundingBox()
  expect(titleBox).not.toBeNull()
  expect(badgeBox).not.toBeNull()
  expect(badgeBox!.y).toBeGreaterThan(titleBox!.y)

  const chipRail = page.getByTestId('home-filter-chip-rail')
  await expect(chipRail).toBeVisible()
  await expect(page.getByTestId('home-filter-chip-chevron')).toBeVisible()

  for (const chip of await chipRail.getByRole('link').all()) {
    const box = await chip.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }
})

async function mockCatalog(page: Page) {
  await page.route('https://example.supabase.co/rest/v1/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const table = url.pathname.split('/').filter(Boolean).at(-1)
    const select = url.searchParams.get('select') ?? ''

    if (request.method() === 'HEAD') {
      await route.fulfill({
        status: 200,
        headers: {
          'content-range': table === 'restaurants' ? '0-0/2' : '0-0/15',
          'access-control-expose-headers': 'content-range',
        },
      })
      return
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
      await fulfillJson(route, [
        ...Array.from({ length: 10 }, () => ({ restaurant_id: 'aloha-isle' })),
        ...Array.from({ length: 5 }, () => ({ restaurant_id: 'grand-cafe' })),
      ])
      return
    }

    await fulfillJson(route, [])
  })
}

async function fulfillJson(route: Route, json: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    json,
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
    id: 'grand-floridian',
    name: "Disney's Grand Floridian Resort",
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
    id: 'grand-cafe',
    park_id: 'grand-floridian',
    name: 'Grand Cafe',
    land: null,
    cuisine_type: null,
    hours: null,
    lat: null,
    lon: null,
    created_at: '2026-01-01T00:00:00.000Z',
  },
]
