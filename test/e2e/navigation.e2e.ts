import { expect, test } from '@playwright/test'
import { openPage } from './nav.ts'

// FR-UI-19 … FR-UI-23: section tabs with page menus, addressable pages (hash routes), back/forward and reload.

const sections = [
  'Home',
  'Past',
  'This Year',
  'Next Year',
  'Goals',
  'Building Years',
  'Retiring Years',
  'Setup',
  'Help',
]

test('every section opens from its tab, and its pages from its menu', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Sections' })
  for (const section of sections) {
    await openPage(page, section)
    await expect(nav.getByRole('link', { name: section, exact: true })).toHaveAttribute('aria-current', 'page')
  }
  await openPage(page, 'Retiring Years', 'Results')
  await expect(page).toHaveURL(/#\/retiring\/results$/)
  await openPage(page, 'Setup', 'File settings')
  await expect(page).toHaveURL(/#\/setup\/file$/)
  await expect(page.getByRole('heading', { name: 'File settings', level: 2 })).toBeVisible()
  await openPage(page, 'Help', 'About')
  await expect(page.getByRole('heading', { name: 'About ProvisionLens' })).toBeVisible()
})

test('back, forward and reload keep the page', async ({ page }) => {
  await page.goto('/')
  await openPage(page, 'Past')
  await openPage(page, 'Setup', 'File settings')
  await openPage(page, 'Goals')
  await expect(page.getByTestId('section-placeholder')).toContainText('Every goal on one timeline')

  await page.goBack()
  await expect(page).toHaveURL(/#\/setup\/file$/)
  await expect(page.getByRole('heading', { name: 'File settings', level: 2 })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/#\/past$/)
  await page.goForward()
  await expect(page).toHaveURL(/#\/setup\/file$/)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'File settings', level: 2 })).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Sections' })
  await expect(nav.getByRole('link', { name: 'Setup', exact: true })).toHaveAttribute('aria-current', 'page')
})

test('a page opens directly from its address, and the palette lists every page', async ({ page }) => {
  // The route's own search params survive a page query string (such as the test flag ?e2e).
  await page.goto('/?e2e#/past/balance-sheet?period=2026-01')
  await expect(page).toHaveURL(/#\/past\/balance-sheet\?period=2026-01$/)
  await page.goto('/#/help/about')
  await expect(page.getByRole('heading', { name: 'About ProvisionLens' })).toBeVisible()
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog', { name: 'Command palette' })
  await dialog.getByRole('combobox').fill('Building')
  await dialog.getByRole('option', { name: 'Building Years' }).click()
  await expect(page).toHaveURL(/#\/building$/)
})
