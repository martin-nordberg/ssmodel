import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { installFsaMock, readDisk } from './fsaMock.ts'

const minimal = readFileSync(new URL('../fixtures/minimal.yaml', import.meta.url), 'utf8')

test('clone, rename and delete scenario tabs', async ({ page }) => {
  await installFsaMock(page, { 'minimal.yaml': minimal })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open…' }).click()
  const tabs = page.getByRole('tablist', { name: 'Scenarios' })
  await expect(tabs.getByRole('tab')).toHaveCount(1)
  await page.getByRole('button', { name: 'Base case actions' }).click()
  await page.getByRole('menuitem', { name: 'Clone' }).click()
  await expect(tabs.getByRole('tab', { name: 'Base case (copy)' })).toHaveAttribute('aria-selected', 'true')
  await tabs.getByRole('tab', { name: 'Base case (copy)' }).dblclick()
  await page.getByLabel('Scenario name').fill('Retire later')
  await page.getByLabel('Scenario name').press('Enter')
  await expect(tabs.getByRole('tab', { name: 'Retire later' })).toBeVisible()
  await page.keyboard.press('Control+s')
  const saved = (await readDisk(page, 'minimal.yaml')) ?? ''
  expect(saved).toContain('name: Retire later')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Retire later actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await expect(tabs.getByRole('tab')).toHaveCount(1)
})
