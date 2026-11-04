import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { installFsaMock, readDisk } from './fsaMock.ts'

const minimal = readFileSync(new URL('../fixtures/minimal.yaml', import.meta.url), 'utf8')

test('open, edit, save, reopen', async ({ page }) => {
  await installFsaMock(page, { 'minimal.yaml': minimal })
  await page.goto('/')
  await page.getByRole('button', { name: 'File' }).click()
  await page.getByRole('menuitem', { name: /^Open…/ }).click()
  await expect(page.getByTestId('status-file')).toHaveText('minimal.yaml')

  await page.getByRole('tab', { name: 'Setup' }).click()
  await page.getByLabel('Base date (month)').fill('2028-03')
  await page.getByLabel('Base date (month)').press('Enter')
  await expect(page.getByTestId('status-file')).toHaveText('minimal.yaml • modified')
  await expect(page).toHaveTitle(/^• minimal\.yaml/)

  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('status-file')).toHaveText('minimal.yaml')
  const saved = await readDisk(page, 'minimal.yaml')
  expect(saved).toContain('baseDate: 2028-03')
  expect(saved).toContain('# Minimal synthetic household')

  // Reopen the saved text in a fresh page.
  const page2 = await page.context().newPage()
  await installFsaMock(page2, { 'minimal.yaml': saved ?? '' })
  await page2.goto('/')
  await page2.getByRole('button', { name: 'Open…' }).click()
  await page2.getByRole('tab', { name: 'Setup' }).click()
  await expect(page2.getByLabel('Base date (month)')).toHaveValue('2028-03')
})

test('new household and save as', async ({ page }) => {
  await installFsaMock(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'New household…' }).click()
  await page.getByLabel('Primary birth date').fill('1961-05-14')
  await page.getByLabel('Spouse birth date').fill('1963-02-02')
  await page.getByLabel('Spouse current monthly benefit ($)').fill('1400')
  await page.getByLabel('Spouse claimed (month)').fill('2025-03')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByTestId('status-file')).toHaveText('Untitled.yaml • modified')
  await page.keyboard.press('Control+Shift+S')
  await expect(page.getByTestId('status-file')).toHaveText('saved.yaml')
  expect(await readDisk(page, 'saved.yaml')).toContain('birthDate: 1961-05-14')
})

test('invalid file shows located errors', async ({ page }) => {
  await installFsaMock(page, { 'bad.yaml': 'schemaVersion: 1\nhousehold:\n  people: {}\nscenarios: []\n' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open…' }).click()
  await expect(page.getByText('The file could not be opened')).toBeVisible()
  await expect(page.getByText(/line 3:/).first()).toBeVisible()
})

test('unsupported browser message', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined })
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Chromium-based browser required' })).toBeVisible()
})
