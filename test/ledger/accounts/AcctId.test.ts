import { describe, expect, it } from 'bun:test'
import { acctIdPrefix, acctIdSchema, genAcctId } from '@/ledger/accounts/AcctId.ts'

describe('genAcctId', () => {
  it('generates a valid account ID', () => {
    const id = genAcctId()
    expect(() => acctIdSchema.parse(id)).not.toThrow()
  })

  it('generates IDs with the correct prefix', () => {
    const id = genAcctId()
    expect(id.startsWith(acctIdPrefix)).toBe(true)
  })

  it('generates unique IDs', () => {
    const id1 = genAcctId()
    const id2 = genAcctId()
    const id3 = genAcctId()
    expect(id1).not.toBe(id2)
    expect(id2).not.toBe(id3)
    expect(id1).not.toBe(id3)
  })

  it('generates IDs of consistent length', () => {
    const id1 = genAcctId()
    const id2 = genAcctId()
    expect(id1.length).toBe(id2.length)
  })
})

describe('acctIdSchema', () => {
  describe('valid account IDs', () => {
    it('accepts a generated ID', () => {
      const id = genAcctId()
      expect(acctIdSchema.parse(id)).toBe(id)
    })

    it('accepts a valid ID with correct prefix', () => {
      const id = genAcctId()
      const result = acctIdSchema.parse(id)
      expect(result.startsWith('acct')).toBe(true)
    })
  })

  describe('invalid account IDs', () => {
    it('rejects ID with wrong prefix', () => {
      expect(() => acctIdSchema.parse('txnabcdefghij1234567890ab')).toThrow()
    })

    it('rejects ID with org prefix', () => {
      expect(() => acctIdSchema.parse('orgabcdefghij1234567890ab')).toThrow()
    })

    it('rejects ID without prefix', () => {
      expect(() => acctIdSchema.parse('abcdefghij1234567890abcd')).toThrow()
    })

    it('rejects invalid CUID2 format', () => {
      expect(() => acctIdSchema.parse('acct-not-a-valid-cuid2')).toThrow()
    })

    it('rejects empty string', () => {
      expect(() => acctIdSchema.parse('')).toThrow()
    })

    it('rejects ID with uppercase letters', () => {
      expect(() => acctIdSchema.parse('acctABCDEFGHIJ1234567890')).toThrow()
    })

    it('rejects ID with special characters', () => {
      expect(() => acctIdSchema.parse('acct@bcdefghij1234567890')).toThrow()
    })
  })
})

describe('acctIdPrefix', () => {
  it('is "acct"', () => {
    expect(acctIdPrefix).toBe('acct')
  })
})
