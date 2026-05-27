import { expect, test } from '@playwright/test'

test('packing checklist persists per profile and exposes reset and print controls', async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {
      localStorage.setItem('dg.print.called', 'true')
    }
  })

  await page.goto('/packing')

  await expect(page.getByText(/saved on this device/i)).toBeVisible()
  await expect(page.getByRole('heading', { name: /essentials 0\/12/i })).toBeVisible()

  await page.getByLabel(/blood glucose meter/i).check()
  await expect(page.getByRole('heading', { name: /essentials 1\/12/i })).toBeVisible()

  await page.reload()
  await expect(page.getByLabel(/blood glucose meter/i)).toBeChecked()
  await expect(page.getByRole('heading', { name: /essentials 1\/12/i })).toBeVisible()

  await page.getByLabel(/^child$/i).check()
  await expect(page.getByRole('heading', { name: /essentials 0\/12/i })).toBeVisible()
  await page.getByLabel(/blood glucose meter/i).check()
  await expect(page.getByRole('heading', { name: /essentials 1\/12/i })).toBeVisible()

  await page.getByRole('button', { name: /print \/ export pdf/i }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('dg.print.called'))).toBe('true')

  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: /reset checklist/i }).click()
  await expect(page.getByRole('heading', { name: /essentials 0\/12/i })).toBeVisible()
})
