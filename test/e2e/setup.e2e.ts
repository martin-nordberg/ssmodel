import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { installFsaMock, readDisk } from './fsaMock.ts'

const full = readFileSync(new URL('../fixtures/full.yaml', import.meta.url), 'utf8')

const section = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Setup sections' })
    .getByRole('button', { name: new RegExp(`^${name}( \\(incomplete\\))?$`) })

async function openFull(page: Page) {
  await installFsaMock(page, { 'full.yaml': full })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open…' }).click()
  await page.getByRole('tab', { name: 'Setup' }).click()
}

test('setup sections show the loaded household', async ({ page }) => {
  await openFull(page)
  await expect(page.getByRole('navigation', { name: 'Setup sections' })).toBeVisible()
  await section(page, 'Earnings').click()
  await expect(page.getByTestId('pia-summary')).toContainText('Statement cross-check')
  await expect(page.getByRole('grid', { name: 'Earnings record' })).toContainText('1983')
  await section(page, 'Accounts').click()
  await expect(page.getByRole('grid', { name: 'Accounts' })).toContainText('$650,000')
  await expect(page.getByRole('grid', { name: 'Inherited IRAs' })).toContainText('1938-07-01')
  await page.screenshot({ path: 'test-results/setup-accounts.png', fullPage: true })
  await section(page, 'Expenses').click()
  await expect(page.getByRole('grid', { name: 'Expenses' })).toContainText('Roof + kitchen')
  await section(page, 'Home').click()
  await expect(page.getByText(/Principal \+ interest: \$1,(799|800)\.\d\d\/month/)).toBeVisible()
  await page.getByLabel('Interest rate').fill('6%')
  await page.getByLabel('Interest rate').press('Enter')
  await expect(page.getByText(/Principal \+ interest: \$1,894\.\d\d\/month/)).toBeVisible()
  await expect(page.getByLabel('Property tax reduction')).toHaveCount(0) // no replacement home
})

test('enter a household by hand and save it', async ({ page }) => {
  await installFsaMock(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'New household…' }).click()
  await page.getByLabel('Primary birth date').fill('1961-05-14')
  await page.getByLabel('Spouse birth date').fill('1963-02-02')
  await page.getByLabel('Spouse current monthly benefit ($)').fill('1400')
  await page.getByLabel('Spouse claimed (month)').fill('2025-03')
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('tab', { name: 'Setup' }).click()
  await expect(page.getByTestId('completeness')).toContainText('At least one account')

  // Earnings: FRA estimate and a pasted record.
  await section(page, 'Earnings').click()
  await page.getByLabel('SSA statement FRA estimate (monthly)').fill('3,150')
  await page.getByLabel('SSA statement FRA estimate (monthly)').press('Enter')
  await page.getByRole('button', { name: 'Add row' }).first().click()
  const grid = page.getByRole('grid', { name: 'Earnings record' })
  await grid.focus()
  await grid.evaluate((el) => {
    const dt = new DataTransfer()
    dt.setData('text/plain', '2022\t$147,000\n2023\t$160,200\n')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await expect(grid).toContainText('$160,200')

  // Accounts.
  await section(page, 'Accounts').click()
  await page.getByRole('button', { name: 'Add row' }).first().click()
  const accounts = page.getByRole('grid', { name: 'Accounts' })
  await accounts.focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  await page.keyboard.type('650k')
  await page.keyboard.press('Enter')
  await expect(accounts).toContainText('$650,000')

  // Expenses.
  await section(page, 'Expenses').click()
  await page.getByRole('button', { name: 'Add row' }).click()
  const exp = page.getByRole('grid', { name: 'Expenses' })
  await exp.focus()
  await page.keyboard.type('Living')
  await page.keyboard.press('Tab')
  await page.keyboard.type('72000')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('completeness').locator('li:not(.line-through)')).toHaveCount(0)

  await page.keyboard.press('Control+Shift+S')
  await expect(page.getByTestId('status-file')).toHaveText('saved.yaml')
  const saved = (await readDisk(page, 'saved.yaml')) ?? ''
  expect(saved).toContain('fraEstimateMonthly: 3150')
  expect(saved).toContain('amount: 160200')
  expect(saved).toContain('balance: 650000')
  expect(saved).toContain('label: Living')
  expect(saved).toContain('annual: 72000')
})

test('undo and redo with the keyboard', async ({ page }) => {
  await openFull(page)
  await section(page, 'Expenses').click()
  await page.getByLabel('Survivor spending fraction').fill('60%')
  await page.getByLabel('Survivor spending fraction').press('Enter')
  await page.locator('main').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Control+z')
  await expect(page.getByLabel('Survivor spending fraction')).toHaveValue('75%')
  await page.keyboard.press('Control+Shift+z')
  await expect(page.getByLabel('Survivor spending fraction')).toHaveValue('60%')
})

test('M3 panels: add an inheritance with real estate, an annuity, and a home sale', async ({ page }) => {
  const minimal = readFileSync(new URL('../fixtures/minimal.yaml', import.meta.url), 'utf8')
  await installFsaMock(page, { 'minimal.yaml': minimal })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open…' }).click()
  await page.getByRole('tab', { name: 'Setup' }).click()

  await section(page, 'Inheritances').click()
  await page.getByRole('button', { name: 'Add row' }).first().click()
  const grid = page.getByRole('grid', { name: 'Inheritances' })
  await grid.focus()
  await page.keyboard.type("Mother's estate")
  await page.keyboard.press('Enter')
  await expect(grid).toContainText("Mother's estate")
  await page.getByRole('button', { name: 'Add row' }).nth(1).click()
  await expect(page.getByRole('grid', { name: 'Inherited real estate' })).toContainText('Property')

  await section(page, 'Income').click()
  await page.getByRole('button', { name: 'Add row' }).first().click()
  await expect(page.getByRole('grid', { name: 'Annuities' })).toContainText('Annuity')

  await section(page, 'Home').click()
  await page.getByLabel('We own a home').click()
  await page.getByLabel('Value today').fill('450k')
  await page.getByLabel('Value today').press('Enter')

  await page.keyboard.press('Control+s')
  const saved = (await readDisk(page, 'minimal.yaml')) ?? ''
  expect(saved).toContain("label: Mother's estate")
  expect(saved).toContain('label: Property')
  expect(saved).toContain('label: Annuity')
  expect(saved).toContain('value: 450000')
})
