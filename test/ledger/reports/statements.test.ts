import { describe, expect, test } from 'bun:test'
import {
  acctCtgIdAssets,
  acctCtgIdExpenses,
  acctCtgIdIncome,
  acctCtgIdLiabilities,
} from '@/ledger/accountCategories/AcctCtgRoot.ts'
import { acctIdNetWorth } from '@/ledger/accounts/NetWorthAccount.ts'
import type { IsoDate } from '@/ledger/core/IsoDate.ts'
import { buildBalanceSheet, buildIncomeStatement, incomeStatementEntries } from '@/ledger/reports/statements.ts'
import { openBunDriver } from '@/store/driver/bunSqlite.ts'
import { createLedgerFile } from '@/store/ledger/ledgerFile.ts'
import { LedgerSession } from '@/store/ledger/session.ts'

// NFR-TEST-16, FR-LED-2: statement totals checked against values computed by hand (in the comments) on a small
// fixture ledger.

const id = (prefix: string, name: string) => `${prefix}${name.padEnd(24, '0').slice(0, 24)}`

async function fixture() {
  const opened = await createLedgerFile(openBunDriver(), openBunDriver(), { password: undefined, deviceName: 'Test' })
  const s = new LedgerSession(opened.store, opened.origId, () => {})
  const c = (entity: string, method: string, input: object) => s.command(entity, method, input)
  const ctg = (name: string, parent: string, acctType: string) =>
    c('accountCategories', 'createAccountCategory', { id: id('actg', name), parentCtgId: parent, acctType, name })
  const acct = (name: string, parent: string, acctType: string) =>
    c('accounts', 'createAccount', { id: id('acct', name), parentCtgId: id('actg', parent), acctType, name })
  await ctg('bank', acctCtgIdAssets, 'ASSET')
  await ctg('cards', acctCtgIdLiabilities, 'LIABILITY')
  await ctg('work', acctCtgIdIncome, 'INCOME')
  await ctg('food', acctCtgIdExpenses, 'EXPENSE')
  await ctg('taxes', acctCtgIdExpenses, 'EXPENSE')
  await acct('checking', 'bank', 'ASSET')
  await acct('savings', 'bank', 'ASSET')
  await acct('visa', 'cards', 'LIABILITY')
  await acct('salary', 'work', 'INCOME')
  await acct('interest', 'work', 'INCOME')
  await acct('groceries', 'food', 'EXPENSE')
  await acct('dining', 'food', 'EXPENSE')
  await acct('federal', 'taxes', 'EXPENSE')
  let n = 0
  const txn = (postDate: string, description: string, entries: [string, number, number][]) =>
    c('transactions', 'createTransaction', {
      id: id('trxn', `t${n++}`),
      postDate,
      description,
      entries: entries.map(([a, debit, credit]) => ({
        acctId: a === 'networth' ? acctIdNetWorth : id('acct', a),
        debit,
        credit,
      })),
    })
  await txn('2026-01-01', 'Opening balance', [
    ['checking', 100000, 0],
    ['networth', 0, 100000],
  ])
  await txn('2026-01-15', 'Paycheck', [
    ['checking', 300000, 0],
    ['salary', 0, 400000],
    ['federal', 100000, 0],
  ])
  await txn('2026-01-20', 'Groceries', [
    ['groceries', 12000, 0],
    ['visa', 0, 12000],
  ])
  await txn('2026-02-03', 'Dinner', [
    ['dining', 4500, 0],
    ['visa', 0, 4500],
  ])
  await txn('2026-02-10', 'Card payment', [
    ['visa', 12000, 0],
    ['checking', 0, 12000],
  ])
  await txn('2026-03-31', 'To savings', [
    ['savings', 50000, 0],
    ['checking', 0, 50000],
  ])
  await txn('2026-03-31', 'Interest', [
    ['savings', 125, 0],
    ['interest', 0, 125],
  ])
  await txn('2026-04-02', 'Groceries', [
    ['groceries', 8000, 0],
    ['checking', 0, 8000],
  ])
  const store = opened.store
  const [categories, accounts, vendors] = await Promise.all([
    store.svcs.accountCategories.findAccountCategoriesAll(),
    store.svcs.accounts.findAccountsAll(),
    store.svcs.vendors.findVendorsAll(),
  ])
  return {
    sheet: async (asOf: string) =>
      buildBalanceSheet(
        categories,
        accounts,
        await store.svcs.transactions.findAccountBalancesAsOf(asOf as IsoDate),
        asOf,
      ),
    statement: async (start: string, end: string) =>
      buildIncomeStatement(
        categories,
        accounts,
        await store.svcs.transactions.findAccountBalancesForPeriod(start as IsoDate, end as IsoDate),
        start,
        end,
      ),
    entries: async (start: string, end: string) =>
      incomeStatementEntries(
        accounts,
        await store.svcs.transactions.findTransactionsForPeriod(start as IsoDate, end as IsoDate),
        vendors,
      ),
  }
}

