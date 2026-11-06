import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { installFsaMock } from './fsaMock.ts'

// Every data-input label and editable grid column heading has a (shadcn) tooltip.
const full = readFileSync(new URL('../fixtures/full.yaml', import.meta.url), 'utf8').replace(
  'paths: 5000',
  'paths: 400',
)

/** Text of labels and column headings in `root` that have no tooltip trigger. */
const untipped = (page: Page, root: string) =>
  page.locator(root).evaluate((el) => {
    const has = (e: Element) =>
      e.getAttribute('data-slot') === 'tooltip-trigger' || !!e.querySelector('[data-slot="tooltip-trigger"]')
    const labels = [...el.querySelectorAll('label')].filter((l) => !has(l))
    const heads = [...el.querySelectorAll('[role="grid"] th')].filter((h) => h.textContent?.trim() && !has(h))
    return [...labels, ...heads].map((e) => e.textContent?.trim())
  })

test('every setup input label and column heading has a tooltip', async ({ page }) => {
  await installFsaMock(page, { 'full.yaml': full })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open…' }).click()
  await page.getByRole('tab', { name: 'Setup' }).click()
  const nav = page.getByRole('navigation', { name: 'Setup sections' })
  const n = await nav.getByRole('button').count()
  expect(n).toBeGreaterThan(8)
  const missing: string[] = []
  for (let i = 0; i < n; i++) {
    await nav.getByRole('button').nth(i).click()
    const title = (await page.locator('main section h2').first().textContent()) ?? ''
    for (const t of await untipped(page, 'main')) missing.push(`${title}: ${t}`)
  }
  expect(missing).toEqual([])

  // Hovering a label shows its tip; so does a column heading.
  await nav.getByRole('button', { name: /^Home/ }).click()
  await page.getByText('Monthly principal + interest', { exact: true }).hover()
  await expect(page.getByRole('tooltip')).toContainText('extra principal', { timeout: 10_000 })
  await page.screenshot({ path: 'test-results/tip-home.png' })
  await nav.getByRole('button', { name: /^Accounts/ }).click()
  await page.getByRole('grid', { name: 'Accounts' }).getByText('Return preset', { exact: true }).hover()
  await expect(page.getByRole('tooltip')).toContainText('Moderate 6% / 11%', { timeout: 10_000 })
  await page.screenshot({ path: 'test-results/tip-grid.png' })
})

test('every Console lever has a tooltip', async ({ page }) => {
  await installFsaMock(page, { 'full.yaml': full })
  await page.goto('/?poolSize=2')
  await page.getByRole('button', { name: 'Open…' }).click()
  await page.getByRole('tab', { name: 'Console' }).click()
  const rail = page.getByRole('complementary', { name: 'Levers' })
  await expect(rail.locator('[data-lever]').first()).toBeVisible()
  const bare = await rail
    .locator('[data-lever]')
    .evaluateAll((els) =>
      els.filter((e) => !e.querySelector('[data-slot="tooltip-trigger"]')).map((e) => e.getAttribute('data-lever')),
    )
  expect(bare).toEqual([])
  // Hold still on a settled page: the tip appears after 5 seconds.
  await expect(page.getByText('Median path')).toBeVisible({ timeout: 60_000 })
  await rail.getByText('Volatility multiplier', { exact: true }).hover()
  await expect(page.getByRole('tooltip')).toContainText('1.5 makes market swings 50% larger', { timeout: 10_000 })
})
