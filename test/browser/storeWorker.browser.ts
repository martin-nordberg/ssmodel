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
    const bad = await client
      .command('accounts', 'createAccount', {
        id: 'x',
        parentCtgId: 'y',
        acctType: 'ASSET',
        name: '',
      })
      .catch((e) => e.code)
    const wrong = await client
      .request('open', {
        bytes: bytes.slice(),
        password: 'wrong',
        deviceName: 'Laptop',
        allowMigration: false,
        source: 'file',
      })
      .catch((e) => e.code)
    await client.request('open', {
      bytes,
      password: 'correct horse',
      deviceName: 'Laptop',
      allowMigration: false,
      source: 'file',
    })
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

// FR-STO-2, FR-STO-3: the working copy in OPFS survives a crashed worker and is offered when newer than the file.
test('a working copy left by a crash is detected and recovered', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const first = window.harness.newStore().client
    await first.request('create', { password: undefined, deviceName: 'Laptop' })
    const saved = await first.request('export', {})
    await first.command('accountCategories', 'createAccountCategory', {
      id: 'actgunsavedcategory000000001',
      parentCtgId: 'actgassets000000000000000000',
      acctType: 'ASSET',
      name: 'Unsaved',
    })
    first.terminate() // a crash: no close, nothing written back to the file

    const second = window.harness.newStore().client
    const info = await second.request('inspect', { bytes: saved.slice() })
    const offeredVersion = await second.request('workingCopyVersion', { fileId: info.fileId })
    await second.request('open', {
      bytes: saved.slice(),
      password: undefined,
      deviceName: 'Laptop',
      allowMigration: false,
      source: 'working-copy',
    })
    const recovered = await second.query(
      'accountCategories',
      'findAccountCategoryById',
      'actgunsavedcategory000000001' as never,
    )
    await second.request('close', { keepWorkingCopy: false })
    const afterClose = await second.request('workingCopyVersion', { fileId: info.fileId })

    // Choosing the file instead discards the working copy's changes.
    await second.request('open', {
      bytes: saved.slice(),
      password: undefined,
      deviceName: 'Laptop',
      allowMigration: false,
      source: 'file',
    })
    const fromFile = await second.query(
      'accountCategories',
      'findAccountCategoryById',
      'actgunsavedcategory000000001' as never,
    )
    return {
      offered: offeredVersion !== null && offeredVersion > info.contentVersion,
      recovered: recovered?.name,
      afterClose,
      fromFile,
    }
  })
  expect(result).toEqual({ offered: true, recovered: 'Unsaved', afterClose: null, fromFile: null })
})

// FR-STO-4: each file's working copy is exclusive to one tab; another tab can open a snapshot read-only and reload it.
test('working copies are per file and exclusive; a read-only snapshot follows by reloading', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const a = window.harness.newStore().client
    await a.request('create', { password: 'pw', deviceName: 'A' })
    const bytes = await a.request('export', {})
    const b = window.harness.newStore().client
    const other = await b.request('create', { password: undefined, deviceName: 'B' }).then(
      () => 'ok',
      (e) => e.code,
    )

    const c = window.harness.newStore().client
    const locked = await c
      .request('open', { bytes: bytes.slice(), password: 'pw', deviceName: 'C', allowMigration: false, source: 'file' })
      .catch((e) => e.code)
    const ro = await c.request('openReadOnly', { bytes: bytes.slice(), password: 'pw' })
    const refused = await c
      .command('accountCategories', 'createAccountCategory', {
        id: 'actgreadonlycategory00000001',
        parentCtgId: 'actgassets000000000000000000',
        acctType: 'ASSET',
        name: 'Nope',
      })
      .catch((e) => e.code)
    await a.command('accountCategories', 'createAccountCategory', {
      id: 'actgwritercategory0000000001',
      parentCtgId: 'actgassets000000000000000000',
      acctType: 'ASSET',
      name: 'From A',
    })
    const before = await c.query('accountCategories', 'countAccountCategoriesAll')
    await c.request('reload', { bytes: await a.request('export', {}) })
    const after = await c.query('accountCategories', 'countAccountCategoriesAll')
    return { other, locked, readOnly: ro.readOnly, origId: ro.origId, refused, before, after }
  })
  expect(result).toEqual({
    other: 'ok',
    locked: 'file-locked',
    readOnly: true,
    origId: null,
    refused: 'read-only',
    before: 0,
    after: 1,
  })
})
