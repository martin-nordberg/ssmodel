import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { installFsaMock, readDiskBytes, setPickers } from './fsaMock.ts'
import { plensMenu } from './plensHelpers.ts'

// FR-MIG-1, NFR-TEST-9: converting a (synthetic) Checquery file through the File menu; the statements match
// Checquery's own (small.balances.json).

const dir = new URL('../fixtures/checquery/', import.meta.url).pathname
const checquery = [...readFileSync(`${dir}small.checquery`)]
const { password } = JSON.parse(readFileSync(`${dir}small.reference.json`, 'utf8')) as { password: string }
const { netWorth } = JSON.parse(readFileSync(`${dir}small.balances.json`, 'utf8')) as {
  netWorth: Record<string, number>
}

test('a Checquery file converts to a new .plens file with matching statements; the original is untouched', async ({
  page,
}) => {
  await installFsaMock(page, { 'Household.checquery': checquery })
  await page.goto('/?e2e')
  await setPickers(page, { open: 'Household.checquery', save: 'Household.plens' })
  await plensMenu(page, 'Convert a Checquery file…')

  await expect(page.getByRole('heading', { name: 'Convert Household.checquery' })).toBeVisible()
  await expect(page.getByRole('button', { name: /recovery key/ })).toHaveCount(0)
  await page.getByLabel('Password').fill('wrong')
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(page.getByText('That password is not right. Try again.')).toBeVisible()
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Open' }).click()

  // The new file gets a recovery key of its own.
  await expect(page.getByTestId('recovery-words').locator('li')).toHaveCount(24)
  await page.getByLabel('I have saved the recovery key').check()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByTestId('status-plens')).toHaveText('Household.plens • Saved')
  expect((await readDiskBytes(page, 'Household.plens'))?.length ?? 0).toBeGreaterThan(10_000)
  expect(await readDiskBytes(page, 'Household.checquery')).toEqual(checquery)

  // Net worth at the end of October matches Checquery's balance sheet.
  await page.evaluate(() => {
    location.hash = '#/past/balance-sheet?period=2025-10'
  })
  const cents = netWorth['2025-10-31'] ?? 0
  const expected = `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  await expect(page.getByTestId('net-worth')).toHaveText(expected)
})
