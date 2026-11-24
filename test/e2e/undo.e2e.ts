import { expect, type Page, test } from '@playwright/test'
import { installFsaMock } from './fsaMock.ts'
import { ids, seed, seedTransactions } from './ledgerSeed.ts'
import { createFile } from './plensHelpers.ts'

// Plan P2.7, FR-HLP-6: undo and redo of ledger edits, and the plain or accounting view of registers.

const rows = (page: Page) => page.getByRole('grid', { name: 'Register' }).locator('tbody tr[id^="register-row-"]')

async function openChecking(page: Page) {
  await installFsaMock(page)
  await page.goto('/?e2e')
  await createFile(page, undefined)
  await seed(page)
  await seedTransactions(page)
  await page.evaluate((acct) => {
    location.hash = `#/past/register/${acct}`
  }, ids.checking)
}

test('a split edit is undone and redone', async ({ page }) => {
  await openChecking(page)
  const grid = page.getByRole('grid', { name: 'Register' })
  await expect(rows(page)).toHaveCount(2)
  const paycheck = rows(page).nth(1)
  await expect(paycheck).toContainText('$3,000.00')

  // Edit the split paycheck: $3,200 = $4,200 salary − $1,000 tax.
  await grid.focus()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  const edit = page.getByRole('group', { name: 'Edit transaction' })
  await edit.getByLabel('Line 1 amount').fill('4200')
  await edit.getByLabel('Deposit').fill('3200')
  await edit.getByLabel('Deposit').press('Enter')
  await expect(edit).toHaveCount(0)
  await expect(paycheck).toContainText('$3,200.00')

  // Ctrl+Z on the register undoes it; Ctrl+Shift+Z redoes it.
  await grid.focus()
  await page.keyboard.press('Control+z')
  await expect(paycheck).toContainText('$3,000.00')
  await expect(rows(page).first()).toContainText('$2,950.00')
  await page.keyboard.press('Control+Shift+z')
  await expect(paycheck).toContainText('$3,200.00')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(paycheck).toContainText('$3,000.00')

  // Undoing a delete brings the transaction back.
  await grid.focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('Delete')
  await page.keyboard.press('Enter')
  await expect(rows(page)).toHaveCount(1)
  await page.keyboard.press('Control+z')
  await expect(rows(page)).toHaveCount(2)
  await expect(rows(page).first()).toContainText('Corner Grocer')
})

test('registers show plain words by default, or debits and credits', async ({ page }) => {
  await openChecking(page)
  const grid = page.getByRole('grid', { name: 'Register' })
  await expect(grid.getByRole('columnheader', { name: 'Payment' })).toBeVisible()
  await expect(grid.getByRole('columnheader', { name: 'Deposit' })).toBeVisible()
  await page.getByRole('button', { name: 'Display settings' }).click()
  await page.getByRole('menuitemradio', { name: 'Accounting (debit, credit)' }).click()
  await page.keyboard.press('Escape')
  await expect(grid.getByRole('columnheader', { name: 'Debit' })).toBeVisible()
  await expect(grid.getByRole('columnheader', { name: 'Credit' })).toBeVisible()
  await expect(grid.getByRole('columnheader', { name: 'Payment' })).toHaveCount(0)
})
