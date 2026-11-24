import { expect, test } from '@playwright/test'

test('app loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Home', level: 2 })).toBeVisible()
})
