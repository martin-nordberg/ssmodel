import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { installFsaMock } from './fsaMock.ts'

const full = readFileSync(new URL('../fixtures/full.yaml', import.meta.url), 'utf8').replace(
  'paths: 5000',
  'paths: 300',
)

test('compare two scenarios', async ({ page }) => {
  await installFsaMock(page, { 'full.yaml': full })
  await page.goto('/?poolSize=3')
  await page.getByRole('button', { name: 'Open…' }).click()
  await page.getByRole('button', { name: 'Base case actions' }).click()
  await page.getByRole('menuitem', { name: 'Clone' }).click()
  await page.getByRole('tab', { name: 'Compare' }).click()
  await page.getByRole('button', { name: 'Compare scenarios' }).click()
  const table = page.getByTestId('compare-table')
  await expect(table).toContainText('Base case (copy)', { timeout: 120_000 })
  await expect(table).toContainText('Recommended claim age')
  await page.screenshot({ path: 'test-results/compare.png' })
})
