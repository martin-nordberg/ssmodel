import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { installFsaMock, readDisk } from './fsaMock.ts'

const full = readFileSync(new URL('../fixtures/full.yaml', import.meta.url), 'utf8')

async function resultsText(page: Page) {
  await page.getByRole('tab', { name: 'Results' }).click()
  const grid = page.getByRole('grid', { name: 'Year-by-year results' })
  await expect(grid).toContainText('2027')
  return grid.textContent()
}

// M1 end-to-end [NFR-TEST-4]: open, edit, save, reopen, and the results recompute identically.
test('edit, save and reopen reproduces the results', async ({ page, context }) => {
  await installFsaMock(page, { 'full.yaml': full })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open…' }).click()
  await page.getByRole('tab', { name: 'Setup' }).click()
  await page
    .getByRole('navigation', { name: 'Setup sections' })
    .getByRole('button', { name: /^Expenses/ })
    .click()
  await page.getByLabel('Survivor spending fraction').fill('70%')
  await page.getByLabel('Survivor spending fraction').press('Enter')
  const before = await resultsText(page)
  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('status-file')).toHaveText('full.yaml')
  const saved = (await readDisk(page, 'full.yaml')) ?? ''
  expect(saved).toContain('survivorFraction: 0.7')
  expect(saved).toContain('# Full synthetic household')

  const page2 = await context.newPage()
  await installFsaMock(page2, { 'full.yaml': saved })
  await page2.goto('/')
  await page2.getByRole('button', { name: 'Open…' }).click()
  expect(await resultsText(page2)).toBe(before)
})
