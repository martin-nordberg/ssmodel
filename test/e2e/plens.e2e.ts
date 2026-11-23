import { expect, test } from '@playwright/test'
import { installFsaMock, readDiskBytes } from './fsaMock.ts'
import { category, createFile, plensMenu, store } from './plensHelpers.ts'

// NFR-TEST-14 (storage): autosave and reopen, crash recovery from the working copy, and a second tab refused by the
// lock [FR-STO-1 … FR-STO-4].
// Until the ledger pages exist (P2), edits go through the store worker (`?e2e` exposes its client).

test('autosave and reopen', async ({ page, browser }) => {
  await installFsaMock(page)
  await page.goto('/?e2e&autosaveMs=300')
  await createFile(page, 'correct horse')
  const created = await readDiskBytes(page, 'Household.plens')
  expect(created?.slice(0, 15)).toEqual([...'SQLite format 3'].map((c) => c.charCodeAt(0)))

  await store(page, 'command', 'accountCategories', 'createAccountCategory', category)
  // Written back after the pause, without any save command.
  await expect.poll(async () => (await readDiskBytes(page, 'Household.plens'))?.join()).not.toBe(created?.join())
  await expect(page.getByTestId('status-plens')).toHaveText('Household.plens • Saved')
  const saved = await readDiskBytes(page, 'Household.plens')

  // A fresh browser profile: only the file itself.
  const context = await browser.newContext()
  const page2 = await context.newPage()
  await installFsaMock(page2, { 'Household.plens': saved ?? [] })
  await page2.goto('/?e2e')
  // Another browser profile is another device, and the file says it's open on the first one [FR-STO-4].
  await plensMenu(page2, 'Open ProvisionLens file…')
  await expect(page2.getByText('Household.plens may be open on another device')).toBeVisible()
  await page2.getByRole('button', { name: 'Cancel' }).click()
  await expect(page2.getByTestId('status-plens')).toHaveCount(0)
  await plensMenu(page2, 'Open ProvisionLens file…')
  await page2.getByRole('button', { name: 'Open anyway' }).click()
  await page2.getByLabel('Password').fill('wrong')
  await page2.getByRole('button', { name: 'Open' }).click()
  await expect(page2.getByText('That password is not right. Try again.')).toBeVisible()
  await page2.getByLabel('Password').fill('correct horse')
  await page2.getByRole('button', { name: 'Open' }).click()
  await expect(page2.getByTestId('status-plens')).toHaveText('Household.plens • Saved')
  expect(await store(page2, 'query', 'accountCategories', 'findAccountCategoryById', category.id)).toMatchObject({
    name: 'Bank',
  })
  await context.close()
})

test('crash recovery from the working copy', async ({ page, context }) => {
  await installFsaMock(page)
  await page.goto('/?e2e&autosaveMs=600000')
  await createFile(page, undefined)
  await store(page, 'command', 'accountCategories', 'createAccountCategory', category)
  await expect(page.getByTestId('status-plens')).toHaveText('Household.plens • Unsaved changes • not encrypted')
  const stale = await readDiskBytes(page, 'Household.plens')
  await page.close({ runBeforeUnload: false }) // the app dies before autosave

  const page2 = await context.newPage()
  await installFsaMock(page2, { 'Household.plens': stale ?? [] })
  await page2.goto('/?e2e')
  await plensMenu(page2, 'Open ProvisionLens file…')
  await expect(page2.getByText('Recover unsaved changes?')).toBeVisible()
  await page2.getByRole('button', { name: 'Recover changes' }).click()
  await expect(page2.getByTestId('status-plens')).toHaveText('Household.plens • Saved • not encrypted')
  expect(await store(page2, 'query', 'accountCategories', 'findAccountCategoryById', category.id)).toMatchObject({
    name: 'Bank',
  })
  // The recovered version is written back to the file at once.
  expect((await readDiskBytes(page2, 'Household.plens'))?.join()).not.toBe(stale?.join())
})

test('discarding the working copy opens the file as saved', async ({ page, context }) => {
  await installFsaMock(page)
  await page.goto('/?e2e&autosaveMs=600000')
  await createFile(page, undefined)
  await store(page, 'command', 'accountCategories', 'createAccountCategory', category)
  const stale = await readDiskBytes(page, 'Household.plens')
  await page.close({ runBeforeUnload: false })

  const page2 = await context.newPage()
  await installFsaMock(page2, { 'Household.plens': stale ?? [] })
  await page2.goto('/?e2e')
  await plensMenu(page2, 'Open ProvisionLens file…')
  await page2.getByRole('button', { name: 'Discard them and open the file' }).click()
  await expect(page2.getByTestId('status-plens')).toHaveText('Household.plens • Saved • not encrypted')
  expect(await store(page2, 'query', 'accountCategories', 'findAccountCategoryById', category.id)).toBeNull()
})

test('a second tab is read-only and shows an edit made in the first within a second', async ({ page, context }) => {
  await installFsaMock(page)
  await page.goto('/?e2e&autosaveMs=300')
  await createFile(page, 'correct horse')
  const bytes = await readDiskBytes(page, 'Household.plens')

  const page2 = await context.newPage()
  await installFsaMock(page2, { 'Household.plens': bytes ?? [] })
  await page2.goto('/?e2e')
  await plensMenu(page2, 'Open ProvisionLens file…')
  await page2.getByLabel('Password').fill('correct horse')
  await page2.getByRole('button', { name: 'Open' }).click()
  await expect(page2.getByTestId('status-plens')).toHaveText(
    'Household.plens • Read-only: open for editing in another window',
  )

  await store(page, 'command', 'accountCategories', 'createAccountCategory', category)
  await expect
    .poll(() => store(page2, 'query', 'accountCategories', 'findAccountCategoryById', category.id), { timeout: 1000 })
    .toMatchObject({ name: 'Bank' })

  const refused = await page2.evaluate(
    (c) =>
      (window as unknown as { provisionlensStore: { command(...a: unknown[]): Promise<unknown> } }).provisionlensStore
        .command('accountCategories', 'createAccountCategory', { ...c, id: 'actge2ecategory0000000000002' })
        .catch((e: { code: string }) => e.code),
    category,
  )
  expect(refused).toBe('read-only')
})
