import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { installFsaMock, readDisk } from './fsaMock.ts'

const minimal = readFileSync(new URL('../fixtures/minimal.yaml', import.meta.url), 'utf8')

async function run(page: Page, search: string, item: string | RegExp) {
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog', { name: 'Command palette' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('combobox').fill(search)
  await dialog.getByRole('option', { name: item }).click()
  await expect(dialog).toBeHidden()
}

test('the command palette filters and runs commands from each group', async ({ page }) => {
  await installFsaMock(page, { 'minimal.yaml': minimal })
  await page.goto('/')

  // Without a file only File and Display commands are offered.
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog', { name: 'Command palette' })
  await expect(dialog.getByRole('option', { name: 'Open…' })).toBeVisible()
  await expect(dialog.getByRole('option', { name: 'Results' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await run(page, 'open', 'Open…') // File
  await expect(page.getByRole('tablist', { name: 'Scenarios' })).toBeVisible()

  await run(page, 'home', /^Home/) // Setup panel
  await expect(page.getByRole('heading', { name: 'Home', level: 2 })).toBeVisible()

  await run(page, 'results', /^Results/) // Go to
  await expect(page.getByRole('tab', { name: 'Results' })).toHaveAttribute('aria-selected', 'true')

  await run(page, 'nominal', 'Show nominal dollars') // Display
  await expect(page.getByRole('radio', { name: 'Nominal $' })).toHaveAttribute('aria-checked', 'true')

  // Scenario: clone, then switch back through the palette.
  await page.getByRole('button', { name: 'Base case actions' }).click()
  await page.getByRole('menuitem', { name: 'Clone' }).click()
  const tabs = page.getByRole('tablist', { name: 'Scenarios' })
  await expect(tabs.getByRole('tab', { name: 'Base case (copy)' })).toHaveAttribute('aria-selected', 'true')
  await run(page, 'switch', 'Switch to Base case')
  await expect(tabs.getByRole('tab', { name: 'Base case', exact: true })).toHaveAttribute('aria-selected', 'true')

  await run(page, 'undo', 'Undo') // Edit: undoes the clone
  await expect(tabs.getByRole('tab')).toHaveCount(1)

  await run(page, 'save', /^Save\b(?! as)/)
  expect(await readDisk(page, 'minimal.yaml')).toContain('schemaVersion: 3')
})
