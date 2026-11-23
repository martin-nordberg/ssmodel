import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { genOrigId } from '@/ledger/origins/OrigId.ts'
import { ActionLog } from '@/store/actionLog/ActionLog.ts'
import { AesGcmCodec } from '@/store/actionLog/encryption/AesGcmCodec.ts'
import { type FileCryptoMaterial, verifyPassword } from '@/store/actionLog/encryption/crypto.ts'
import { getMetaValue } from '@/store/actionLog/meta.ts'
import { latestKnownVersion, readSchemaVersion, runMigrations } from '@/store/actionLog/migrations/runMigrations.ts'
import { openBunDriverFromBytes } from '@/store/driver/bunSqlite.ts'
import type { DbDriver } from '@/store/driver/DbDriver.ts'
import { collect } from './inMemory.ts'

// FR-STO-5, NFR-TEST-19: an encrypted file written by Checquery's own code opens, decrypts and appends here.

const dir = new URL('../../fixtures/checquery/', import.meta.url).pathname
const reference = JSON.parse(readFileSync(`${dir}small.reference.json`, 'utf8')) as {
  password: string
  actions: number
  plaintexts: Record<string, string>
}
const openFixture = () => openBunDriverFromBytes(readFileSync(`${dir}small.checquery`))

function material(db: DbDriver): FileCryptoMaterial {
  const get = (key: string) => getMetaValue(db, key) ?? ''
  return {
    kdfSalt: get('kdf_salt'),
    kdfParams: JSON.parse(get('kdf_params')),
    verifyIv: get('verify_iv'),
    verifyCiphertext: get('verify_ciphertext'),
  }
}

async function openLog(db: DbDriver): Promise<ActionLog> {
  const key = await verifyPassword(reference.password, material(db))
  if (!key) throw new Error('password rejected')
  return new ActionLog(db, new AesGcmCodec(key), getMetaValue(db, 'node_id') ?? '')
}

describe('a Checquery-written file', () => {
  test('is at a schema version this build knows, so migrations are a no-op', () => {
    const db = openFixture()
    expect(readSchemaVersion(db)).toBeLessThanOrEqual(latestKnownVersion)
    runMigrations(db)
    expect(readSchemaVersion(db)).toBe(latestKnownVersion)
  })

  test('accepts its password and rejects a wrong one', async () => {
    const db = openFixture()
    expect(await verifyPassword(reference.password, material(db))).not.toBeNull()
    expect(await verifyPassword('wrong password', material(db))).toBeNull()
  })

  test("decrypts every action exactly as Checquery's node:crypto code does", async () => {
    const db = openFixture()
    const actions = await collect((await openLog(db)).readActions())
    expect(actions).toHaveLength(reference.actions)
    for (const action of actions) expect(action.payload).toEqual(JSON.parse(reference.plaintexts[action.id] ?? 'null'))
    expect(actions[0]?.actionType).toBe('create-origin')
  })

  test('takes new actions after the existing ones, and keeps them through export and reopen', async () => {
    const db = openFixture()
    const log = await openLog(db)
    const appended = await log.appendAction('create-origin', { id: genOrigId(), name: 'Laptop' })
    const [lastBefore] = (await collect(log.readActions())).slice(-2)
    expect((appended as { hlc?: string }).hlc! > lastBefore!.hlc).toBe(true)

    const reopened = openBunDriverFromBytes(db.exportBytes())
    const actions = await collect((await openLog(reopened)).readActions())
    expect(actions).toHaveLength(reference.actions + 1)
    expect(actions.at(-1)?.payload).toEqual(appended)
  })
})
