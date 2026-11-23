import { describe, expect, it } from 'bun:test'
import { genAcctId } from '@/ledger/accounts/AcctId.ts'
import { entryPatchSchema, entryReadSchema, entryWriteSchema } from '@/ledger/transactions/Entry.ts'
import { genTxnId } from '@/ledger/transactions/TxnId.ts'

describe('entryReadSchema', () => {
  describe('valid entries', () => {
    it('parses an entry with a debit', () => {
      const acctId = genAcctId()
      const entry = entryReadSchema.parse({
        acctId,
        debit: '$100.00',
        credit: '$0.00',
      })

      expect(entry.acctId).toBe(acctId)
      expect(entry.debit as string).toBe('$100.00')
      expect(entry.credit as string).toBe('$0.00')
    })

    it('parses an entry with a credit', () => {
      const entry = entryReadSchema.parse({
        acctId: genAcctId(),
        debit: '$0.00',
        credit: '$100.00',
      })

      expect(entry.debit as string).toBe('$0.00')
      expect(entry.credit as string).toBe('$100.00')
    })

    it('parses large amounts with comma grouping', () => {
      const entry = entryReadSchema.parse({
        acctId: genAcctId(),
        debit: '$1,234,567.89',
        credit: '$0.00',
      })

      expect(entry.debit as string).toBe('$1,234,567.89')
    })

    it('treats a parenthesized zero credit as zero', () => {
      const entry = entryReadSchema.parse({
        acctId: genAcctId(),
        debit: '$100.00',
        credit: '($0.00)',
      })

      expect(entry.credit as string).toBe('($0.00)')
    })
  })

  describe('invalid entries', () => {
    it('rejects an entry with both debit and credit non-zero', () => {
      expect(() =>
        entryReadSchema.parse({
          acctId: genAcctId(),
          debit: '$100.00',
          credit: '$50.00',
        }),
      ).toThrow()
    })

    it('rejects an entry with both debit and credit zero', () => {
      expect(() =>
        entryReadSchema.parse({
          acctId: genAcctId(),
          debit: '$0.00',
          credit: '$0.00',
        }),
      ).toThrow()
    })

    it('rejects an entry where credit is zero via parentheses and debit is also zero', () => {
      expect(() =>
        entryReadSchema.parse({
          acctId: genAcctId(),
          debit: '($0.00)',
          credit: '$0.00',
        }),
      ).toThrow()
    })

    it('rejects missing acctId', () => {
      expect(() =>
        entryReadSchema.parse({
          debit: '$100.00',
          credit: '$0.00',
        }),
      ).toThrow()
    })

    it('rejects an invalid acctId format', () => {
      expect(() =>
        entryReadSchema.parse({
          acctId: 'not-an-acct-id',
          debit: '$100.00',
          credit: '$0.00',
        }),
      ).toThrow()
    })

    it('rejects an acctId with the wrong entity prefix (a transaction ID, not an account ID)', () => {
      expect(() =>
        entryReadSchema.parse({
          acctId: genTxnId(),
          debit: '$100.00',
          credit: '$0.00',
        }),
      ).toThrow()
    })

    it('rejects invalid currency format - missing dollar sign', () => {
      expect(() =>
        entryReadSchema.parse({
          acctId: genAcctId(),
          debit: '100.00',
          credit: '$0.00',
        }),
      ).toThrow()
    })

    it('rejects invalid currency format - missing cents', () => {
      expect(() =>
        entryReadSchema.parse({
          acctId: genAcctId(),
          debit: '$100',
          credit: '$0.00',
        }),
      ).toThrow()
    })

    it('rejects invalid currency format - too many decimal places', () => {
      expect(() =>
        entryReadSchema.parse({
          acctId: genAcctId(),
          debit: '$100.000',
          credit: '$0.00',
        }),
      ).toThrow()
    })

    it('rejects unknown properties', () => {
      expect(() =>
        entryReadSchema.parse({
          acctId: genAcctId(),
          debit: '$100.00',
          credit: '$0.00',
          unknownField: 'should fail',
        }),
      ).toThrow()
    })
  })
})

