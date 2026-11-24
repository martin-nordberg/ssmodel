import { expect, type Page, test } from '@playwright/test'
import { installFsaMock } from './fsaMock.ts'
import { openPage } from './nav.ts'
import { createFile } from './plensHelpers.ts'
import { untippedLabels } from './tipsCheck.ts'

// FR-LED-1, FR-LED-3, D: OQ-UI-12: Setup › Accounts and categories, and Vendors.

const tree = (page: Page) => page.getByRole('list', { name: /accounts and categories$/ })
const item = (page: Page, name: string) => tree(page).getByRole('listitem', { name, exact: true })

async function addCategory(page: Page, name: string, under?: string) {
  if (under) await page.getByRole('button', { name: `Add category to ${under}` }).click()
  else await page.getByRole('button', { name: 'New category' }).click()
  await page.getByLabel('New category').fill(name)
  await page.getByLabel('New category').press('Enter')
  await expect(item(page, name)).toBeVisible()
}

async function addAccount(page: Page, name: string, under: string) {
  await page.getByRole('button', { name: `Add account to ${under}` }).click()
  await page.getByLabel('New account').fill(name)
  await page.getByLabel('New account').press('Enter')
  await expect(item(page, name)).toBeVisible()
}

async function select(page: Page, name: string) {
  await item(page, name).getByRole('button', { name, exact: true }).click()
}

test('create, rename, move and delete categories and accounts', async ({ page }) => {
  await installFsaMock(page)
  await page.goto('/')
  await createFile(page, undefined)
  await openPage(page, 'Setup', 'Accounts and categories')

  await addCategory(page, 'Bank')
  await addAccount(page, 'Checking', 'Bank')
  await addCategory(page, 'Credit unions')
  await addAccount(page, 'Savings', 'Credit unions')

  // Names are unique within a parent.
  await addAccount(page, 'Spare', 'Bank')
  await page.getByRole('button', { name: 'Add account to Bank' }).click()
  await page.getByLabel('New account').fill('checking')
  await page.getByLabel('New account').press('Enter')
  await expect(page.getByText('There is already an account or category named “checking” here.')).toBeVisible()
  await page.getByLabel('New account').press('Escape')

  // Rename.
  await select(page, 'Checking')
  await page.getByLabel('Name', { exact: true }).fill('Everyday checking')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(item(page, 'Everyday checking')).toBeVisible()
  await expect(item(page, 'Checking')).toHaveCount(0)

  // Every input on the page has a tooltip [FR-UI-37].
  expect(await untippedLabels(page)).toEqual([])

  // Mark primary.
  await page.getByLabel('Primary account').check()
  await expect(item(page, 'Everyday checking').getByLabel('Primary')).toBeVisible()

  // Move an account to another category.
  await select(page, 'Savings')
  await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Bank' })
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(item(page, 'Bank').getByRole('listitem', { name: 'Savings' })).toBeVisible()

  // Move a category inside another; it can't go inside itself.
  await select(page, 'Credit unions')
  await expect(
    page.getByLabel('Category', { exact: true }).locator('option', { hasText: /^Credit unions$/ }),
  ).toHaveCount(0)
  await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Bank' })
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(item(page, 'Bank').getByRole('listitem', { name: 'Credit unions' })).toBeVisible()

  // A category with children can't be deleted; an empty one can.
  await select(page, 'Bank')
  await page.getByRole('button', { name: 'Delete…' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByText('This category still has accounts or categories in it.')).toBeVisible()
  await select(page, 'Credit unions')
  await page.getByRole('button', { name: 'Delete…' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(item(page, 'Credit unions')).toHaveCount(0)

  // An unused account can be deleted.
  await select(page, 'Spare')
  await page.getByRole('button', { name: 'Delete…' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(item(page, 'Spare')).toHaveCount(0)

  // Each type has its own tree; the address keeps the type.
  await page.getByRole('navigation', { name: 'Account type' }).getByRole('link', { name: 'Expenses' }).click()
  await expect(page).toHaveURL(/type=EXPENSE/)
  await expect(item(page, 'Bank')).toHaveCount(0)
  await addCategory(page, 'Household')
  await addAccount(page, 'Groceries', 'Household')
  await page.reload()
  await expect(page).toHaveURL(/type=EXPENSE/)
})

test('create, rename and delete vendors with default accounts', async ({ page }) => {
  await installFsaMock(page)
  await page.goto('/')
  await createFile(page, undefined)
  await openPage(page, 'Setup', 'Accounts and categories')
  await page.getByRole('navigation', { name: 'Account type' }).getByRole('link', { name: 'Expenses' }).click()
  await addCategory(page, 'Household')
  await addAccount(page, 'Groceries', 'Household')

  await openPage(page, 'Setup', 'Vendors')
  await page.getByLabel('New vendor').fill('Corner Grocer')
  await page.getByLabel('Default account').selectOption({ label: 'Expenses : Household : Groceries' })
  await page.getByRole('button', { name: 'Add vendor' }).click()
  const row = page.getByRole('row', { name: /Corner Grocer/ })
  await expect(row).toContainText('Expenses : Household : Groceries')
  await expect(row).toContainText('Active')

  await row.getByRole('button', { name: 'Corner Grocer' }).click()
  const details = page.getByRole('form', { name: 'Vendor details' })
  await details.getByLabel('Name').fill('Corner Market')
  await details.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('row', { name: /Corner Market/ })).toBeVisible()
  await details.getByLabel('Active').uncheck()
  await expect(page.getByRole('row', { name: /Corner Market/ })).toContainText('Inactive')

  expect(await untippedLabels(page)).toEqual([])
  await details.getByRole('button', { name: 'Delete…' }).click()
  await details.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('row', { name: /Corner Market/ })).toHaveCount(0)
})
