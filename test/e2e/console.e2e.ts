import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { installFsaMock, readDisk } from './fsaMock.ts'

// A lighter run for tests: 600 paths.
const full = readFileSync(new URL('../fixtures/full.yaml', import.meta.url), 'utf8').replace(
  'paths: 5000',
  'paths: 600',
)

async function openConsole(page: Page) {
  await installFsaMock(page, { 'full.yaml': full })
  await page.goto('/?poolSize=3')
  await page.getByRole('button', { name: 'Open…' }).click()
  await page.getByRole('tab', { name: 'Console' }).click()
  await expect(page.getByTestId('recommendation')).toContainText('Claim at', { timeout: 30_000 })
}

test('recommendation, explanation and KPI tiles', async ({ page }) => {
  await openConsole(page)
  await expect(page.getByTestId('explanation')).toContainText('maximizes median after-tax terminal wealth')
  await expect(page.getByTestId('kpi-tiles')).toContainText('Success probability')
  await expect(page.getByRole('grid', { name: 'Year-by-year strip' })).toContainText('2027')
  await page.screenshot({ path: 'test-results/console.png', fullPage: true })
})

test('a lever creates a what-if; apply writes it to the scenario', async ({ page }) => {
  await openConsole(page)
  const thumb = page.getByRole('slider', { name: 'Survivor spending' })
  await thumb.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('tablist', { name: 'Scenarios' })).toContainText('1 what-if')
  await expect(page.getByTestId('status-file')).toHaveText('full.yaml')
  await page.getByRole('button', { name: 'Apply to scenario' }).click()
  await expect(page.getByRole('tablist', { name: 'Scenarios' })).not.toContainText('what-if')
  await expect(page.getByTestId('status-file')).toHaveText('full.yaml • modified')
  await page.keyboard.press('Control+s')
  expect(await readDisk(page, 'full.yaml')).toContain('survivorFraction: 0.7')
})

test('reset and undo of what-ifs', async ({ page }) => {
  await openConsole(page)
  const field = page.locator('[data-lever="Inflation (mean)"] input')
  await field.fill('4%')
  await field.press('Enter')
  await expect(page.getByRole('tablist', { name: 'Scenarios' })).toContainText('1 what-if')
  await page.getByRole('button', { name: 'Reset Inflation (mean)' }).click()
  await expect(page.getByRole('tablist', { name: 'Scenarios' })).not.toContainText('what-if')
  await page
    .locator('main, body')
    .first()
    .click({ position: { x: 2, y: 2 } })
  await page.keyboard.press('Control+z')
  await expect(page.getByRole('tablist', { name: 'Scenarios' })).toContainText('1 what-if')
})

test('the claim-age lever inspects another date', async ({ page }) => {
  await openConsole(page)
  const thumb = page.getByRole('slider', { name: 'Claim age (inspect)' })
  await thumb.focus()
  await page.keyboard.press('Home')
  await expect(page.getByText(/Showing 2027-02/)).toBeVisible()
})

test('add a Setup field to the Console', async ({ page }) => {
  await openConsole(page)
  await page.getByRole('tab', { name: 'Setup' }).click()
  await page
    .getByRole('navigation', { name: 'Setup sections' })
    .getByRole('button', { name: /^Assumptions/ })
    .click()
  await page.getByLabel("Heirs' tax rate on IRAs").click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Add to Console' }).click()
  await page.getByRole('tab', { name: 'Console' }).click()
  await expect(page.getByText('Added from Setup')).toBeVisible()
  await expect(page.getByRole('slider', { name: "Heirs' tax rate on IRAs" })).toBeVisible()
  await page.getByRole('button', { name: "Remove Heirs' tax rate on IRAs from Console" }).click()
  await expect(page.getByRole('slider', { name: "Heirs' tax rate on IRAs" })).toHaveCount(0)
  // The fixture's own promoted lever has a readable label.
  await expect(page.getByRole('slider', { name: 'Medical inflation spread' })).toBeVisible()
})

test('pin a baseline and see deltas after a what-if', async ({ page }) => {
  await openConsole(page)
  const pin = page.getByRole('button', { name: 'Pin baseline' })
  await expect(pin).toBeEnabled({ timeout: 60_000 })
  await pin.click()
  await expect(page.getByText(/^Baseline: Base case/)).toBeVisible()
  const field = page.locator('[data-lever="Expense scale"] input')
  await field.fill('120%')
  await field.press('Enter')
  await expect(page.getByTestId('kpi-tiles')).toContainText('vs baseline', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(page.getByTestId('kpi-tiles')).not.toContainText('vs baseline')
})

test('the explanation reports the recommendation without inheritances', async ({ page }) => {
  await openConsole(page)
  await expect(page.getByTestId('explanation')).toContainText('Without the expected inheritances', { timeout: 60_000 })
})
