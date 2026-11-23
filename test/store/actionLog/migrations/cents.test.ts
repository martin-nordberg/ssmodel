import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { ActionLog } from '@/store/actionLog/ActionLog.ts'
import { AesGcmCodec } from '@/store/actionLog/encryption/AesGcmCodec.ts'
import { type FileCryptoMaterial, verifyPassword } from '@/store/actionLog/encryption/crypto.ts'
import { getMetaValue } from '@/store/actionLog/meta.ts'
import { centsPayload, legacyAmountToCents } from '@/store/actionLog/migrations/0004_cents.ts'
import { readSchemaVersion, runAllMigrations } from '@/store/actionLog/migrations/runMigrations.ts'
import { openBunDriverFromBytes } from '@/store/driver/bunSqlite.ts'
import type { DbDriver } from '@/store/driver/DbDriver.ts'
import { collect } from '../inMemory.ts'

// D: OQ-LED-2, NFR-ARCH-12: migration 0004 rewrites Checquery's `$#,###.##` amounts to integer cents.

describe('legacyAmountToCents', () => {
  test('parses positive, grouped, negative and zero amounts', () => {
    expect(legacyAmountToCents('$0.01', 'x')).toBe(1)
    expect(legacyAmountToCents('$1,234,567.89', 'x')).toBe(123456789)
    expect(legacyAmountToCents('($50.00)', 'x')).toBe(-5000)
    expect(Object.is(legacyAmountToCents('($0.00)', 'x'), 0)).toBe(true)
  })

  test('passes through amounts already in cents', () => {
    expect(legacyAmountToCents(4200, 'x')).toBe(4200)
  })

  test('rejects anything else, naming where it was', () => {
    for (const bad of ['100.00', '$100', '$100.000', '$1,23.00', 1.5, null, undefined]) {
      expect(() => legacyAmountToCents(bad, 'Action a1')).toThrow(/Action a1/)
    }
  })
})

describe('centsPayload', () => {
  test('rewrites entries and balances, and leaves other actions alone', () => {
    const entries = [
      { acctId: 'a', debit: '$12.34', credit: '$0.00' },
      { acctId: 'b', debit: '$0.00', credit: '$12.34' },
    ]
    expect(centsPayload('create-transaction', { id: 't', entries }, 'x')).toEqual({
      id: 't',
      entries: [
        { acctId: 'a', debit: 1234, credit: 0 },
        { acctId: 'b', debit: 0, credit: 1234 },
      ],
    })
    expect(centsPayload('update-transaction', { id: 't', description: 'no entries' }, 'x')).toBeNull()
    expect(centsPayload('create-balance-assertion', { id: 'b', balance: '($1.00)' }, 'x')).toEqual({
      id: 'b',
      balance: -100,
    })
    expect(centsPayload('update-balance-assertion', { id: 'b', assertionDate: '2026-01-01' }, 'x')).toBeNull()
    expect(centsPayload('create-account', { id: 'a', name: '$1.00' }, 'x')).toBeNull()
  })
})

const dir = new URL('../../../fixtures/checquery/', import.meta.url).pathname
const reference = JSON.parse(readFileSync(`${dir}small.reference.json`, 'utf8')) as {
  password: string
  plaintexts: Record<string, string>
}

async function openFixture(): Promise<{ db: DbDriver; codec: AesGcmCodec; nodeId: string }> {
  const db = openBunDriverFromBytes(readFileSync(`${dir}small.checquery`))
  const get = (key: string) => getMetaValue(db, key) ?? ''
  const material: FileCryptoMaterial = {
    kdfSalt: get('kdf_salt'),
    kdfParams: JSON.parse(get('kdf_params')),
    verifyIv: get('verify_iv'),
    verifyCiphertext: get('verify_ciphertext'),
  }
  const key = await verifyPassword(reference.password, material)
  if (!key) throw new Error('password rejected')
  return { db, codec: new AesGcmCodec(key), nodeId: get('node_id') }
}

