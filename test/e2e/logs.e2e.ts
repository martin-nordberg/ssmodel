import { expect, type Page, test } from '@playwright/test'
import { installFsaMock } from './fsaMock.ts'
import { ids, seed, seedTransactions } from './ledgerSeed.ts'
import { openPage } from './nav.ts'
import { createFile } from './plensHelpers.ts'

// FR-LED-1, FR-LED-3: Income and Expense Logs, and balance checks that pass and fail.

async function setup(page: Page) {
  await installFsaMock(page)
  await page.goto('/?e2e')
  await createFile(page, undefined)
  await seed(page)
  await seedTransactions(page)
}

const rows = (page: Page) => page.getByRole('grid', { name: 'Register' }).locator('tbody tr[id^="register-row-"]')

test('each income and expense account has a log, without a running balance', async ({ page }) => {
  await setup(page)
  await openPage(page, 'Past', 'Expense Log')
  const table = page.getByRole('table')
  await expect(table.getByRole('row', { name: /Food : Groceries/ })).toContainText('$50.00')
  await expect(table.getByRole('row', { name: /Taxes : Federal/ })).toContainText('$1,000.00')
  await table.getByRole('link', { name: 'Food : Groceries' }).click()
  await expect(page.getByText('Expense Log: every transaction filed here')).toBeVisible()
  const grid = page.getByRole('grid', { name: 'Register' })
  await expect(grid.getByRole('columnheader', { name: 'Balance' })).toHaveCount(0)
  await expect(grid.getByRole('columnheader', { name: 'Spent' })).toBeVisible()
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toContainText('Corner Grocer')
  await expect(page.getByRole('button', { name: 'Add balance check' })).toHaveCount(0)

  await openPage(page, 'Past', 'Income Log')
  await page.getByRole('link', { name: 'Work : Salary' }).click()
  await expect(page.getByText('Income Log: every transaction filed here')).toBeVisible()
  await expect(rows(page).first()).toContainText('Paycheck')
  await expect(rows(page).first()).toContainText('$4,000.00')
})

test('a balance check that passes and one that fails, by keyboard', async ({ page }) => {
  await setup(page)
  await page.evaluate((acct) => {
    location.hash = `#/past/register/${acct}`
  }, ids.checking)
  const grid = page.getByRole('grid', { name: 'Register' })
  await grid.focus()

  // B on the top row (Jan 5) proposes that date with the register's balance; Enter saves it.
  await page.keyboard.press('Home')
  await page.keyboard.press('b')
  const editor = page.getByRole('group', { name: 'New balance check' })
  await expect(editor.getByLabel('Statement date')).toHaveValue('2026-01-05')
  await expect(editor.getByLabel('Statement balance')).toHaveValue('2950.00')
  await page.keyboard.press('Enter')
  await expect(grid.locator('tr[data-check="confirmed"]')).toContainText('Balance confirmed: $2,950.00')

  // A statement for Jan 1 that says $3,100: out of balance by $100.
  await grid.focus()
  await page.keyboard.press('End')
  await page.keyboard.press('b')
  await expect(page.getByRole('group', { name: 'New balance check' }).getByLabel('Statement date')).toHaveValue(
    '2026-01-01',
  )
  await page.keyboard.press('Tab')
  await page.keyboard.press('Control+a')
  await page.keyboard.type('3100')
  await page.keyboard.press('Enter')
  const failing = grid.locator('tr[data-check="out-of-balance"]')
  await expect(failing).toContainText('the statement says $3,100.00, $100.00 more than the register')

  // Both on the balance checks page.
  await openPage(page, 'Past', 'Balance checks')
  const table = page.getByRole('table')
  await expect(table.getByRole('row', { name: /Jan 5, 2026/ })).toContainText('Confirmed')
  await expect(table.getByRole('row', { name: /Jan 1, 2026/ })).toContainText('Out by $100.00')

  // Fix the statement balance: Enter on the check edits it.
  await page.goBack()
  await grid.focus()
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  const edit = page.getByRole('group', { name: 'Edit balance check' })
  await expect(edit.getByLabel('Statement balance')).toBeFocused()
  await page.keyboard.type('3000')
  await page.keyboard.press('Enter')
  await expect(grid.locator('tr[data-check="out-of-balance"]')).toHaveCount(0)
  await expect(grid.locator('tr[data-check="confirmed"]')).toHaveCount(2)
})
