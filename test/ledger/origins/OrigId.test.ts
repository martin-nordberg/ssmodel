import { describe, expect, it } from 'bun:test'
import { genOrigId, origIdPrefix, origIdSchema } from '@/ledger/origins/OrigId.ts'

describe('genOrigId', () => {
  it('generates a valid origin ID', () => {
    const id = genOrigId()
    expect(() => origIdSchema.parse(id)).not.toThrow()
  })

  it('generates IDs with the correct prefix', () => {
    const id = genOrigId()
    expect(id.startsWith(origIdPrefix)).toBe(true)
  })

  it('generates unique IDs', () => {
    const id1 = genOrigId()
    const id2 = genOrigId()
    const id3 = genOrigId()
    expect(id1).not.toBe(id2)
    expect(id2).not.toBe(id3)
    expect(id1).not.toBe(id3)
  })

  it('generates IDs of consistent length', () => {
    const id1 = genOrigId()
    const id2 = genOrigId()
    expect(id1.length).toBe(id2.length)
  })
})

describe('origIdSchema', () => {
  describe('valid origin IDs', () => {
    it('accepts a generated ID', () => {
      const id = genOrigId()
      expect(origIdSchema.parse(id)).toBe(id)
    })

    it('accepts a valid ID with correct prefix', () => {
      const id = genOrigId()
      const result = origIdSchema.parse(id)
      expect(result.startsWith('orig')).toBe(true)
    })
  })

  describe('invalid origin IDs', () => {
    it('rejects ID with wrong prefix', () => {
      expect(() => origIdSchema.parse('acctabcdefghij1234567890')).toThrow()
    })

    it('rejects ID with txn prefix', () => {
      expect(() => origIdSchema.parse('trxnabcdefghij123456789ab')).toThrow()
    })

    it('rejects ID without prefix', () => {
      expect(() => origIdSchema.parse('abcdefghij1234567890abcd')).toThrow()
    })

    it('rejects invalid CUID2 format', () => {
      expect(() => origIdSchema.parse('orig-not-a-valid-cuid2')).toThrow()
    })

    it('rejects empty string', () => {
      expect(() => origIdSchema.parse('')).toThrow()
    })

    it('rejects ID with uppercase letters', () => {
      expect(() => origIdSchema.parse('origABCDEFGHIJ1234567890')).toThrow()
    })

    it('rejects ID with special characters', () => {
      expect(() => origIdSchema.parse('orig@bcdefghij1234567890')).toThrow()
    })
  })
})

describe('origIdPrefix', () => {
  it('is "orig"', () => {
    expect(origIdPrefix).toBe('orig')
  })
})
