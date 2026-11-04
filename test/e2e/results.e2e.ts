import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { installFsaMock } from './fsaMock.ts'

const full = readFileSync(new URL('../fixtures/full.yaml', import.meta.url), 'utf8')

test('results table, dollars toggle and CSV export', async ({ page }) => {
  await installFsaMock(page, { 'full.yaml': full })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open…' }).click()
  await page.getByRole('tab', { name: 'Results' }).click()
  const grid = page.getByRole('grid', { name: 'Year-by-year results' })
  await expect(grid).toContainText('2027')
  // Spouse's 2027 benefit: 12 x $1,400 in base-year dollars.
  await expect(grid.getByRole('row').nth(1)).toContainText('$16,800')
  await expect(page.getByTestId('path-summary')).toContainText('Never')

  await page.getByRole('radio', { name: 'Nominal $' }).click()
  const lastRowNominal = await grid.getByRole('row').last().textContent()
  await page.getByRole('radio', { name: "Today's $" }).click()
  expect(await grid.getByRole('row').last().textContent()).not.toBe(lastRowNominal)

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV' }).click()
  const d = await download
  expect(d.suggestedFilename()).toMatch(/^Base-case-2028-05-real\.csv$/)
  const text = readFileSync((await d.path())!, 'utf8')
  expect(text.split('\n')[0]).toMatch(/^Year,Ages,SS primary/)

  await page.getByLabel('Claiming date (Primary)').selectOption({ label: '2031-05 — age 70y0m' })
  await expect(grid).toContainText('2031')
  await page.screenshot({ path: 'test-results/results.png' })
})

test('withdrawal schedule view', async ({ page }) => {
  await installFsaMock(page, { 'full.yaml': full })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open…' }).click()
  await page.getByRole('tab', { name: 'Results' }).click()
  await page.getByRole('radio', { name: 'Withdrawal schedule' }).click()
  const grid = page.getByRole('grid', { name: 'Year-by-year results' })
  await expect(grid).toContainText('Roth conversions')
  await expect(grid).toContainText('Total withdrawn')
})

test('sensitivity view', async ({ page }) => {
  test.setTimeout(240_000)
  const light = full.replace('paths: 5000', 'paths: 300')
  await installFsaMock(page, { 'full.yaml': light })
  await page.goto('/?poolSize=3')
  await page.getByRole('button', { name: 'Open…' }).click()
  await page.getByRole('tab', { name: 'Results' }).click()
  await page.getByRole('radio', { name: 'Sensitivity' }).click()
  await page.getByRole('button', { name: 'Run sensitivity' }).click()
  const chart = page.getByTestId('sensitivity')
  await expect(chart).toContainText('Both live to 75', { timeout: 200_000 })
  await expect(chart).toContainText('Inheritances')
  await page.screenshot({ path: 'test-results/sensitivity.png' })
})

test('warnings panel lists projected rule tables', async ({ page }) => {
  await installFsaMock(page, { 'full.yaml': full })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open…' }).click()
  await page.getByRole('button', { name: /^Warnings:/ }).click()
  await expect(page.getByTestId('warnings')).toContainText('IRS tax brackets: published through 2026')
})

test('display settings: dark theme, compact numbers, persisted in the browser', async ({ page }) => {
  await installFsaMock(page, { 'full.yaml': full })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open…' }).click()
  await page.getByRole('button', { name: 'Display settings' }).click()
  await page.getByRole('menuitemradio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('menuitemradio', { name: '$1.23M' }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: 'Results' }).click()
  await expect(page.getByRole('grid', { name: 'Year-by-year results' })).toContainText(/\$1\.\d\dM/)
  await page.screenshot({ path: 'test-results/dark.png' })
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.emulateMedia({ media: 'print' })
})
