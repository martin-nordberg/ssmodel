import { describe, expect, it } from 'bun:test'
import { actnIdPrefix, actnIdSchema, genActnId } from '@/ledger/actions/ActnId.ts'

describe('genActnId', () => {
  it('generates a valid action ID', () => {
    const id = genActnId()
    expect(() => actnIdSchema.parse(id)).not.toThrow()
  })

  it('generates IDs with the correct prefix', () => {
    const id = genActnId()
    expect(id.startsWith(actnIdPrefix)).toBe(true)
  })

  it('generates unique IDs', () => {
    const id1 = genActnId()
    const id2 = genActnId()
    const id3 = genActnId()
    expect(id1).not.toBe(id2)
    expect(id2).not.toBe(id3)
    expect(id1).not.toBe(id3)
  })

  it('generates IDs of consistent length', () => {
    const id1 = genActnId()
    const id2 = genActnId()
    expect(id1.length).toBe(id2.length)
  })
})

describe('actnIdSchema', () => {
  describe('valid action IDs', () => {
    it('accepts a generated ID', () => {
      const id = genActnId()
      expect(actnIdSchema.parse(id)).toBe(id)
    })

    it('accepts a valid ID with correct prefix', () => {
      const id = genActnId()
      const result = actnIdSchema.parse(id)
      expect(result.startsWith('actn')).toBe(true)
    })
  })

  describe('invalid action IDs', () => {
    it('rejects ID with wrong prefix', () => {
      expect(() => actnIdSchema.parse('acctabcdefghij1234567890')).toThrow()
    })

    it('rejects ID with txn prefix', () => {
      expect(() => actnIdSchema.parse('trxnabcdefghij123456789ab')).toThrow()
    })

    it('rejects ID without prefix', () => {
      expect(() => actnIdSchema.parse('abcdefghij1234567890abcd')).toThrow()
    })

    it('rejects invalid CUID2 format', () => {
      expect(() => actnIdSchema.parse('actn-not-a-valid-cuid2')).toThrow()
    })

    it('rejects empty string', () => {
      expect(() => actnIdSchema.parse('')).toThrow()
    })

    it('rejects ID with uppercase letters', () => {
      expect(() => actnIdSchema.parse('actnABCDEFGHIJ1234567890')).toThrow()
    })

    it('rejects ID with special characters', () => {
      expect(() => actnIdSchema.parse('actn@bcdefghij1234567890')).toThrow()
    })
  })
})

describe('actnIdPrefix', () => {
  it('is "actn"', () => {
    expect(actnIdPrefix).toBe('actn')
  })
})
