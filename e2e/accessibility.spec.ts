import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

const ROUTES_TO_AUDIT = [
  '/',
  '/search?q=chicken',
  '/browse',
  '/insulin',
  '/meal',
  '/packing',
  '/guide',
  '/more',
  '/privacy',
  '/contact',
  '/item/sample-item',
] as const

test.describe('serious accessibility checks', () => {
  for (const routePath of ROUTES_TO_AUDIT) {
    test(`${routePath} has no serious or critical axe violations`, async ({ page }) => {
      await mockCatalog(page)
      await page.goto(routePath, { waitUntil: 'networkidle' })

      const results = await new AxeBuilder({ page }).analyze()
      const blockingViolations = results.violations.filter(violation =>
        violation.impact === 'serious' || violation.impact === 'critical',
      )

      expect(blockingViolations, formatViolations(blockingViolations)).toEqual([])
    })
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
          'content-range': table === 'restaurants' ? '0-0/1' : '0-0/2',
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
      if (select === 'id, park_id') {
        await fulfillJson(route, restaurants.map(({ id, park_id }) => ({ id, park_id })))
        return
      }
      if (select === 'id') {
        await fulfillJson(route, restaurants.map(({ id }) => ({ id })))
        return
      }
      await fulfillJson(route, restaurants)
      return
    }

    if (table === 'menu_items') {
      if (select === 'restaurant_id') {
        await fulfillJson(route, menuItems.map(item => ({ restaurant_id: item.restaurant_id })))
        return
      }
      await fulfillJson(route, menuItems)
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

function formatViolations(violations: Array<{ id: string; impact: string | null; help: string; nodes: Array<{ target: string[] }> }>) {
  if (violations.length === 0) return 'No serious or critical axe violations'

  return violations
    .map(violation => {
      const targets = violation.nodes
        .flatMap(node => node.target)
        .slice(0, 4)
        .join(', ')
      return `${violation.impact ?? 'unknown'} ${violation.id}: ${violation.help} (${targets})`
    })
    .join('\n')
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
    park: parks[0],
  },
]

const menuItems = [
  {
    id: 'sample-item',
    restaurant_id: 'aloha-isle',
    name: 'Grilled Chicken Bowl',
    description: 'Chicken, rice, vegetables, and pineapple salsa.',
    price: '$14.99',
    category: 'entree',
    is_seasonal: false,
    is_fried: false,
    is_vegetarian: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    restaurant: restaurants[0],
    nutritional_data: [
      {
        id: 'nutrition-sample',
        menu_item_id: 'sample-item',
        calories: 520,
        carbs: 54,
        fat: 18,
        sugar: 10,
        protein: 31,
        fiber: 6,
        sodium: 720,
        cholesterol: 80,
        source: 'official',
        confidence_score: 85,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
    ],
    allergens: [],
  },
]
