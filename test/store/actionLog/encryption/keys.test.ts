import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { genAcctCtgId } from '@/ledger/accountCategories/AcctCtgId.ts'
import { acctCtgIdAssets } from '@/ledger/accountCategories/AcctCtgRoot.ts'
import {
  changePassword,
  recoveryKeyToWords,
  replaceRecoveryKey,
  setUpEncryption,
  unlockWithPassword,
  unlockWithRecoveryKey,
  wordsToRecoveryKey,
} from '@/store/actionLog/encryption/keys.ts'
import { readContentVersion } from '@/store/actionLog/meta.ts'
import { openBunDriver, openBunDriverFromBytes } from '@/store/driver/bunSqlite.ts'
import {
  changeFilePassword,
  newRecoveryKey,
  turnEncryptionOff,
  turnEncryptionOn,
} from '@/store/ledger/encryptionSettings.ts'
import { createLedgerFile, openLedgerFile } from '@/store/ledger/ledgerFile.ts'
import { LedgerSession } from '@/store/ledger/session.ts'

// FR-STO-5, D: OQ-STO-3: the data key wrapped by the password and by a recovery key shown as words.

const raw = async (key: CryptoKey | null) =>
  key ? [...new Uint8Array(await crypto.subtle.exportKey('raw', key))] : null

describe('recovery key words', () => {
  test('32 bytes are 24 words and back', () => {
    const key = crypto.getRandomValues(new Uint8Array(32))
    const words = recoveryKeyToWords(key)
    expect(words).toHaveLength(24)
    expect(wordsToRecoveryKey(words.join(' '))).toEqual(key)
    expect(wordsToRecoveryKey(`  ${words.join('   ').toUpperCase()} `)).toEqual(key)
  })

  test('a wrong word, a missing word or a bad checksum is rejected', () => {
    const words = recoveryKeyToWords(new Uint8Array(32).fill(7))
    expect(wordsToRecoveryKey(words.slice(1).join(' '))).toBeNull()
    expect(wordsToRecoveryKey([...words.slice(0, 23), 'notaword'].join(' '))).toBeNull()
    const swapped = [...words]
    ;[swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!]
    expect(wordsToRecoveryKey(swapped.join(' '))).toBeNull()
  })
})

