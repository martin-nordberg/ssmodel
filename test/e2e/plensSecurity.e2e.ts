import { expect, test } from '@playwright/test'
import { installFsaMock, readDiskBytes, readFolder, setPickers } from './fsaMock.ts'
import { category, createFile, openFile, plensMenu, store } from './plensHelpers.ts'

// NFR-TEST-14 (storage): the recovery key [FR-STO-5] and backup-folder writes [FR-STO-6]. (The wrong password is in
// plens.e2e.ts.)

test('the recovery key opens the file, and then a new password is set', async ({ page }) => {
  await installFsaMock(page)
  await page.goto('/?e2e&autosaveMs=300')
  const words = await createFile(page, 'correct horse')
  expect(new Set(words).size).toBeGreaterThan(12)
  await store(page, 'command', 'accountCategories', 'createAccountCategory', category)
  await plensMenu(page, 'Close ProvisionLens file')
  await expect(page.getByTestId('status-plens')).toHaveCount(0)

  // The password is forgotten.
  await openFile(page)
  await page.getByRole('button', { name: 'Forgot the password? Use the recovery key' }).click()
  await page.getByLabel('Recovery key').fill([...words.slice(0, 23), 'abandon'].join(' '))
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(page.getByText("Those words aren't this file's recovery key.")).toBeVisible()
  await page.getByRole('button', { name: 'Forgot the password? Use the recovery key' }).click()
  await page.getByLabel('Recovery key').fill(words.join('\n'))
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible()
  await page.getByLabel('New password', { exact: true }).fill('battery staple')
  await page.getByLabel('Confirm new password').fill('battery staple')
  await page.getByRole('button', { name: 'Set password' }).click()
  await expect(page.getByTestId('status-plens')).toHaveText('Household.plens • Saved')
  await plensMenu(page, 'Close ProvisionLens file')

  // The old password no longer works; the new one and the recovery key both do.
  await openFile(page, 'correct horse')
  await expect(page.getByText('That password is not right. Try again.')).toBeVisible()
  await page.getByLabel('Password').fill('battery staple')
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(page.getByTestId('status-plens')).toHaveText('Household.plens • Saved')
  expect(await store(page, 'query', 'accountCategories', 'findAccountCategoryById', category.id)).toMatchObject({
    name: 'Bank',
  })
})

test('backups: a dated copy a day in the backup folder, and one per close in the browser', async ({ page }) => {
  await installFsaMock(page)
  await page.goto('/?e2e&autosaveMs=300')
  await createFile(page, undefined)
  await setPickers(page, {})
  await plensMenu(page, 'File settings…')
  await page.getByRole('button', { name: 'Choose backup folder…' }).click()
  await expect(page.getByTestId('settings-backup-folder')).toContainText('“Backups”')
  await page.keyboard.press('Escape')

  await store(page, 'command', 'accountCategories', 'createAccountCategory', category)
  await plensMenu(page, 'Close ProvisionLens file')
  await expect
    .poll(() => readFolder(page, 'Backups'))
    .toEqual([expect.stringMatching(/^Household \d{4}-\d{2}-\d{2}\.plens$/)])

  // A second close the same day adds a browser backup but no second folder copy.
  await openFile(page)
  await expect(page.getByTestId('status-plens')).toHaveText('Household.plens • Saved • not encrypted')
  await plensMenu(page, 'Close ProvisionLens file')
  await expect(page.getByTestId('status-plens')).toHaveCount(0)
  expect(await readFolder(page, 'Backups')).toHaveLength(1)

  await openFile(page)
  await plensMenu(page, 'File settings…')
  await expect(page.getByTestId('settings-backups').locator('li')).toHaveCount(2)
  // A backup can be saved out as a file of its own.
  await setPickers(page, { save: 'Restored.plens' })
  await page.getByTestId('settings-backups').getByRole('button', { name: 'Save a copy…' }).first().click()
  await expect.poll(async () => (await readDiskBytes(page, 'Restored.plens'))?.length ?? 0).toBeGreaterThan(1000)
})

test('encryption can be turned off with a warning, and on again with a new recovery key', async ({ page, browser }) => {
  await installFsaMock(page)
  await page.goto('/?e2e&autosaveMs=300')
  await createFile(page, 'correct horse')
  await plensMenu(page, 'File settings…')
  await expect(page.getByTestId('settings-encryption')).toHaveText('Encrypted with a password, with a recovery key.')
  await page.getByRole('button', { name: 'Turn off encryption…' }).click()
  await expect(page.getByText('Anyone who gets the file, or a backup of it, will be able to read')).toBeVisible()
  await page.getByRole('button', { name: 'Turn off encryption' }).click()
  await expect(page.getByTestId('status-plens')).toHaveText('Household.plens • Saved • not encrypted')

  // The saved file now opens without a password.
  const plain = await readDiskBytes(page, 'Household.plens')
  const context = await browser.newContext()
  const page2 = await context.newPage()
  await installFsaMock(page2, { 'Household.plens': plain ?? [] })
  await page2.goto('/?e2e')
  await plensMenu(page2, 'Open ProvisionLens file…')
  await page2.getByRole('button', { name: 'Open anyway' }).click()
  await expect(page2.getByTestId('status-plens')).toHaveText('Household.plens • Saved • not encrypted')
  await context.close()

  // The settings dialog comes back after each of its own dialogs.
  await expect(page.getByTestId('settings-encryption')).toHaveText('Not encrypted: anyone with the file can read it.')
  await page.getByRole('button', { name: 'Turn on encryption…' }).click()
  await page.getByLabel('New password', { exact: true }).fill('battery staple')
  await page.getByLabel('Confirm new password').fill('battery staple')
  await page.getByRole('button', { name: 'Set password' }).click()
  await expect(page.getByTestId('recovery-words').locator('li')).toHaveCount(24)
  await page.getByLabel('I have saved the recovery key').check()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByTestId('settings-encryption')).toHaveText('Encrypted with a password, with a recovery key.')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('status-plens')).toHaveText('Household.plens • Saved')
})
