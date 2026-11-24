import { expect, type Page, test } from '@playwright/test'
import { installFsaMock } from './fsaMock.ts'
import { ids, seed } from './ledgerSeed.ts'
import { createFile } from './plensHelpers.ts'

// FR-LED-3, FR-UI-31, D: OQ-UI-13: an account's register, entered and edited by keyboard only.

const rows = (page: Page) => page.getByRole('grid', { name: 'Register' }).locator('tbody tr[id^="register-row-"]')
const key = (page: Page, ...keys: string[]) =>
  keys.reduce((p, k) => p.then(() => page.keyboard.press(k)), Promise.resolve())

test('enter, split, edit and delete transactions by keyboard only', async ({ page }) => {
  await installFsaMock(page)
  await page.goto('/?e2e&autosaveMs=300')
  await createFile(page, undefined)
  await seed(page)
  await page.evaluate((acct) => {
    location.hash = `#/past/register/${acct}`
  }, ids.checking)
  await expect(page.getByRole('heading', { name: 'Bank : Checking' })).toBeVisible()

  const grid = page.getByRole('grid', { name: 'Register' })
  await grid.focus()

  // 1. A purchase: the vendor fills in its default account; the amount is worked out by the calculator.
  await key(page, 'n')
  const editor = page.getByRole('group', { name: 'New transaction' })
  await expect(editor.getByLabel('Date', { exact: true })).toBeFocused()
  await key(page, 'Control+a')
  await page.keyboard.type('1/5/2026')
  await key(page, 'Tab', 'Tab', 'Tab') // Cleared, Number, Vendor
  await page.keyboard.type('Corner Grocer')
  await key(page, 'Tab') // Description
  await expect(editor.getByLabel('Account', { exact: true })).toHaveValue('Expenses : Food : Groceries')
  await key(page, 'Tab', 'Tab') // Account, Payment
  await page.keyboard.type('45.50 + 4.50')
  await key(page, 'Enter')
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toContainText('Corner Grocer')
  await expect(rows(page).first()).toContainText('Groceries')
  await expect(rows(page).first()).toContainText('$50.00')

  // 2. A split paycheck: deposit $3,000 = $4,000 salary − $1,000 federal tax. The editor is open again, ready.
  const next = page.getByRole('group', { name: 'New transaction' })
  await expect(next.getByLabel('Date', { exact: true })).toBeFocused()
  await key(page, 'Control+a')
  await page.keyboard.type('1/1/2026')
  await key(page, 'Tab', 'Tab', 'Tab', 'Tab') // Cleared, Number, Vendor, Description
  await page.keyboard.type('Paycheck')
  await key(page, 'Tab') // Account
  await page.keyboard.type('Income : Work : Salary')
  await key(page, 'Tab', 'Tab') // Payment, Deposit
  await page.keyboard.type('3000')
  await key(page, 'Tab', 'Enter') // Split
  await expect(next.getByLabel('Line 2 account')).toBeFocused()
  await page.keyboard.type('Expenses : Taxes : Federal')
  await key(page, 'Tab') // Line 2 amount
  await page.keyboard.type('-1000')
  await key(page, 'Shift+Tab', 'Shift+Tab', 'Shift+Tab') // Line 2 account, Remove line 1, Line 1 amount
  await key(page, 'Control+a')
  await page.keyboard.type('4000')
  await key(page, 'Enter') // commits the amount (now balanced) and saves
  await expect(rows(page)).toHaveCount(2)
  await expect(rows(page).nth(1)).toContainText('Paycheck')
  await expect(rows(page).nth(1)).toContainText('Split')
  await expect(rows(page).nth(1)).toContainText('$3,000.00')
  await expect(rows(page).nth(0)).toContainText('$2,950.00') // running balance after the purchase

  // 3. Edit the purchase: Escape closes the new-transaction editor; Enter edits the selected (top) row.
  await key(page, 'Escape')
  await expect(grid).toBeFocused()
  await key(page, 'Home', 'Enter')
  const edit = page.getByRole('group', { name: 'Edit transaction' })
  await expect(edit.getByLabel('Date', { exact: true })).toBeFocused()
  await key(page, 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab') // … Account, Payment
  await expect(edit.getByLabel('Payment')).toBeFocused()
  await key(page, 'Control+a')
  await page.keyboard.type('60')
  await key(page, 'Enter')
  await expect(edit).toHaveCount(0)
  await expect(rows(page).first()).toContainText('$60.00')
  await expect(rows(page).first()).toContainText('$2,940.00')

  // 4. Delete it: Delete asks, Enter confirms.
  await expect(grid).toBeFocused()
  await key(page, 'Delete')
  await expect(page.getByRole('alert').filter({ hasText: 'Delete this transaction' })).toBeVisible()
  await key(page, 'Enter')
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toContainText('Paycheck')
  await expect(page.getByRole('heading', { name: 'Bank : Checking' }).locator('..')).toContainText('Balance: $3,000.00')
})

test('date shortcuts and a refused entry', async ({ page }) => {
  await installFsaMock(page)
  await page.goto('/?e2e')
  await createFile(page, undefined)
  await seed(page)
  await page.evaluate((acct) => {
    location.hash = `#/past/register/${acct}`
  }, ids.checking)
  const grid = page.getByRole('grid', { name: 'Register' })
  await grid.focus()
  await key(page, 'n')
  const editor = page.getByRole('group', { name: 'New transaction' })
  const date = editor.getByLabel('Date', { exact: true })
  await key(page, 'Control+a')
  await page.keyboard.type('3/31/2026')
  await key(page, 'PageDown')
  await expect(date).toHaveValue('2026-04-30')
  await key(page, '+')
  await expect(date).toHaveValue('2026-05-01')
  await key(page, '-', '-')
  await expect(date).toHaveValue('2026-04-29')
  // No vendor or description: refused with a message, nothing saved.
  await key(page, 'Enter')
  await expect(editor.getByRole('alert')).toHaveText('Enter a vendor or a description.')
  await key(page, 'Escape')
  await expect(rows(page)).toHaveCount(0)
})