describe('entryWriteSchema', () => {
  describe('valid entries', () => {
    it('parses an entry with a debit', () => {
      const acctId = genAcctId()
      const entry = entryWriteSchema.parse({
        acctId,
        debit: '$100.00',
        credit: '$0.00',
      })

      expect(entry.acctId).toBe(acctId)
      expect(entry.debit as string).toBe('$100.00')
      expect(entry.credit as string).toBe('$0.00')
    })

    it('defaults credit to $0.00 when absent', () => {
      const entry = entryWriteSchema.parse({
        acctId: genAcctId(),
        debit: '$100.00',
      })

      expect(entry.credit as string).toBe('$0.00')
    })

    it('defaults debit to $0.00 when absent', () => {
      const entry = entryWriteSchema.parse({
        acctId: genAcctId(),
        credit: '$100.00',
      })

      expect(entry.debit as string).toBe('$0.00')
    })

    it('parses a negative amount expressed in parentheses', () => {
      const entry = entryWriteSchema.parse({
        acctId: genAcctId(),
        debit: '($50.00)',
        credit: '$0.00',
      })

      expect(entry.debit as string).toBe('($50.00)')
    })
  })

  describe('invalid entries', () => {
    it('rejects an entry with both debit and credit non-zero', () => {
      expect(() =>
        entryWriteSchema.parse({
          acctId: genAcctId(),
          debit: '$100.00',
          credit: '$50.00',
        }),
      ).toThrow()
    })

    it('rejects an entry with both debit and credit zero (both defaulted)', () => {
      expect(() =>
        entryWriteSchema.parse({
          acctId: genAcctId(),
        }),
      ).toThrow()
    })

    it('rejects an entry with both debit and credit explicitly zero', () => {
      expect(() =>
        entryWriteSchema.parse({
          acctId: genAcctId(),
          debit: '$0.00',
          credit: '$0.00',
        }),
      ).toThrow()
    })

    it('rejects missing acctId', () => {
      expect(() =>
        entryWriteSchema.parse({
          debit: '$100.00',
        }),
      ).toThrow()
    })

    it('rejects unknown properties', () => {
      expect(() =>
        entryWriteSchema.parse({
          acctId: genAcctId(),
          debit: '$100.00',
          credit: '$0.00',
          unknownField: 'should fail',
        }),
      ).toThrow()
    })
  })
})

describe('entryPatchSchema', () => {
  describe('valid patches', () => {
    it('allows a patch that only changes acctId, leaving debit/credit untouched', () => {
      const acctId = genAcctId()
      const patch = entryPatchSchema.parse({ acctId })

      expect(patch.acctId).toBe(acctId)
      expect(patch.debit).toBeUndefined()
      expect(patch.credit).toBeUndefined()
    })

    it('allows an empty patch', () => {
      const patch = entryPatchSchema.parse({})

      expect(patch.acctId).toBeUndefined()
      expect(patch.debit).toBeUndefined()
      expect(patch.credit).toBeUndefined()
    })

    it('allows a patch that changes both debit and credit together', () => {
      const patch = entryPatchSchema.parse({
        debit: '$0.00',
        credit: '$75.00',
      })

      expect(patch.debit as string).toBe('$0.00')
      expect(patch.credit as string).toBe('$75.00')
    })
  })

  describe('invalid patches', () => {
    it('rejects a patch that supplies only credit, omitting debit', () => {
      expect(() =>
        entryPatchSchema.parse({
          credit: '$75.00',
        }),
      ).toThrow()
    })

    it('rejects a patch that supplies only debit, omitting credit', () => {
      expect(() =>
        entryPatchSchema.parse({
          debit: '$75.00',
        }),
      ).toThrow()
    })

    it('rejects a patch where both debit and credit are non-zero', () => {
      expect(() =>
        entryPatchSchema.parse({
          debit: '$50.00',
          credit: '$50.00',
        }),
      ).toThrow()
    })

    it('rejects a patch where both debit and credit are zero', () => {
      expect(() =>
        entryPatchSchema.parse({
          debit: '$0.00',
          credit: '$0.00',
        }),
      ).toThrow()
    })

    it('rejects an invalid acctId when provided', () => {
      expect(() =>
        entryPatchSchema.parse({
          acctId: 'not-an-acct-id',
        }),
      ).toThrow()
    })

    it('rejects unknown properties', () => {
      expect(() =>
        entryPatchSchema.parse({
          unknownField: 'should fail',
        }),
      ).toThrow()
    })
  })
})
