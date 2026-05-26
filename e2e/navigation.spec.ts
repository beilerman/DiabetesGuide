import { expect, test } from '@playwright/test'

test('desktop header uses shared navigation and hides the bottom bar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/meal')

  await expect(page.getByRole('navigation', { name: /top navigation/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /^meal builder$/i })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: /^favorites$/i })).toHaveAttribute('href', '/plan')
  await expect(page.getByRole('link', { name: /^menu$/i })).toHaveAttribute('href', '/more')
  await expect(page.getByRole('navigation', { name: /bottom navigation/i })).toBeHidden()
})

test('mobile bottom navigation uses renamed labels and active state', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/plan')

  const bottomNav = page.getByRole('navigation', { name: /bottom navigation/i })
  await expect(bottomNav).toBeVisible()
  await expect(bottomNav.getByRole('link', { name: /^home$/i })).toHaveAttribute('href', '/')
  await expect(bottomNav.getByRole('link', { name: /^meal builder$/i })).toHaveAttribute('href', '/meal')
  await expect(bottomNav.getByRole('link', { name: /^favorites$/i })).toHaveAttribute('aria-current', 'page')
  await expect(bottomNav.getByRole('link', { name: /^menu$/i })).toHaveAttribute('href', '/more')
  await expect(bottomNav.getByText(/^parks$/i)).toHaveCount(0)
  await expect(bottomNav.getByText(/^meal$/i)).toHaveCount(0)
  await expect(bottomNav.getByText(/^plan$/i)).toHaveCount(0)
  await expect(bottomNav.getByText(/^more$/i)).toHaveCount(0)
})
