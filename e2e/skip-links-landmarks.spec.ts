import { expect, test } from '@playwright/test'

test('search page skip links move keyboard focus to search and results landmarks', async ({ page }) => {
  await page.goto('/search?q=chicken')

  await page.getByRole('link', { name: 'Skip to search' }).focus()
  await expect(page.getByRole('link', { name: 'Skip to search' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Search all menu items' })).toBeFocused()

  await page.getByRole('link', { name: 'Skip to results' }).focus()
  await expect(page.getByRole('link', { name: 'Skip to results' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#search-results')).toBeFocused()

  await expect(page.locator('main')).toHaveCount(1)
  await expect(page.locator('nav[aria-label="Top navigation"]')).toHaveCount(1)
  await expect(page.locator('nav[aria-label="Bottom navigation"]')).toHaveCount(1)
})