describe('wrapped keys', () => {
  test('the password and the recovery key unlock the same data key; wrong ones do not', async () => {
    const db = openBunDriver()
    db.exec('CREATE TABLE _checquery_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    const { key, words } = await setUpEncryption(db, 'correct horse')
    expect(await raw(await unlockWithPassword(db, 'correct horse'))).toEqual(await raw(key))
    expect(await raw(await unlockWithRecoveryKey(db, words.join(' ')))).toEqual(await raw(key))
    expect(await unlockWithPassword(db, 'wrong')).toBeNull()
    expect(await unlockWithRecoveryKey(db, recoveryKeyToWords(new Uint8Array(32)).join(' '))).toBeNull()
  })

  test('changing the password keeps the data key and the recovery key', async () => {
    const db = openBunDriver()
    db.exec('CREATE TABLE _checquery_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    const { key, words } = await setUpEncryption(db, 'old password')
    await changePassword(db, key, 'new password')
    expect(await unlockWithPassword(db, 'old password')).toBeNull()
    expect(await raw(await unlockWithPassword(db, 'new password'))).toEqual(await raw(key))
    expect(await raw(await unlockWithRecoveryKey(db, words.join(' ')))).toEqual(await raw(key))
  })

  test('a new recovery key replaces the old one', async () => {
    const db = openBunDriver()
    db.exec('CREATE TABLE _checquery_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    const { key, words } = await setUpEncryption(db, 'pw')
    const next = await replaceRecoveryKey(db, key)
    expect(await unlockWithRecoveryKey(db, words.join(' '))).toBeNull()
    expect(await raw(await unlockWithRecoveryKey(db, next.join(' ')))).toEqual(await raw(key))
  })

  test('a Checquery file keeps its key: a password change wraps it, and the payloads still decrypt', async () => {
    const dir = new URL('../../../fixtures/checquery/', import.meta.url).pathname
    const db = openBunDriverFromBytes(readFileSync(`${dir}small.checquery`))
    const key = await unlockWithPassword(db, 'spike-fixture-password')
    expect(key).not.toBeNull()
    await changePassword(db, key!, 'a new password')
    expect(await unlockWithPassword(db, 'spike-fixture-password')).toBeNull()
    const opened = await openLedgerFile(db, openBunDriver(), {
      password: 'a new password',
      deviceName: 'Laptop',
      allowMigration: true,
    })
    expect(await opened.store.svcs.transactions.countTransactionsAll()).toBeGreaterThan(50)
    const words = await replaceRecoveryKey(db, key!)
    expect(await raw(await unlockWithRecoveryKey(db, words.join(' ')))).toEqual(await raw(key))
  })
})

describe('encryption settings on an open file', () => {
  const category = () => {
    const id = genAcctCtgId()
    return { id, parentCtgId: acctCtgIdAssets, acctType: 'ASSET', name: `Bank ${id.slice(-8)}` }
  }

  async function setup(password: string | undefined) {
    const db = openBunDriver()
    const opened = await createLedgerFile(db, openBunDriver(), { password, deviceName: 'Laptop' })
    const session = new LedgerSession(opened.store, opened.origId, () => {})
    await session.command('accountCategories', 'createAccountCategory', category())
    return { db, opened, session }
  }

  const payloads = (db: ReturnType<typeof openBunDriver>) =>
    db.all<{ encrypted_payload: string }>('SELECT encrypted_payload FROM actions').map((r) => r.encrypted_payload)

  test('a new encrypted file comes with a recovery key that opens it', async () => {
    const { db, opened } = await setup('pw')
    expect(opened.recoveryWords).toHaveLength(24)
    const again = await openLedgerFile(openBunDriverFromBytes(db.exportBytes()), openBunDriver(), {
      password: undefined,
      recoveryWords: opened.recoveryWords!.join(' '),
      deviceName: 'Laptop',
      allowMigration: false,
    })
    expect(await again.store.svcs.accountCategories.countAccountCategoriesAll()).toBe(1)
  })

  test('turning encryption off rewrites every payload as plain JSON and removes the keys', async () => {
    const { db, opened, session } = await setup('pw')
    const before = readContentVersion(db)
    await session.exclusive(() => turnEncryptionOff(db, opened.store, opened.codec))
    expect(readContentVersion(db)).toBe(before + 1)
    expect(payloads(db).every((p) => p.startsWith('{'))).toBe(true)
    const again = await openLedgerFile(openBunDriverFromBytes(db.exportBytes()), openBunDriver(), {
      password: undefined,
      deviceName: 'Laptop',
      allowMigration: false,
    })
    expect(again.encrypted).toBe(false)
    expect(await again.store.svcs.accountCategories.countAccountCategoriesAll()).toBe(1)
    // New actions use the new codec.
    await session.command('accountCategories', 'createAccountCategory', category())
    expect(payloads(db).every((p) => p.startsWith('{'))).toBe(true)
  })

  test('turning encryption on encrypts every payload; the password and recovery key open it', async () => {
    const { db, opened, session } = await setup(undefined)
    const { words } = await session.exclusive(() => turnEncryptionOn(db, opened.store, opened.codec, 'pw'))
    expect(payloads(db).some((p) => p.startsWith('{'))).toBe(false)
    for (const opts of [{ password: 'pw' }, { password: undefined, recoveryWords: words.join(' ') }]) {
      const again = await openLedgerFile(openBunDriverFromBytes(db.exportBytes()), openBunDriver(), {
        ...opts,
        deviceName: 'Laptop',
        allowMigration: false,
      })
      expect(await again.store.svcs.accountCategories.countAccountCategoriesAll()).toBe(1)
    }
  })

  test('password change and recovery-key replacement through the session', async () => {
    const { db, opened, session } = await setup('pw')
    await session.exclusive(() => changeFilePassword(db, opened.codec, 'pw2'))
    const words = await session.exclusive(() => newRecoveryKey(db, opened.codec))
    const bytes = db.exportBytes()
    const open = (o: { password?: string; recoveryWords?: string }) =>
      openLedgerFile(openBunDriverFromBytes(bytes), openBunDriver(), {
        password: o.password,
        recoveryWords: o.recoveryWords,
        deviceName: 'Laptop',
        allowMigration: false,
      }).then(
        () => 'ok',
        (e) => e.code,
      )
    expect(await open({ password: 'pw' })).toBe('wrong-password')
    expect(await open({ password: 'pw2' })).toBe('ok')
    expect(await open({ recoveryWords: opened.recoveryWords!.join(' ') })).toBe('wrong-recovery-key')
    expect(await open({ recoveryWords: words.join(' ') })).toBe('ok')
  })
})
