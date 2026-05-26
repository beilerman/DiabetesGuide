import { expect, test, type Page, type Route } from '@playwright/test'

const parks = [
  makePark('mk', 'Magic Kingdom Park'),
  makePark('epcot', 'EPCOT'),
]

const restaurantsByPark = new Map([
  ['mk', [
    makeRestaurant('mk-r1', 'mk', "Casey's Corner", 'Main Street, U.S.A.'),
    makeRestaurant('mk-r2', 'mk', "Cosmic Ray's Starlight Cafe", 'Tomorrowland'),
  ]],
  ['epcot', [
    makeRestaurant('ep-r1', 'epcot', 'Connections Eatery', 'World Celebration'),
  ]],
])

const itemCountsByPark = new Map([
  ['mk', 84],
  ['epcot', 42],
])

test('resort section cards show resolved counts, not zero placeholders', async ({ page }) => {
  await mockCatalogApi(page)

  await page.goto('/resort/wdw/theme-parks')
  await page.waitForLoadState('networkidle')

  const venueCards = page.locator('a[href^="/resort/wdw/theme-parks/"]')
  await expect(venueCards).toHaveCount(2)
  await expect(venueCards.filter({ hasText: /0 restaurants/i })).toHaveCount(0)
  await expect(venueCards.filter({ hasText: /0 items/i })).toHaveCount(0)
  await expect(venueCards.first()).toContainText('2 restaurants')
  await expect(venueCards.first()).toContainText('84 items')
})

async function mockCatalogApi(page: Page) {
  await page.route('https://example.supabase.co/rest/v1/**', async route => {
    const url = new URL(route.request().url())
    const table = url.pathname.split('/').at(-1)

    if (table === 'parks') {
      await fulfillJson(route, parks)
      return
    }

    if (table === 'restaurants') {
      const parkId = parseEqFilter(url.searchParams.get('park_id'))
      const restaurants = parkId ? restaurantsByPark.get(parkId) ?? [] : []
      const select = url.searchParams.get('select')
      if (select === 'id') {
        await fulfillJson(route, restaurants.map(restaurant => ({ id: restaurant.id })))
        return
      }
      await fulfillJson(route, restaurants)
      return
    }

    if (table === 'menu_items') {
      const restaurantIds = parseInFilter(url.searchParams.get('restaurant_id'))
      const parkId = findParkForRestaurants(restaurantIds)
      const count = parkId ? itemCountsByPark.get(parkId) ?? 0 : 0
      await fulfillCount(route, count)
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

async function fulfillCount(route: Route, count: number) {
  await route.fulfill({
    status: 200,
    headers: {
      'access-control-expose-headers': 'Content-Range',
      'content-range': count > 0 ? `0-0/${count}` : '*/0',
    },
    body: '',
  })
}

function parseEqFilter(value: string | null): string | undefined {
  if (!value?.startsWith('eq.')) return undefined
  return value.slice(3)
}

function parseInFilter(value: string | null): string[] {
  if (!value?.startsWith('in.(') || !value.endsWith(')')) return []
  return value.slice(4, -1).split(',').filter(Boolean)
}

function findParkForRestaurants(restaurantIds: string[]): string | undefined {
  const wanted = new Set(restaurantIds)
  for (const [parkId, restaurants] of restaurantsByPark) {
    if (restaurants.some(restaurant => wanted.has(restaurant.id))) return parkId
  }
  return undefined
}

function makePark(id: string, name: string) {
  return {
    id,
    name,
    location: 'Orlando, Florida',
    timezone: 'America/New_York',
    first_aid_locations: [],
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

function makeRestaurant(id: string, parkId: string, name: string, land: string) {
  return {
    id,
    park_id: parkId,
    name,
    land,
    cuisine_type: null,
    hours: null,
    lat: null,
    lon: null,
    created_at: '2026-01-01T00:00:00.000Z',
  }
}
