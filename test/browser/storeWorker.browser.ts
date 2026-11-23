import { expect, test } from '@playwright/test'

// NFR-ARCH-8: the app's store worker, driven through StoreClient and the typed protocol.

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#status')).toHaveText('ready')
})

test('creates an account through the protocol and sees the change notification', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { client, notifications } = window.harness.newStore()
    const opened = await client.request('create', { password: 'correct horse', deviceName: 'Laptop' })
    const ctgId = 'actgharnesscategory000000001'
    const acctId = 'acctharnessaccount0000000001'
    await client.command('accountCategories', 'createAccountCategory', {
      id: ctgId,
      parentCtgId: 'actgassets000000000000000000',
      acctType: 'ASSET',
      name: 'Bank',
    })
    await client.command('accounts', 'createAccount', {
      id: acctId,
      parentCtgId: ctgId,
      acctType: 'ASSET',
      name: 'Checking',
    })
    const accounts = await client.query('accounts', 'findAccountsAll')
    return { opened, notifications, accounts: accounts.map((a) => ({ id: a.id, name: a.name, origId: a.origId })) }
  })
  expect(result.notifications).toEqual([
    { kind: 'session', state: 'open', fileId: result.opened.fileId },
    {
      kind: 'change',
      seq: 1,
      changes: [{ entity: 'accountCategories', op: 'create', id: 'actgharnesscategory000000001' }],
    },
    { kind: 'change', seq: 2, changes: [{ entity: 'accounts', op: 'create', id: 'acctharnessaccount0000000001' }] },
  ])
  expect(result.accounts).toContainEqual({
    id: 'acctharnessaccount0000000001',
    name: 'Checking',
    origId: result.opened.origId,
  })
})

test('exported bytes reopen with the password, and errors carry codes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { client } = window.harness.newStore()
    const noFile = await client.query('accounts', 'countAccountsAll').catch((e) => e.code)
    await client.request('create', { password: 'correct horse', deviceName: 'Laptop' })
    const bytes = await client.request('export', {})
    const info = await client.request('inspect', { bytes: bytes.slice() })
    const wrong = await client
      .request('open', { bytes: bytes.slice(), password: 'wrong', deviceName: 'Laptop', allowMigration: false })
      .catch((e) => e.code)
    const bad = await client
      .command('accounts', 'createAccount', {
        id: 'x',
        parentCtgId: 'y',
        acctType: 'ASSET',
        name: '',
      })
      .catch((e) => e.code)
    await client.request('open', { bytes, password: 'correct horse', deviceName: 'Laptop', allowMigration: false })
    const count = await client.query('accounts', 'countAccountsAll')
    return { noFile, info, wrong, bad, count }
  })
  expect(result).toMatchObject({
    noFile: 'no-file-open',
    info: { encrypted: true, needsMigration: false },
    wrong: 'wrong-password',
    bad: 'invalid-request',
    count: 1,
  })
})
