import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { IsoDate } from '@/ledger/core/IsoDate.ts'
import type { AccountBalance } from '@/ledger/transactions/AccountBalance.ts'
import { ActionLog } from '@/store/actionLog/ActionLog.ts'
import { AesGcmCodec } from '@/store/actionLog/encryption/AesGcmCodec.ts'
import { verifyPassword } from '@/store/actionLog/encryption/crypto.ts'
import { getMetaValue } from '@/store/actionLog/meta.ts'
import { openBunDriver, openBunDriverFromBytes } from '@/store/driver/bunSqlite.ts'
import { LedgerStore } from '@/store/ledger/LedgerStore.ts'
import { MaterializedStore } from '@/store/materialized/MaterializedStore.ts'

// NFR-TEST-19 and the P0.3 parity check, as a unit test: a synthetic file written by Checquery, opened here
// (migrated to cents, decrypted, replayed into the materialized store), gives the same accounts, categories and
// balances as Checquery's own code (test/fixtures/checquery/small.balances.json, from spike/checquery/balances.ts).

const dir = new URL('../../fixtures/checquery/', import.meta.url).pathname
const password = (JSON.parse(readFileSync(`${dir}small.reference.json`, 'utf8')) as { password: string }).password
type Row = { acctId: string; debit: number; credit: number }
const reference = JSON.parse(readFileSync(`${dir}small.balances.json`, 'utf8')) as {
  accounts: { id: string; acctType: string; name: string; parentCtgId: string }[]
  categories: { id: string; acctType: string; name: string; parentCtgId: string | null }[]
  asOf: Record<string, Row[]>
  forPeriod: Record<string, Row[]>
  netWorth: Record<string, number>
}

async function openStore(): Promise<LedgerStore> {
  const db = openBunDriverFromBytes(readFileSync(`${dir}small.checquery`))
  const get = (key: string) => getMetaValue(db, key) ?? ''
  const key = await verifyPassword(password, {
    kdfSalt: get('kdf_salt'),
    kdfParams: JSON.parse(get('kdf_params')),
    verifyIv: get('verify_iv'),
    verifyCiphertext: get('verify_ciphertext'),
  })
  if (!key) throw new Error('password rejected')
  const log = await ActionLog.open(db, new AesGcmCodec(key), get('node_id'))
  return LedgerStore.open(log, new MaterializedStore(openBunDriver()))
}

const rows = (balances: AccountBalance[]): Row[] =>
  balances
    .map((b) => ({ acctId: b.acctId as string, debit: b.debit, credit: b.credit }))
    .sort((a, b) => a.acctId.localeCompare(b.acctId))

const store = await openStore()

describe('parity with Checquery on a synthetic file', () => {
  test('accounts and categories', async () => {
    const accounts = await store.svcs.accounts.findAccountsAll()
    const actual = accounts.map((a) => ({ id: a.id, acctType: a.acctType, name: a.name, parentCtgId: a.parentCtgId }))
    expect(actual as unknown).toEqual(reference.accounts)
    const categories = await store.svcs.accountCategories.findAccountCategoriesAll()
    const actualCategories = categories.map((c) => ({
      id: c.id,
      acctType: c.acctType,
      name: c.name,
      parentCtgId: c.parentCtgId ?? null,
    }))
    expect(actualCategories as unknown).toEqual(reference.categories)
  })

  test('per-account balances as of each date', async () => {
    for (const [date, expected] of Object.entries(reference.asOf)) {
      expect([date, rows(await store.svcs.transactions.findAccountBalancesAsOf(date as IsoDate))]).toEqual([
        date,
        expected,
      ])
    }
  })

  test('per-account balances for each period', async () => {
    for (const [period, expected] of Object.entries(reference.forPeriod)) {
      const [start, end] = period.split('..') as [IsoDate, IsoDate]
      expect([period, rows(await store.svcs.transactions.findAccountBalancesForPeriod(start, end))]).toEqual([
        period,
        expected,
      ])
    }
  })

  test("net worth (assets − liabilities) matches Checquery's balance sheet", async () => {
    const types = new Map(reference.accounts.map((a) => [a.id, a.acctType]))
    for (const [date, expected] of Object.entries(reference.netWorth)) {
      let netWorth = 0
      for (const b of await store.svcs.transactions.findAccountBalancesAsOf(date as IsoDate)) {
        const type = types.get(b.acctId)
        if (type === 'ASSET') netWorth += b.debit - b.credit
        if (type === 'LIABILITY') netWorth -= b.credit - b.debit
      }
      expect([date, netWorth]).toEqual([date, expected])
    }
    expect(Object.values(reference.netWorth).some((n) => n !== 0)).toBe(true)
  })
})