const amounts = (lines: { label: string; amount: number }[]) =>
  Object.fromEntries(lines.map((l) => [l.label, l.amount]))

const f = await fixture()

describe('Balance Sheet', () => {
  test('as of the end of Q1', async () => {
    const s = await f.sheet('2026-03-31')
    // Checking: 1,000 + 3,000 − 120 − 500 = 3,380; Savings: 500 + 1.25 = 501.25; Visa: 120 + 45 − 120 = 45.
    expect(amounts(s.assets.lines)).toEqual({ bank: 388125, checking: 338000, savings: 50125 })
    expect(amounts(s.liabilities.lines)).toEqual({ cards: 4500, visa: 4500 })
    expect([s.assets.total, s.liabilities.total, s.netWorth]).toEqual([388125, 4500, 383625])
  })

  test('as of the end of January, and of the year', async () => {
    // Jan 31: Checking 4,000; Visa 120 → net worth 3,880.
    expect((await f.sheet('2026-01-31')).netWorth).toBe(388000)
    // Dec 31: Checking 3,380 − 80 = 3,300; Savings 501.25; Visa 45 → 3,756.25 = 1,000 opening + 2,756.25 net income.
    expect((await f.sheet('2026-12-31')).netWorth).toBe(375625)
  })

  test('net worth is assets minus liabilities, never the Net Worth account', async () => {
    const s = await f.sheet('2026-12-31')
    expect(s.netWorth).not.toBe(100000) // the Net Worth account holds only the opening balance
  })
})

describe('Income Statement', () => {
  test('Q1', async () => {
    const s = await f.statement('2026-01-01', '2026-03-31')
    // Income: 4,000 salary + 1.25 interest; expenses: 120 groceries + 45 dining + 1,000 federal.
    expect(amounts(s.income.lines)).toEqual({ work: 400125, salary: 400000, interest: 125 })
    expect(amounts(s.expenses.lines)).toEqual({
      food: 16500,
      groceries: 12000,
      dining: 4500,
      taxes: 100000,
      federal: 100000,
    })
    expect([s.income.total, s.expenses.total, s.netIncome]).toEqual([400125, 116500, 283625])
  })

  test('January and the whole year', async () => {
    const jan = await f.statement('2026-01-01', '2026-01-31')
    expect([jan.income.total, jan.expenses.total, jan.netIncome]).toEqual([400000, 112000, 288000])
    const year = await f.statement('2026-01-01', '2026-12-31')
    expect([year.income.total, year.expenses.total, year.netIncome]).toEqual([400125, 124500, 275625])
  })

  test('details list each account’s entries, and they add up to its total', async () => {
    const entries = await f.entries('2026-01-01', '2026-12-31')
    const groceries = entries.get(id('acct', 'groceries'))!
    expect(groceries.map((e) => [e.date, e.amount])).toEqual([
      ['2026-01-20', 12000],
      ['2026-04-02', 8000],
    ])
    const year = await f.statement('2026-01-01', '2026-12-31')
    for (const line of [...year.income.lines, ...year.expenses.lines].filter((l) => l.kind === 'account')) {
      expect((entries.get(line.id) ?? []).reduce((s, e) => s + e.amount, 0)).toBe(line.amount)
    }
  })
})
