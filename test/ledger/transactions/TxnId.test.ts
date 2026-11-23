import { describe, expect, it } from 'bun:test'
import { genTxnId, txnIdPrefix, txnIdSchema } from '@/ledger/transactions/TxnId.ts'

describe('genTxnId', () => {
  it('generates a valid transaction ID', () => {
    const id = genTxnId()
    expect(() => txnIdSchema.parse(id)).not.toThrow()
  })

  it('generates IDs with the correct prefix', () => {
    const id = genTxnId()
    expect(id.startsWith(txnIdPrefix)).toBe(true)
  })

  it('generates unique IDs', () => {
    const id1 = genTxnId()
    const id2 = genTxnId()
    const id3 = genTxnId()
    expect(id1).not.toBe(id2)
    expect(id2).not.toBe(id3)
    expect(id1).not.toBe(id3)
  })

  it('generates IDs of consistent length', () => {
    const id1 = genTxnId()
    const id2 = genTxnId()
    expect(id1.length).toBe(id2.length)
  })
})

describe('txnIdSchema', () => {
  describe('valid transaction IDs', () => {
    it('accepts a generated ID', () => {
      const id = genTxnId()
      expect(txnIdSchema.parse(id)).toBe(id)
    })

    it('accepts a valid ID with correct prefix', () => {
      const id = genTxnId()
      const result = txnIdSchema.parse(id)
      expect(result.startsWith('trxn')).toBe(true)
    })
  })

  describe('invalid transaction IDs', () => {
    it('rejects ID with wrong prefix', () => {
      expect(() => txnIdSchema.parse('acctabcdefghij1234567890')).toThrow()
    })

    it('rejects ID with org prefix', () => {
      expect(() => txnIdSchema.parse('orgabcdefghij1234567890ab')).toThrow()
    })

    it('rejects ID without prefix', () => {
      expect(() => txnIdSchema.parse('abcdefghij1234567890abcd')).toThrow()
    })

    it('rejects invalid CUID2 format', () => {
      expect(() => txnIdSchema.parse('trxn-not-a-valid-cuid2')).toThrow()
    })

    it('rejects empty string', () => {
      expect(() => txnIdSchema.parse('')).toThrow()
    })

    it('rejects ID with uppercase letters', () => {
      expect(() => txnIdSchema.parse('trxnABCDEFGHIJ1234567890ab')).toThrow()
    })

    it('rejects ID with special characters', () => {
      expect(() => txnIdSchema.parse('trxn@bcdefghij1234567890ab')).toThrow()
    })
  })
})

describe('txnIdPrefix', () => {
  it('is "trxn"', () => {
    expect(txnIdPrefix).toBe('trxn')
  })
})
