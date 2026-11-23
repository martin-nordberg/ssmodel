import { describe, expect, it } from 'bun:test'
import { genAcctId } from '@/ledger/accounts/AcctId.ts'
import { entriesReadSchema, entriesWriteSchema } from '@/ledger/transactions/Entries.ts'

describe('entriesWriteSchema', () => {
  it('parses two balanced entries', () => {
    const entries = entriesWriteSchema.parse([
      { acctId: genAcctId(), debit: 10000, credit: 0 },
      { acctId: genAcctId(), debit: 0, credit: 10000 },
    ])

    expect(entries).toHaveLength(2)
  })

  it('parses more than two balanced entries', () => {
    const entries = entriesWriteSchema.parse([
      { acctId: genAcctId(), debit: 10000, credit: 0 },
      { acctId: genAcctId(), debit: 3000, credit: 0 },
      { acctId: genAcctId(), debit: 0, credit: 13000 },
    ])

    expect(entries).toHaveLength(3)
  })

  it('applies each entry write default (credit defaults to 0)', () => {
    const entries = entriesWriteSchema.parse([
      { acctId: genAcctId(), debit: 10000 },
      { acctId: genAcctId(), credit: 10000 },
    ])

    expect(entries[0]!.credit).toBe(0)
    expect(entries[1]!.debit).toBe(0)
  })

  it('rejects a single entry', () => {
    expect(() => entriesWriteSchema.parse([{ acctId: genAcctId(), debit: 10000, credit: 0 }])).toThrow()
  })

  it('rejects an empty entries array', () => {
    expect(() => entriesWriteSchema.parse([])).toThrow()
  })

  it('rejects unbalanced entries - debits exceed credits', () => {
    expect(() =>
      entriesWriteSchema.parse([
        { acctId: genAcctId(), debit: 10000, credit: 0 },
        { acctId: genAcctId(), debit: 0, credit: 5000 },
      ]),
    ).toThrow()
  })

  it('rejects unbalanced entries - credits exceed debits', () => {
    expect(() =>
      entriesWriteSchema.parse([
        { acctId: genAcctId(), debit: 5000, credit: 0 },
        { acctId: genAcctId(), debit: 0, credit: 10000 },
      ]),
    ).toThrow()
  })

  it('rejects a set where one entry is individually invalid (both debit and credit non-zero)', () => {
    expect(() =>
      entriesWriteSchema.parse([
        { acctId: genAcctId(), debit: 10000, credit: 10000 },
        { acctId: genAcctId(), debit: 0, credit: 10000 },
      ]),
    ).toThrow()
  })

  it('balances amounts expressed with comma grouping', () => {
    const entries = entriesWriteSchema.parse([
      { acctId: genAcctId(), debit: 100000, credit: 0 },
      { acctId: genAcctId(), debit: 0, credit: 100000 },
    ])

    expect(entries).toHaveLength(2)
  })
})

describe('entriesReadSchema', () => {
  it('parses two balanced entries', () => {
    const entries = entriesReadSchema.parse([
      { acctId: genAcctId(), debit: 10000, credit: 0 },
      { acctId: genAcctId(), debit: 0, credit: 10000 },
    ])

    expect(entries).toHaveLength(2)
  })

  it('rejects a single entry', () => {
    expect(() => entriesReadSchema.parse([{ acctId: genAcctId(), debit: 10000, credit: 0 }])).toThrow()
  })

  it('rejects an empty entries array', () => {
    expect(() => entriesReadSchema.parse([])).toThrow()
  })

  it('rejects unbalanced entries', () => {
    expect(() =>
      entriesReadSchema.parse([
        { acctId: genAcctId(), debit: 10000, credit: 0 },
        { acctId: genAcctId(), debit: 0, credit: 5000 },
      ]),
    ).toThrow()
  })

  it('rejects a set where one entry is individually invalid (both debit and credit non-zero)', () => {
    expect(() =>
      entriesReadSchema.parse([
        { acctId: genAcctId(), debit: 10000, credit: 10000 },
        { acctId: genAcctId(), debit: 0, credit: 10000 },
      ]),
    ).toThrow()
  })
})
