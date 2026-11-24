import { describe, expect, test } from 'bun:test'
import { acctCtgIdAssets, acctCtgIdExpenses } from '@/ledger/accountCategories/AcctCtgRoot.ts'
import { openBunDriver } from '@/store/driver/bunSqlite.ts'
import { createLedgerFile } from '@/store/ledger/ledgerFile.ts'
import { LedgerSession } from '@/store/ledger/session.ts'

// FR-UI-26: searching transactions by text (description, code, vendor) or amount.

const id = (prefix: string, name: string) => `${prefix}${name.padEnd(24, '0').slice(0, 24)}`

describe('searchTransactions', () => {
  test('by description, code, vendor name and exact amount; deleted ones never', async () => {
    const opened = await createLedgerFile(openBunDriver(), openBunDriver(), { password: undefined, deviceName: 'T' })
    const s = new LedgerSession(opened.store, opened.origId, () => {})
    await s.command('accountCategories', 'createAccountCategory', {
      id: id('actg', 'bank'),
      parentCtgId: acctCtgIdAssets,
      acctType: 'ASSET',
      name: 'Bank',
    })
    await s.command('accountCategories', 'createAccountCategory', {
      id: id('actg', 'food'),
      parentCtgId: acctCtgIdExpenses,
      acctType: 'EXPENSE',
      name: 'Food',
    })
    await s.command('accounts', 'createAccount', {
      id: id('acct', 'chk'),
      parentCtgId: id('actg', 'bank'),
      acctType: 'ASSET',
      name: 'Checking',
    })
    await s.command('accounts', 'createAccount', {
      id: id('acct', 'gro'),
      parentCtgId: id('actg', 'food'),
      acctType: 'EXPENSE',
      name: 'Groceries',
    })
    await s.command('vendors', 'createVendor', { id: id('vndr', 'grocer'), name: 'Corner Grocer' })
    const txn = (name: string, extra: object, cents: number) =>
      s.command('transactions', 'createTransaction', {
        id: id('trxn', name),
        postDate: '2026-01-05',
        ...extra,
        entries: [
          { acctId: id('acct', 'gro'), debit: cents },
          { acctId: id('acct', 'chk'), credit: cents },
        ],
      })
    await txn('a', { vndrId: id('vndr', 'grocer') }, 4550)
    await txn('b', { description: 'Farmers market 50% off' }, 1200)
    await txn('c', { description: 'Hardware', code: '1042' }, 4550)
    await txn('d', { description: 'Gone' }, 4550)
    await s.command('transactions', 'deleteTransaction', { id: id('trxn', 'd') })
    const search = async (text: string, cents: number | null, limit = 10) =>
      ((await s.query('transactions', 'searchTransactions', [text, cents, limit])) as { id: string }[]).map((t) =>
        t.id.slice(4, 5),
      )

    expect(await search('grocer', null)).toEqual(['a'])
    expect(await search('MARKET', null)).toEqual(['b'])
    expect(await search('1042', null)).toEqual(['c'])
    expect(await search('', 4550)).toEqual(['c', 'a']) // newest entered first on the same date
    expect(await search('50%', null)).toEqual(['b']) // % is matched literally
    expect(await search('', 4550, 1)).toHaveLength(1)
    expect(await search('gone', null)).toEqual([])
  })
})
