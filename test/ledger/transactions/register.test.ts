import { describe, expect, test } from 'bun:test'
import fc from 'fast-check'
import type { Account } from '@/ledger/accounts/Account.ts'
import type { AcctTypeStr } from '@/ledger/accounts/AcctType.ts'
import type { BalanceAssertion } from '@/ledger/balanceAssertions/BalanceAssertion.ts'
import { buildRegisterLines, buildRegisterRows, splitLabel } from '@/ledger/transactions/register.ts'
import { draftEntries, draftProblem, type RegisterDraft, toRegisterDraft } from '@/ledger/transactions/registerDraft.ts'
import type { Transaction } from '@/ledger/transactions/Transaction.ts'

// FR-LED-3: the register (from Checquery's buildRegisterLineItems/buildRegisterRows tests) and the plain-entry draft.

const acct = (id: string, name: string, acctType: AcctTypeStr) => ({ id, name, acctType }) as unknown as Account
const accounts = [
  acct('checking', 'Checking', 'ASSET'),
  acct('groceries', 'Groceries', 'EXPENSE'),
  acct('salary', 'Salary', 'INCOME'),
  acct('taxes', 'Taxes', 'EXPENSE'),
  acct('visa', 'Visa', 'LIABILITY'),
]

let n = 0
function txn(postDate: string, entries: [string, number, number][], clearedDate?: string): Transaction {
  return {
    id: `txn${n++}`,
    postDate,
    clearedDate,
    description: 'x',
    code: '',
    needsReview: false,
    entries: entries.map(([acctId, debit, credit]) => ({ acctId, debit, credit })),
  } as unknown as Transaction
}

describe('buildRegisterLines', () => {
  const txns = [
    txn('2026-01-05', [
      ['groceries', 5000, 0],
      ['checking', 0, 5000],
    ]),
    txn('2026-01-01', [
      ['checking', 300000, 0],
      ['salary', 0, 400000],
      ['taxes', 100000, 0],
    ]),
    txn(
      '2026-01-02',
      [
        ['visa', 20000, 0],
        ['checking', 0, 20000],
      ],
      '2026-01-10',
    ),
  ]

  test('newest first by transaction date, with a running balance and offset labels', () => {
    const lines = buildRegisterLines(txns, accounts, [], 'checking', 'ASSET')
    expect(lines.map((l) => [l.date, l.amount, l.balance, l.offsetLabel])).toEqual([
      ['2026-01-10', -20000, 275000, 'Visa'],
      ['2026-01-05', -5000, 295000, 'Groceries'],
      ['2026-01-01', 300000, 300000, splitLabel],
    ])
  })

  test('liability and income registers count in their own normal direction', () => {
    expect(buildRegisterLines(txns, accounts, [], 'visa', 'LIABILITY').map((l) => [l.amount, l.balance])).toEqual([
      [-20000, -20000],
    ])
    expect(buildRegisterLines(txns, accounts, [], 'salary', 'INCOME').map((l) => l.amount)).toEqual([400000])
  })

  test('balance assertions sit above their date’s transactions, with the difference', () => {
    const lines = buildRegisterLines(txns, accounts, [], 'checking', 'ASSET')
    const assertion = (assertionDate: string, balance: number) =>
      ({ id: assertionDate, assertionDate, balance, acctId: 'checking' }) as unknown as BalanceAssertion
    const rows = buildRegisterRows(lines, [assertion('2026-01-05', 295000), assertion('2026-01-03', 250000)])
    expect(rows.map((r) => (r.kind === 'assertion' ? `A ${r.matches} ${r.difference}` : r.line.date))).toEqual([
      '2026-01-10',
      'A true 0',
      '2026-01-05',
      'A false -50000',
      '2026-01-01',
    ])
  })
})

describe('register drafts', () => {
  test('a simple withdrawal and a split paycheck read as plain amounts', () => {
    expect(
      toRegisterDraft(
        txn('2026-01-05', [
          ['groceries', 5000, 0],
          ['checking', 0, 5000],
        ]),
        'checking',
        'ASSET',
      ),
    ).toEqual({ increase: false, total: 5000, lines: [{ acctId: 'groceries', amount: 5000 }] })
    expect(
      toRegisterDraft(
        txn('2026-01-01', [
          ['checking', 300000, 0],
          ['salary', 0, 400000],
          ['taxes', 100000, 0],
        ]),
        'checking',
        'ASSET',
      ),
    ).toEqual({
      increase: true,
      total: 300000,
      lines: [
        { acctId: 'salary', amount: 400000 },
        { acctId: 'taxes', amount: -100000 },
      ],
    })
  })

  test('a draft becomes balanced entries', () => {
    const paycheck: RegisterDraft = {
      increase: true,
      total: 300000,
      lines: [
        { acctId: 'salary', amount: 400000 },
        { acctId: 'taxes', amount: -100000 },
      ],
    }
    expect(draftEntries(paycheck, 'checking', 'ASSET')).toEqual([
      { acctId: 'checking', debit: 300000, credit: 0 },
      { acctId: 'salary', debit: 0, credit: 400000 },
      { acctId: 'taxes', debit: 100000, credit: 0 },
    ])
    // A credit card charge: the liability increases.
    expect(
      draftEntries(
        { increase: true, total: 2500, lines: [{ acctId: 'groceries', amount: 2500 }] },
        'visa',
        'LIABILITY',
      ),
    ).toEqual([
      { acctId: 'visa', debit: 0, credit: 2500 },
      { acctId: 'groceries', debit: 2500, credit: 0 },
    ])
  })

  test('problems are named', () => {
    expect(draftProblem({ increase: false, total: 0, lines: [] })).toBe('Enter an amount.')
    expect(draftProblem({ increase: false, total: 100, lines: [{ acctId: '', amount: 100 }] })).toBe(
      'Choose an account for every line.',
    )
    expect(draftProblem({ increase: false, total: 100, lines: [{ acctId: 'a', amount: 90 }] })).toContain(
      'short by 10 cents',
    )
    expect(draftProblem({ increase: false, total: 100, lines: [{ acctId: 'a', amount: 100 }] })).toBeNull()
  })

  test('entries → draft → entries is the identity for balanced two-sided transactions', () => {
    const types: AcctTypeStr[] = ['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE']
    fc.assert(
      fc.property(
        fc.constantFrom(...types),
        fc.boolean(),
        fc.array(
          fc.integer({ min: -100000, max: 100000 }).filter((x) => x !== 0),
          { minLength: 1, maxLength: 4 },
        ),
        (type, increase, amounts) => {
          const total = amounts.reduce((a, b) => a + b, 0)
          if (total <= 0) return true
          const draft: RegisterDraft = {
            increase,
            total,
            lines: amounts.map((amount, i) => ({ acctId: `a${i}`, amount })),
          }
          const entries = draftEntries(draft, 'me', type)
          const debits = entries.reduce((s, e) => s + e.debit, 0)
          const credits = entries.reduce((s, e) => s + e.credit, 0)
          const back = toRegisterDraft({ entries } as unknown as Transaction, 'me', type)
          return debits === credits && JSON.stringify(back) === JSON.stringify(draft)
        },
      ),
    )
  })
})