/** Every amount in a Checquery payload, as [path, value] pairs. */
function amounts(payload: Record<string, unknown>): [string, unknown][] {
  const out: [string, unknown][] = []
  if (Array.isArray(payload.entries)) {
    ;(payload.entries as Record<string, unknown>[]).forEach((e, i) => {
      out.push([`entries.${i}.debit`, e.debit], [`entries.${i}.credit`, e.credit])
    })
  }
  if ('balance' in payload) out.push(['balance', payload.balance])
  return out
}

describe('migrating a Checquery-written log', () => {
  test('every amount equals the original to the cent, and nothing else changes', async () => {
    const { db, codec, nodeId } = await openFixture()
    const log = await ActionLog.open(db, codec, nodeId)
    expect(readSchemaVersion(db)).toBe(4)

    const actions = await collect(log.readActions())
    let checked = 0
    for (const action of actions) {
      const original = JSON.parse(reference.plaintexts[action.id] ?? 'null') as Record<string, unknown>
      const migrated = action.payload as Record<string, unknown>
      const before = amounts(original)
      const after = amounts(migrated)
      expect(after.map(([path]) => path)).toEqual(before.map(([path]) => path))
      before.forEach(([path, value], i) => {
        // An independent reading of the old format: dollars and cents digits, sign from the parentheses.
        const text = value as string
        const digits = Number(text.replace(/[^\d]/g, ''))
        expect([path, after[i]?.[1]]).toEqual([path, text.startsWith('(') && digits !== 0 ? -digits : digits])
        checked++
      })
      // Apart from amounts, the payload is unchanged.
      const strip = (p: Record<string, unknown>) =>
        JSON.stringify({
          ...p,
          entries: Array.isArray(p.entries)
            ? (p.entries as Record<string, unknown>[]).map(({ debit: _d, credit: _c, ...rest }) => rest)
            : undefined,
          balance: undefined,
        })
      expect(strip(migrated)).toBe(strip(original))
    }
    expect(checked).toBeGreaterThan(100)
  })

  test('re-encrypts every rewritten payload under a fresh IV', async () => {
    const { db, codec, nodeId } = await openFixture()
    const before = new Map(db.all<{ id: string; iv: string }>('SELECT id, iv FROM actions').map((r) => [r.id, r.iv]))
    await ActionLog.open(db, codec, nodeId)
    const rows = db.all<{ id: string; iv: string }>('SELECT id, iv FROM actions')
    for (const row of rows) {
      const original = JSON.parse(reference.plaintexts[row.id] ?? 'null') as Record<string, unknown>
      if (amounts(original).length > 0) expect(row.iv).not.toBe(before.get(row.id))
      else expect(row.iv).toBe(before.get(row.id) ?? '')
    }
  })

  test('is idempotent, and a failure leaves the log at version 3, untouched', async () => {
    const { db, codec } = await openFixture()
    const corrupt = db.get<{ id: string }>(
      "SELECT id FROM actions WHERE action_type = 'create-transaction' ORDER BY hlc DESC LIMIT 1",
    )!
    const { iv, payload } = await codec.encode('{"id":"t","entries":[{"debit":"12.34","credit":"$0.00"}]}')
    db.run('UPDATE actions SET iv = ?, encrypted_payload = ? WHERE id = ?', [iv, payload, corrupt.id])
    const snapshot = db.all('SELECT * FROM actions ORDER BY id')

    await expect(runAllMigrations(db, codec)).rejects.toThrow(new RegExp(corrupt.id))
    expect(readSchemaVersion(db)).toBe(3)
    expect(db.all('SELECT * FROM actions ORDER BY id')).toEqual(snapshot)

    const fresh = await openFixture()
    await runAllMigrations(fresh.db, fresh.codec)
    const once = fresh.db.all('SELECT * FROM actions ORDER BY id')
    await runAllMigrations(fresh.db, fresh.codec)
    expect(fresh.db.all('SELECT * FROM actions ORDER BY id')).toEqual(once)
  })
})
