import { expect, test } from '@playwright/test'

test('trust pages and More menu expose Task 16 content and accessibility hooks', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page.getByText(/Checklist progress is stored locally/i)).toBeVisible()

  await page.goto('/contact')
  await expect(page.getByRole('link', { name: 'contact@diabetesguide.app' })).toHaveAttribute(
    'href',
    'mailto:contact@diabetesguide.app',
  )

  await page.goto('/more')
  const menuLinks = page.getByRole('link').filter({ has: page.locator('h3') })
  await expect(menuLinks).toHaveCount(7)
  await expect(page.locator('a[href="/packing"] svg[aria-hidden="true"]').first()).toBeVisible()
  await expect(page.getByRole('link', { name: /packing list/i })).toBeVisible()
})

test('guide type selector uses tabs and matching tab panels', async ({ page }) => {
  await page.goto('/guide')

  const tablist = page.getByRole('tablist', { name: /diabetes type/i })
  await expect(tablist.getByRole('tab', { name: 'Type 1' })).toHaveAttribute('aria-selected', 'true')
  await tablist.getByRole('tab', { name: 'Type 2' }).click()

  await expect(tablist.getByRole('tab', { name: 'Type 2' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel', { name: 'Type 2' })).toHaveAttribute('id', 'guide-panel-type2')
})
