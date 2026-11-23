import { describe, expect, it } from 'bun:test'
import { nameMaxLength, nameRegex, nameSchema } from '@/ledger/core/Name.ts'

describe('nameSchema', () => {
  describe('valid names', () => {
    it('accepts a single character name', () => {
      const result = nameSchema.parse('A')
      expect(result as string).toBe('A')
    })

    it('accepts a normal string', () => {
      const result = nameSchema.parse('My Account Name')
      expect(result as string).toBe('My Account Name')
    })

    it('accepts a string at max length', () => {
      const name = 'x'.repeat(nameMaxLength)
      const result = nameSchema.parse(name)
      expect(result as string).toBe(name)
    })

    it('accepts a string with special characters', () => {
      const result = nameSchema.parse('Account #1 (Primary) - $USD')
      expect(result as string).toBe('Account #1 (Primary) - $USD')
    })
  })

  describe('trimming behavior', () => {
    it('trims leading whitespace', () => {
      const result = nameSchema.parse('  Leading')
      expect(result as string).toBe('Leading')
    })

    it('trims trailing whitespace', () => {
      const result = nameSchema.parse('Trailing  ')
      expect(result as string).toBe('Trailing')
    })

    it('trims both leading and trailing whitespace', () => {
      const result = nameSchema.parse('  Both  ')
      expect(result as string).toBe('Both')
    })
  })

  describe('invalid names', () => {
    it('rejects empty string', () => {
      expect(() => nameSchema.parse('')).toThrow()
    })

    it('rejects whitespace-only string', () => {
      expect(() => nameSchema.parse('   ')).toThrow()
    })

    it('rejects string exceeding max length', () => {
      const name = 'x'.repeat(nameMaxLength + 1)
      expect(() => nameSchema.parse(name)).toThrow()
    })

    it('rejects string with newline', () => {
      expect(() => nameSchema.parse('Line one\nLine two')).toThrow()
    })

    it('rejects string with carriage return', () => {
      expect(() => nameSchema.parse('Line one\rLine two')).toThrow()
    })

    it('rejects string with CRLF', () => {
      expect(() => nameSchema.parse('Line one\r\nLine two')).toThrow()
    })
  })
})

describe('nameRegex', () => {
  it('matches single line strings', () => {
    expect(nameRegex.test('Hello World')).toBe(true)
  })

  it('does not match strings with newline', () => {
    expect(nameRegex.test('Hello\nWorld')).toBe(false)
  })

  it('does not match strings with carriage return', () => {
    expect(nameRegex.test('Hello\rWorld')).toBe(false)
  })
})

describe('nameMaxLength', () => {
  it('is 200', () => {
    expect(nameMaxLength).toBe(200)
  })
})
