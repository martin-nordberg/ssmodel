import { describe, expect, it } from 'bun:test'
import { genVndrId, vndrIdPrefix, vndrIdSchema } from '@/ledger/vendors/VndrId.ts'

describe('genVndrId', () => {
  it('generates a valid vendor ID', () => {
    const id = genVndrId()
    expect(() => vndrIdSchema.parse(id)).not.toThrow()
  })

  it('generates IDs with the correct prefix', () => {
    const id = genVndrId()
    expect(id.startsWith(vndrIdPrefix)).toBe(true)
  })

  it('generates unique IDs', () => {
    const id1 = genVndrId()
    const id2 = genVndrId()
    const id3 = genVndrId()
    expect(id1).not.toBe(id2)
    expect(id2).not.toBe(id3)
    expect(id1).not.toBe(id3)
  })

  it('generates IDs of consistent length', () => {
    const id1 = genVndrId()
    const id2 = genVndrId()
    expect(id1.length).toBe(id2.length)
  })
})

describe('vndrIdSchema', () => {
  describe('valid vendor IDs', () => {
    it('accepts a generated ID', () => {
      const id = genVndrId()
      expect(vndrIdSchema.parse(id)).toBe(id)
    })

    it('accepts a valid ID with correct prefix', () => {
      const id = genVndrId()
      const result = vndrIdSchema.parse(id)
      expect(result.startsWith('vndr')).toBe(true)
    })
  })

  describe('invalid vendor IDs', () => {
    it('rejects ID with wrong prefix', () => {
      expect(() => vndrIdSchema.parse('acctabcdefghij1234567890')).toThrow()
    })

    it('rejects ID with txn prefix', () => {
      expect(() => vndrIdSchema.parse('txnabcdefghij1234567890ab')).toThrow()
    })

    it('rejects ID without prefix', () => {
      expect(() => vndrIdSchema.parse('abcdefghij1234567890abcd')).toThrow()
    })

    it('rejects invalid CUID2 format', () => {
      expect(() => vndrIdSchema.parse('vndr-not-a-valid-cuid2')).toThrow()
    })

    it('rejects empty string', () => {
      expect(() => vndrIdSchema.parse('')).toThrow()
    })

    it('rejects ID with uppercase letters', () => {
      expect(() => vndrIdSchema.parse('vndrABCDEFGHIJ1234567890')).toThrow()
    })

    it('rejects ID with special characters', () => {
      expect(() => vndrIdSchema.parse('vndr@bcdefghij1234567890')).toThrow()
    })
  })
})

describe('vndrIdPrefix', () => {
  it('is "vndr"', () => {
    expect(vndrIdPrefix).toBe('vndr')
  })
})
