import { expect, type Page, test } from '@playwright/test'
import { installFsaMock } from './fsaMock.ts'
import { ids, seed, seedTransactions } from './ledgerSeed.ts'
import { createFile } from './plensHelpers.ts'

// FR-UI-26, FR-UI-12: the command palette finds accounts, vendors, and transactions by text or amount.

async function search(page: Page, text: string) {
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog', { name: 'Command palette' })
  await dialog.getByRole('combobox').fill(text)
  return dialog
}

test('the palette finds an account, a vendor and a transaction by amount', async ({ page }) => {
  await installFsaMock(page)
  await page.goto('/?e2e')
  await createFile(page, undefined)
  await seed(page)
  await seedTransactions(page)

  // An account, by part of its path: opens its register.
  let dialog = await search(page, 'checking')
  await dialog.getByRole('option', { name: 'Assets : Bank : Checking' }).click()
  await expect(page).toHaveURL(new RegExp(`#/past/register/${ids.checking}`))

  // A vendor.
  dialog = await search(page, 'corner')
  await dialog.getByRole('group', { name: 'Vendors' }).getByRole('option', { name: 'Corner Grocer' }).click()
  await expect(page).toHaveURL(/#\/setup\/vendors/)

  // A transaction, by its amount: opens the bank account's register with the row selected.
  dialog = await search(page, '50.00')
  const result = dialog.getByRole('option', { name: 'Jan 5, 2026 · Corner Grocer · $50.00' })
  await expect(result).toBeVisible()
  await expect(dialog.getByRole('option', { name: /Paycheck/ })).toHaveCount(0)
  await result.click()
  await expect(page).toHaveURL(new RegExp(`#/past/register/${ids.checking}\\?select=`))
  const grid = page.getByRole('grid', { name: 'Register' })
  await expect(grid).toBeFocused()
  await expect(grid.locator('tr[aria-selected="true"]')).toContainText('Corner Grocer')

  // And by text.
  dialog = await search(page, 'paycheck')
  await expect(dialog.getByRole('option', { name: 'Jan 1, 2026 · Paycheck · $3,000.00' })).toBeVisible()
})
