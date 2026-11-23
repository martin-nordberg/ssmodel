import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { acctIdNetWorth } from '@/ledger/accounts/NetWorthAccount.ts'
import { setMetaValue } from '@/store/actionLog/meta.ts'
import { openBunDriver, openBunDriverFromBytes } from '@/store/driver/bunSqlite.ts'
import {
  createLedgerFile,
  inspectLedgerFile,
  type LedgerFileErrorCode,
  openLedgerFile,
} from '@/store/ledger/ledgerFile.ts'

// FR-STO-5, FR-STO-7, FR-LED-4: creating and opening ledger files, without a file system.

const fixture = new URL('../../fixtures/checquery/', import.meta.url).pathname
const fixturePassword = 'spike-fixture-password'

async function code(p: Promise<unknown>): Promise<LedgerFileErrorCode | undefined> {
  try {
    await p
  } catch (err) {
    return (err as { code?: LedgerFileErrorCode }).code
  }
  return undefined
}

async function newFile(password: string | undefined) {
  const db = openBunDriver()
  const opened = await createLedgerFile(db, openBunDriver(), { password, deviceName: 'Laptop' })
  return { bytes: db.exportBytes(), opened }
}

const reopen = (bytes: Uint8Array, password: string | undefined, deviceName = 'Laptop', allowMigration = false) =>
  openLedgerFile(openBunDriverFromBytes(bytes), openBunDriver(), { password, deviceName, allowMigration })

describe('createLedgerFile', () => {
  test('makes an encrypted file at the latest version with Net Worth and a device origin', async () => {
    const { bytes, opened } = await newFile('correct horse')
    expect(opened.encrypted).toBe(true)
    const info = inspectLedgerFile(openBunDriverFromBytes(bytes))
    expect(info).toMatchObject({ fileId: opened.fileId, encrypted: true, needsMigration: false })
    expect((await opened.store.svcs.accounts.findAccountById(acctIdNetWorth))?.acctType).toBe('EQUITY')
    expect(await opened.store.svcs.origins.findOriginsAll()).toEqual([{ id: opened.origId, name: 'Laptop' } as never])
  })

  test('makes an unencrypted file when there is no password', async () => {
    const { bytes, opened } = await newFile(undefined)
    expect(opened.encrypted).toBe(false)
    expect(inspectLedgerFile(openBunDriverFromBytes(bytes)).encrypted).toBe(false)
    const raw = openBunDriverFromBytes(bytes).all<{ encrypted_payload: string }>(
      'SELECT encrypted_payload FROM actions',
    )
    expect(raw.some((r) => r.encrypted_payload.includes('"Net Worth"'))).toBe(true)
  })

  test('refuses an empty password', async () => {
    expect(await code(newFile(''))).toBe('password-required')
  })
})

describe('openLedgerFile', () => {
  test('reopens with the right password, keeps the data, and reuses the device origin', async () => {
    const { bytes, opened } = await newFile('correct horse')
    const again = await reopen(bytes, 'correct horse')
    expect(again.fileId).toBe(opened.fileId)
    expect(again.origId).toBe(opened.origId)
    expect(await again.store.svcs.accounts.countAccountsAll()).toBe(1)
  })

  test('adds an origin for another device name', async () => {
    const { bytes, opened } = await newFile('correct horse')
    const again = await reopen(bytes, 'correct horse', 'Desktop')
    expect(again.origId).not.toBe(opened.origId)
    expect(await again.store.svcs.origins.countOriginsAll()).toBe(2)
  })

  test('rejects a wrong or missing password', async () => {
    const { bytes } = await newFile('correct horse')
    expect(await code(reopen(bytes, 'wrong'))).toBe('wrong-password')
    expect(await code(reopen(bytes, undefined))).toBe('wrong-password')
  })

  test('opens an unencrypted file with no password', async () => {
    const { bytes } = await newFile(undefined)
    expect((await reopen(bytes, undefined)).encrypted).toBe(false)
  })

  test('refuses a file from a newer version', async () => {
    const db = openBunDriver()
    await createLedgerFile(db, openBunDriver(), { password: undefined, deviceName: 'Laptop' })
    setMetaValue(db, 'schema_version', '99')
    expect(await code(reopen(db.exportBytes(), undefined))).toBe('unsupported-version')
  })

  test('refuses something that is not a ledger file', async () => {
    const db = openBunDriver()
    db.exec('CREATE TABLE notes (t TEXT)')
    expect(await code(reopen(db.exportBytes(), undefined))).toBe('not-a-ledger-file')
  })

  test('migrates a Checquery file only when allowed', async () => {
    const bytes = readFileSync(`${fixture}small.checquery`)
    expect(inspectLedgerFile(openBunDriverFromBytes(bytes)).needsMigration).toBe(true)
    expect(await code(reopen(bytes, fixturePassword))).toBe('migration-required')
    const opened = await reopen(bytes, fixturePassword, 'Laptop', true)
    expect(await opened.store.svcs.transactions.countTransactionsAll()).toBeGreaterThan(50)
  })
})
