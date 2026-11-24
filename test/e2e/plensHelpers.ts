import { expect, type Page } from '@playwright/test'
import { setPickers } from './fsaMock.ts'

// Shared steps for the .plens e2e tests.

export const category = {
  id: 'actge2ecategory0000000000001',
  parentCtgId: 'actgassets000000000000000000',
  acctType: 'ASSET',
  name: 'Bank',
}

export async function plensMenu(page: Page, item: string) {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

/** Creates Household.plens; with a password, confirms the recovery key and returns its words. */
export async function createFile(page: Page, password: string | undefined): Promise<string[]> {
  await setPickers(page, { save: 'Household.plens' })
  await plensMenu(page, 'New ProvisionLens file…')
  if (password === undefined) {
    await page.getByRole('button', { name: 'Create without encryption…' }).click()
  } else {
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm password').fill(password)
  }
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  let words: string[] = []
  if (password !== undefined) {
    // The recovery key is shown once, and can't be dismissed until the user says it's saved [FR-STO-5].
    const list = page.getByTestId('recovery-words')
    await expect(list.locator('li')).toHaveCount(24)
    words = (await list.locator('li').allTextContents()).map((t) => t.replace(/^\d+\.\s*/, '').trim())
    await expect(page.getByRole('button', { name: 'Done' })).toBeDisabled()
    await page.getByLabel('I have saved the recovery key').check()
    await page.getByRole('button', { name: 'Done' }).click()
  }
  await expect(page.getByTestId('status-plens')).toHaveText(
    `Household.plens • Saved${password === undefined ? ' • not encrypted' : ''}`,
  )
  return words
}

/** Opens Household.plens from the File menu, answering the password prompt if `password` is given. */
export async function openFile(page: Page, password?: string): Promise<void> {
  await setPickers(page, { open: 'Household.plens' })
  await plensMenu(page, 'Open ProvisionLens file…')
  if (password !== undefined) {
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Open' }).click()
  }
}

/** Runs a store command or query in the page. */
export function store<T>(page: Page, fn: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([f, a]) => {
      const client = (window as unknown as { provisionlensStore: Record<string, (...x: unknown[]) => unknown> })
        .provisionlensStore
      return client[f as string]!(...(a as unknown[])) as Promise<T>
    },
    [fn, args] as const,
  )
}
