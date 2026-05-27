import { expect, test, type Page, type Route } from '@playwright/test'

test('trip plan creates dated trips with selected parks and JSON backup', async ({ page }) => {
  await mockParks(page)

  await page.goto('/plan')
  await page.getByRole('button', { name: /trip plan/i }).click()

  await page.getByLabel(/trip name/i).fill('June Disney Trip')
  await page.getByLabel(/start date/i).fill('2026-06-01')
  await page.getByLabel(/end date/i).fill('2026-06-03')
  await page.getByLabel(/magic kingdom/i).check()
  await page.getByRole('button', { name: /^create trip$/i }).click()

  await expect(page.getByRole('heading', { name: /june disney trip/i })).toBeVisible()
  await expect(page.getByText(/3 days/i)).toBeVisible()

  await expect.poll(() => page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('dg.trips.v1') ?? '{}')
    return stored.trips?.[0]?.selectedParkIds?.join(',')
  })).toBe('magic-kingdom')

  await page.getByRole('button', { name: /export json/i }).click()
  const backup = await page.getByLabel(/trip plan backup json/i).inputValue()
  expect(backup).toContain('June Disney Trip')

  await page.getByRole('button', { name: /clear plan/i }).click()
  await page.getByRole('button', { name: /^clear trip plan$/i }).click()
  await expect(page.getByRole('heading', { name: /create trip/i })).toBeVisible()

  await page.getByLabel(/trip backup json/i).fill(backup)
  await page.getByRole('button', { name: /import json/i }).click()
  await expect(page.getByRole('heading', { name: /june disney trip/i })).toBeVisible()
})

async function mockParks(page: Page) {
  await page.route('https://example.supabase.co/rest/v1/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const table = url.pathname.split('/').filter(Boolean).at(-1)

    if (table === 'parks') {
      await fulfillJson(route, parks)
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', json: [] })
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
    id: 'epcot',
    name: 'EPCOT',
    location: 'Orlando, Florida',
    timezone: 'America/New_York',
    first_aid_locations: [],
    created_at: '2026-01-01T00:00:00.000Z',
  },
]
