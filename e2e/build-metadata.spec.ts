import { expect, test } from '@playwright/test'

test('about and footer expose build and catalog freshness metadata', async ({ page }) => {
  await page.goto('/about')

  await expect(page.getByRole('heading', { name: /version & data freshness/i })).toBeVisible()
  await expect(page.getByText(/git sha/i)).toBeVisible()
  await expect(page.getByText(/build date/i)).toBeVisible()
  await expect(page.getByText(/catalog snapshot/i)).toBeVisible()
  await expect(page.getByText(/catalog updated:/i)).toBeVisible()
  await expect(page.getByRole('contentinfo').getByRole('link', { name: /^changelog$/i })).toHaveAttribute('href', '/changelog')
})

test('changelog route renders the markdown-backed release notes', async ({ page }) => {
  await page.goto('/changelog')

  await expect(page.getByRole('heading', { name: /^changelog$/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: /unreleased/i })).toBeVisible()
  await expect(page.getByText(/prevented resort section venue cards/i)).toBeVisible()
})
