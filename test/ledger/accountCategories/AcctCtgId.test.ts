import { describe, expect, it } from 'bun:test'
import { acctCtgIdPrefix, acctCtgIdSchema, genAcctCtgId } from '@/ledger/accountCategories/AcctCtgId.ts'

describe('genAcctCtgId', () => {
  it('generates a valid account category ID', () => {
    const id = genAcctCtgId()
    expect(() => acctCtgIdSchema.parse(id)).not.toThrow()
  })

  it('generates IDs with the correct prefix', () => {
    const id = genAcctCtgId()
    expect(id.startsWith(acctCtgIdPrefix)).toBe(true)
  })

  it('generates unique IDs', () => {
    const id1 = genAcctCtgId()
    const id2 = genAcctCtgId()
    const id3 = genAcctCtgId()
    expect(id1).not.toBe(id2)
    expect(id2).not.toBe(id3)
    expect(id1).not.toBe(id3)
  })

  it('generates IDs of consistent length', () => {
    const id1 = genAcctCtgId()
    const id2 = genAcctCtgId()
    expect(id1.length).toBe(id2.length)
  })
})

describe('acctCtgIdSchema', () => {
  describe('valid account category IDs', () => {
    it('accepts a generated ID', () => {
      const id = genAcctCtgId()
      expect(acctCtgIdSchema.parse(id)).toBe(id)
    })

    it('accepts a valid ID with correct prefix', () => {
      const id = genAcctCtgId()
      const result = acctCtgIdSchema.parse(id)
      expect(result.startsWith('actg')).toBe(true)
    })
  })

  describe('invalid account category IDs', () => {
    it('rejects ID with wrong prefix', () => {
      expect(() => acctCtgIdSchema.parse('acctabcdefghij1234567890ab')).toThrow()
    })

    it('rejects ID with org prefix', () => {
      expect(() => acctCtgIdSchema.parse('orgabcdefghij1234567890abc')).toThrow()
    })

    it('rejects ID without prefix', () => {
      expect(() => acctCtgIdSchema.parse('abcdefghij1234567890abcd')).toThrow()
    })

    it('rejects invalid CUID2 format', () => {
      expect(() => acctCtgIdSchema.parse('actg-not-a-valid-cuid2')).toThrow()
    })

    it('rejects empty string', () => {
      expect(() => acctCtgIdSchema.parse('')).toThrow()
    })

    it('rejects ID with uppercase letters', () => {
      expect(() => acctCtgIdSchema.parse('actgABCDEFGHIJ1234567890')).toThrow()
    })

    it('rejects ID with special characters', () => {
      expect(() => acctCtgIdSchema.parse('actg@bcdefghij1234567890')).toThrow()
    })
  })
})

describe('acctCtgIdPrefix', () => {
  it('is "actg"', () => {
    expect(acctCtgIdPrefix).toBe('actg')
  })
})
