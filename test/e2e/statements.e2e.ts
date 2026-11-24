import { expect, type Page, test } from '@playwright/test'
import { installFsaMock } from './fsaMock.ts'
import { seed, seedTransactions } from './ledgerSeed.ts'
import { openPage } from './nav.ts'
import { createFile } from './plensHelpers.ts'

// FR-LED-2, FR-LED-3, RPT-LED-1, RPT-LED-2: the Balance Sheet and Income Statement by year, quarter and month, with
// drill-down to registers. (Totals are checked against hand-computed values in test/ledger/reports.)

async function setup(page: Page) {
  await installFsaMock(page)
  await page.goto('/?e2e')
  await createFile(page, undefined)
  await seed(page)
  await seedTransactions(page) // Jan 1: $3,000 paycheck ($4,000 salary − $1,000 tax); Jan 5: $50 groceries
}

test('Balance Sheet: net worth is assets minus liabilities, and amounts drill down', async ({ page }) => {
  await setup(page)
  await page.evaluate(() => {
    location.hash = '#/past/balance-sheet?period=2026-01'
  })
  await expect(page.getByTestId('assets-total')).toHaveText('$2,950.00')
  await expect(page.getByTestId('liabilities-total')).toHaveText('$0.00')
  await expect(page.getByTestId('net-worth')).toHaveText('$2,950.00')

  // Before any transactions, everything is zero.
  await page.getByRole('button', { name: 'Previous period' }).click()
  await expect(page).toHaveURL(/period=2025-12/)
  await expect(page.getByTestId('net-worth')).toHaveText('$0.00')

  // Drill down to the register, with the trail back.
  await page.getByRole('button', { name: 'Next period' }).click()
  await page.getByTestId('assets').getByRole('link', { name: 'Checking' }).click()
  const crumbs = page.getByTestId('breadcrumbs')
  await expect(crumbs).toContainText('Past')
  await expect(crumbs).toContainText('Balance Sheet Jan 2026')
  await crumbs.getByRole('link', { name: 'Balance Sheet Jan 2026' }).click()
  await expect(page).toHaveURL(/balance-sheet\?period=2026-01/)
})

test('Income Statement: summary and details, by month, quarter and year', async ({ page }) => {
  await setup(page)
  await openPage(page, 'Past', 'Income Statement')
  const period = page.getByRole('toolbar', { name: 'Report filters' })
  await period.getByRole('button', { name: 'month' }).click()
  await period.getByLabel('Year').selectOption('2026')
  await period.getByLabel('Month').selectOption({ label: 'Jan' })
  await expect(page).toHaveURL(/period=2026-01/)
  await expect(page.getByTestId('income-total')).toHaveText('$4,000.00')
  await expect(page.getByTestId('expenses-total')).toHaveText('$1,050.00')
  await expect(page.getByTestId('net-income')).toHaveText('$2,950.00')

  // February has nothing.
  await page.getByRole('button', { name: 'Next period' }).click()
  await expect(page.getByTestId('net-income')).toHaveText('$0.00')

  // The quarter and the year include January.
  await period.getByRole('button', { name: 'quarter' }).click()
  await expect(page).toHaveURL(/period=2026-Q1/)
  await expect(page.getByTestId('net-income')).toHaveText('$2,950.00')
  await period.getByRole('button', { name: 'year' }).click()
  await expect(page.getByTestId('net-income')).toHaveText('$2,950.00')

  // Details list the entries under each account.
  await period.getByRole('button', { name: 'details' }).click()
  await expect(page.getByTestId('expenses')).toContainText('Jan 5, 2026 · Corner Grocer')
  await expect(page.getByTestId('income')).toContainText('Jan 1, 2026 · Paycheck')
})
