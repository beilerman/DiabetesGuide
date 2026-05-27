import { expect, test } from '@playwright/test'

test('insulin and meal pages explain hidden dose output', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('dg_estimator_acknowledged_v1', 'true')
  })

  await page.goto('/insulin')
  await expect(page.getByText('Why is the dose hidden?')).toBeVisible()
  await expect(page.getByText(/Missing required input:/)).toContainText('Blood glucose')
  await expect(page.getByRole('link', { name: /safety methodology/i })).toHaveAttribute('href', '/data-sources#estimator-safety')

  await page.goto('/meal')
  await expect(page.getByText('Why is the dose hidden?')).toBeVisible()
  await expect(page.getByText(/Carbs <= 0/)).toBeVisible()
  await expect(page.getByRole('link', { name: /safety methodology/i })).toHaveAttribute('href', '/data-sources#estimator-safety')
})
