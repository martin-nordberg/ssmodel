import { readFileSync } from 'node:fs'
import { expect, type Locator, type Page, test } from '@playwright/test'
import { installFsaMock } from './fsaMock.ts'

// FR-UI-14: clicking a computed value opens its breakdown; the breakdown's total is the value shown.
const full = readFileSync(new URL('../fixtures/full.yaml', import.meta.url), 'utf8').replace(
  'paths: 5000',
  'paths: 600',
)

async function cell(grid: Locator, row: number, header: string) {
  const headers = (await grid.getByRole('columnheader').allTextContents()).map((h) => h.trim())
  const idx = headers.indexOf(header)
  expect(idx).toBeGreaterThanOrEqual(0)
  return grid.getByRole('row').nth(row).getByRole('gridcell').nth(idx)
}

async function explainAndCheck(page: Page, grid: Locator, row: number, header: string, title: RegExp) {
  const c = await cell(grid, row, header)
  const shown = (await c.textContent())?.trim() ?? ''
  await c.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading')).toContainText(title)
  await expect(dialog.getByTestId('explanation-total')).toHaveText(shown)
  await expect(dialog.getByRole('heading')).toContainText(shown)
  return dialog
}

test('explain values in the Results year table', async ({ page }) => {
  await installFsaMock(page, { 'full.yaml': full })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open…' }).click()
  await page.getByRole('tab', { name: 'Results' }).click()
  const grid = page.getByRole('grid', { name: 'Year-by-year results' })
  await expect(grid).toContainText('2027')

  const fed = await explainAndCheck(page, grid, 1, 'Federal tax', /^Federal income tax, 2027/)
  await expect(fed.getByRole('table', { name: 'Income → AGI' })).toContainText('Taxable Social Security')
  await expect(fed.getByRole('table', { name: 'Deduction', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(fed).toBeHidden()

  const w = await explainAndCheck(page, grid, 1, 'From Taxable', /^Withdrawal from Taxable, 2027/)
  await expect(w.getByRole('table', { name: 'Withdrawals', exact: true })).toContainText(
    'Sold to pay Roth conversion tax',
  )
  await expect(w.getByRole('table', { name: /^Cash flow/ })).toBeVisible()
  await page.keyboard.press('Escape')

  // Nominal dollars change the figures consistently.
  await page.getByRole('radio', { name: 'Nominal $' }).click()
  await explainAndCheck(page, grid, 5, 'Federal tax', /^Federal income tax, 2031/)
})

test('explain values in the Console detail strip (median path)', async ({ page }) => {
  await installFsaMock(page, { 'full.yaml': full })
  await page.goto('/?poolSize=3')
  await page.getByRole('button', { name: 'Open…' }).click()
  await page.getByRole('tab', { name: 'Console' }).click()
  await expect(page.getByText('Median path')).toBeVisible({ timeout: 60_000 })
  const strip = page.getByRole('grid', { name: 'Year-by-year strip' })
  const d = await explainAndCheck(page, strip, 2, 'Taxes', /^Taxes, 2028/)
  await expect(d).toContainText('Median path')
})
