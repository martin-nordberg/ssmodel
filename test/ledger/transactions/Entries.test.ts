import { describe, expect, it } from 'bun:test'
import { genAcctId } from '@/ledger/accounts/AcctId.ts'
import { entriesReadSchema, entriesWriteSchema } from '@/ledger/transactions/Entries.ts'

describe('entriesWriteSchema', () => {
  it('parses two balanced entries', () => {
    const entries = entriesWriteSchema.parse([
      { acctId: genAcctId(), debit: '$100.00', credit: '$0.00' },
      { acctId: genAcctId(), debit: '$0.00', credit: '$100.00' },
    ])

    expect(entries).toHaveLength(2)
  })

  it('parses more than two balanced entries', () => {
    const entries = entriesWriteSchema.parse([
      { acctId: genAcctId(), debit: '$100.00', credit: '$0.00' },
      { acctId: genAcctId(), debit: '$30.00', credit: '$0.00' },
      { acctId: genAcctId(), debit: '$0.00', credit: '$130.00' },
    ])

    expect(entries).toHaveLength(3)
  })

  it('applies each entry write default (credit defaults to $0.00)', () => {
    const entries = entriesWriteSchema.parse([
      { acctId: genAcctId(), debit: '$100.00' },
      { acctId: genAcctId(), credit: '$100.00' },
    ])

    expect(entries[0]!.credit as string).toBe('$0.00')
    expect(entries[1]!.debit as string).toBe('$0.00')
  })

  it('rejects a single entry', () => {
    expect(() => entriesWriteSchema.parse([{ acctId: genAcctId(), debit: '$100.00', credit: '$0.00' }])).toThrow()
  })

  it('rejects an empty entries array', () => {
    expect(() => entriesWriteSchema.parse([])).toThrow()
  })

  it('rejects unbalanced entries - debits exceed credits', () => {
    expect(() =>
      entriesWriteSchema.parse([
        { acctId: genAcctId(), debit: '$100.00', credit: '$0.00' },
        { acctId: genAcctId(), debit: '$0.00', credit: '$50.00' },
      ]),
    ).toThrow()
  })

  it('rejects unbalanced entries - credits exceed debits', () => {
    expect(() =>
      entriesWriteSchema.parse([
        { acctId: genAcctId(), debit: '$50.00', credit: '$0.00' },
        { acctId: genAcctId(), debit: '$0.00', credit: '$100.00' },
      ]),
    ).toThrow()
  })

  it('rejects a set where one entry is individually invalid (both debit and credit non-zero)', () => {
    expect(() =>
      entriesWriteSchema.parse([
        { acctId: genAcctId(), debit: '$100.00', credit: '$100.00' },
        { acctId: genAcctId(), debit: '$0.00', credit: '$100.00' },
      ]),
    ).toThrow()
  })

  it('balances amounts expressed with comma grouping', () => {
    const entries = entriesWriteSchema.parse([
      { acctId: genAcctId(), debit: '$1,000.00', credit: '$0.00' },
      { acctId: genAcctId(), debit: '$0.00', credit: '$1,000.00' },
    ])

    expect(entries).toHaveLength(2)
  })
})

describe('entriesReadSchema', () => {
  it('parses two balanced entries', () => {
    const entries = entriesReadSchema.parse([
      { acctId: genAcctId(), debit: '$100.00', credit: '$0.00' },
      { acctId: genAcctId(), debit: '$0.00', credit: '$100.00' },
    ])

    expect(entries).toHaveLength(2)
  })

  it('rejects a single entry', () => {
    expect(() => entriesReadSchema.parse([{ acctId: genAcctId(), debit: '$100.00', credit: '$0.00' }])).toThrow()
  })

  it('rejects an empty entries array', () => {
    expect(() => entriesReadSchema.parse([])).toThrow()
  })

  it('rejects unbalanced entries', () => {
    expect(() =>
      entriesReadSchema.parse([
        { acctId: genAcctId(), debit: '$100.00', credit: '$0.00' },
        { acctId: genAcctId(), debit: '$0.00', credit: '$50.00' },
      ]),
    ).toThrow()
  })

  it('rejects a set where one entry is individually invalid (both debit and credit non-zero)', () => {
    expect(() =>
      entriesReadSchema.parse([
        { acctId: genAcctId(), debit: '$100.00', credit: '$100.00' },
        { acctId: genAcctId(), debit: '$0.00', credit: '$100.00' },
      ]),
    ).toThrow()
  })
})
