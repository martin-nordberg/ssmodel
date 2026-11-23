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
        debit: 10000,
        credit: 0,
      })

      expect(entry.acctId).toBe(acctId)
      expect(entry.debit).toBe(10000)
      expect(entry.credit).toBe(0)
    })

    it('parses an entry with a credit', () => {
      const entry = entryReadSchema.parse({
        acctId: genAcctId(),
        debit: 0,
        credit: 10000,
      })

      expect(entry.debit).toBe(0)
      expect(entry.credit).toBe(10000)
    })

    it('parses large amounts with comma grouping', () => {
      const entry = entryReadSchema.parse({
        acctId: genAcctId(),
        debit: 123456789,
        credit: 0,
      })

      expect(entry.debit).toBe(123456789)
    })
  })

  describe('invalid entries', () => {
    it('rejects an entry with both debit and credit non-zero', () => {
      expect(() =>
        entryReadSchema.parse({
          acctId: genAcctId(),
          debit: 10000,
          credit: 5000,
        }),
      ).toThrow()
    })

    it('rejects an entry with both debit and credit zero', () => {
      expect(() =>
        entryReadSchema.parse({
          acctId: genAcctId(),
          debit: 0,
          credit: 0,
        }),
      ).toThrow()
    })

    it('rejects missing acctId', () => {
      expect(() =>
        entryReadSchema.parse({
          debit: 10000,
          credit: 0,
        }),
      ).toThrow()
    })

    it('rejects an invalid acctId format', () => {
      expect(() =>
        entryReadSchema.parse({
          acctId: 'not-an-acct-id',
          debit: 10000,
          credit: 0,
        }),
      ).toThrow()
    })

    it('rejects an acctId with the wrong entity prefix (a transaction ID, not an account ID)', () => {
      expect(() =>
        entryReadSchema.parse({
          acctId: genTxnId(),
          debit: 10000,
          credit: 0,
        }),
      ).toThrow()
    })

    // D: OQ-LED-2: amounts are integer cents, no longer Checquery's `$#,###.##` strings.
    it('rejects a currency string', () => {
      expect(() => entryReadSchema.parse({ acctId: genAcctId(), debit: '$100.00', credit: 0 })).toThrow()
    })

    it('rejects a fraction of a cent', () => {
      expect(() => entryReadSchema.parse({ acctId: genAcctId(), debit: 100.5, credit: 0 })).toThrow()
    })

    it('rejects an amount beyond the safe integer range', () => {
      expect(() => entryReadSchema.parse({ acctId: genAcctId(), debit: 2 ** 53, credit: 0 })).toThrow()
    })

    it('rejects unknown properties', () => {
      expect(() =>
        entryReadSchema.parse({
          acctId: genAcctId(),
          debit: 10000,
          credit: 0,
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
        debit: 10000,
        credit: 0,
      })

      expect(entry.acctId).toBe(acctId)
      expect(entry.debit).toBe(10000)
      expect(entry.credit).toBe(0)
    })

    it('defaults credit to 0 when absent', () => {
      const entry = entryWriteSchema.parse({
        acctId: genAcctId(),
        debit: 10000,
      })

      expect(entry.credit).toBe(0)
    })

    it('defaults debit to 0 when absent', () => {
      const entry = entryWriteSchema.parse({
        acctId: genAcctId(),
        credit: 10000,
      })

      expect(entry.debit).toBe(0)
    })

    it('parses a negative amount', () => {
      const entry = entryWriteSchema.parse({
        acctId: genAcctId(),
        debit: -5000,
        credit: 0,
      })

      expect(entry.debit).toBe(-5000)
    })
  })

  describe('invalid entries', () => {
    it('rejects an entry with both debit and credit non-zero', () => {
      expect(() =>
        entryWriteSchema.parse({
          acctId: genAcctId(),
          debit: 10000,
          credit: 5000,
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
          debit: 0,
          credit: 0,
        }),
      ).toThrow()
    })

    it('rejects missing acctId', () => {
      expect(() =>
        entryWriteSchema.parse({
          debit: 10000,
        }),
      ).toThrow()
    })

    it('rejects unknown properties', () => {
      expect(() =>
        entryWriteSchema.parse({
          acctId: genAcctId(),
          debit: 10000,
          credit: 0,
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
        debit: 0,
        credit: 7500,
      })

      expect(patch.debit).toBe(0)
      expect(patch.credit).toBe(7500)
    })
  })

  describe('invalid patches', () => {
    it('rejects a patch that supplies only credit, omitting debit', () => {
      expect(() =>
        entryPatchSchema.parse({
          credit: 7500,
        }),
      ).toThrow()
    })

    it('rejects a patch that supplies only debit, omitting credit', () => {
      expect(() =>
        entryPatchSchema.parse({
          debit: 7500,
        }),
      ).toThrow()
    })

    it('rejects a patch where both debit and credit are non-zero', () => {
      expect(() =>
        entryPatchSchema.parse({
          debit: 5000,
          credit: 5000,
        }),
      ).toThrow()
    })

    it('rejects a patch where both debit and credit are zero', () => {
      expect(() =>
        entryPatchSchema.parse({
          debit: 0,
          credit: 0,
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
