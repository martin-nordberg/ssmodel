import { describe, expect, it } from 'bun:test'
import { asrtIdPrefix, asrtIdSchema, genAsrtId } from '@/ledger/balanceAssertions/AsrtId.ts'

describe('genAsrtId', () => {
  it('generates a valid balance assertion ID', () => {
    const id = genAsrtId()
    expect(() => asrtIdSchema.parse(id)).not.toThrow()
  })

  it('generates IDs with the correct prefix', () => {
    const id = genAsrtId()
    expect(id.startsWith(asrtIdPrefix)).toBe(true)
  })

  it('generates unique IDs', () => {
    const id1 = genAsrtId()
    const id2 = genAsrtId()
    const id3 = genAsrtId()
    expect(id1).not.toBe(id2)
    expect(id2).not.toBe(id3)
    expect(id1).not.toBe(id3)
  })

  it('generates IDs of consistent length', () => {
    const id1 = genAsrtId()
    const id2 = genAsrtId()
    expect(id1.length).toBe(id2.length)
  })
})

describe('asrtIdSchema', () => {
  describe('valid balance assertion IDs', () => {
    it('accepts a generated ID', () => {
      const id = genAsrtId()
      expect(asrtIdSchema.parse(id)).toBe(id)
    })

    it('accepts a valid ID with correct prefix', () => {
      const id = genAsrtId()
      const result = asrtIdSchema.parse(id)
      expect(result.startsWith('asrt')).toBe(true)
    })
  })

  describe('invalid balance assertion IDs', () => {
    it('rejects ID with wrong prefix', () => {
      expect(() => asrtIdSchema.parse('acctabcdefghij1234567890')).toThrow()
    })

    it('rejects ID with transaction prefix', () => {
      expect(() => asrtIdSchema.parse('trxnabcdefghij1234567890ab')).toThrow()
    })

    it('rejects ID without prefix', () => {
      expect(() => asrtIdSchema.parse('abcdefghij1234567890abcd')).toThrow()
    })

    it('rejects invalid CUID2 format', () => {
      expect(() => asrtIdSchema.parse('asrt-not-a-valid-cuid2')).toThrow()
    })

    it('rejects empty string', () => {
      expect(() => asrtIdSchema.parse('')).toThrow()
    })

    it('rejects ID with uppercase letters', () => {
      expect(() => asrtIdSchema.parse('asrtABCDEFGHIJ1234567890ab')).toThrow()
    })

    it('rejects ID with special characters', () => {
      expect(() => asrtIdSchema.parse('asrt@bcdefghij1234567890ab')).toThrow()
    })
  })
})

describe('asrtIdPrefix', () => {
  it('is "asrt"', () => {
    expect(asrtIdPrefix).toBe('asrt')
  })
})
