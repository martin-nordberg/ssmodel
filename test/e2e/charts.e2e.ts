import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { installFsaMock } from './fsaMock.ts'

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

test('claim curve, fan, income and tax charts render with table views', async ({ page }) => {
  await openConsole(page)
  const charts = page.getByRole('region', { name: 'Charts' })
  await expect(charts.getByTestId('claim-curve').locator('svg.recharts-surface').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/chart-claim.png' })
  await charts.getByRole('button', { name: 'Table' }).click()
  await expect(charts.getByRole('table')).toContainText('Median')
  await charts.getByRole('button', { name: 'Chart' }).click()

  for (const [tab, title] of [
    ['Balance fan', 'Total liquid savings'],
    ['Income stack', 'Where the money comes from'],
    ['Taxes', 'Taxes and IRMAA'],
  ] as const) {
    await charts.getByRole('tab', { name: tab }).click()
    await expect(charts.getByRole('figure', { name: new RegExp(title) })).toBeVisible({ timeout: 30_000 })
    await page.screenshot({ path: `test-results/chart-${tab.replace(/\W+/g, '-')}.png` })
  }
  await charts.getByRole('tab', { name: 'Balance fan' }).click()
  await charts.getByRole('button', { name: 'By account' }).click()
  await expect(charts.getByRole('figure', { name: /Median balance by account/ })).toBeVisible()
  await page.screenshot({ path: 'test-results/chart-by-account.png' })
})

test('hovering a chart highlights the year in the detail strip', async ({ page }) => {
  await openConsole(page)
  const charts = page.getByRole('region', { name: 'Charts' })
  await charts.getByRole('tab', { name: 'Balance fan' }).click()
  const fig = charts.getByRole('figure', { name: /Total liquid savings/ })
  await expect(fig).toBeVisible({ timeout: 30_000 })
  const box = (await fig.locator('svg.recharts-surface').boundingBox())!
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5)
  await expect(page.getByRole('region', { name: 'Year-by-year' }).getByRole('heading')).toContainText(/— 20\d\d/)
})

test('layout menu hides a chart tab (saved in the browser)', async ({ page }) => {
  await openConsole(page)
  await page.getByRole('button', { name: 'Console layout' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Taxes' }).click()
  await page.keyboard.press('Escape')
  const charts = page.getByRole('region', { name: 'Charts' })
  await expect(charts.getByRole('tab', { name: 'Taxes' })).toHaveCount(0)
  await page.reload()
  await page.getByRole('button', { name: 'Open…' }).click()
  await page.getByRole('tab', { name: 'Console' }).click()
  await expect(page.getByRole('region', { name: 'Charts' }).getByRole('tab', { name: 'Taxes' })).toHaveCount(0)
})
