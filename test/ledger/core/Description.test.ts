import { describe, expect, it } from 'bun:test'
import { descriptionMaxLength, descriptionRegex, descriptionSchema } from '@/ledger/core/Description.ts'

describe('descriptionSchema', () => {
  describe('valid descriptions', () => {
    it('accepts an empty string', () => {
      const result = descriptionSchema.parse('')
      expect(result as string).toBe('')
    })

    it('accepts a normal string', () => {
      const result = descriptionSchema.parse('This is a description')
      expect(result as string).toBe('This is a description')
    })

    it('accepts a string at max length', () => {
      const description = 'x'.repeat(descriptionMaxLength)
      const result = descriptionSchema.parse(description)
      expect(result as string).toBe(description)
    })

    it('accepts a string with special characters', () => {
      const result = descriptionSchema.parse('Account #1 (Primary) - $USD @test')
      expect(result as string).toBe('Account #1 (Primary) - $USD @test')
    })
  })

  describe('trimming behavior', () => {
    it('trims leading whitespace', () => {
      const result = descriptionSchema.parse('  Leading')
      expect(result as string).toBe('Leading')
    })

    it('trims trailing whitespace', () => {
      const result = descriptionSchema.parse('Trailing  ')
      expect(result as string).toBe('Trailing')
    })

    it('trims both leading and trailing whitespace', () => {
      const result = descriptionSchema.parse('  Both  ')
      expect(result as string).toBe('Both')
    })

    it('trims to empty string', () => {
      const result = descriptionSchema.parse('   ')
      expect(result as string).toBe('')
    })
  })

  describe('invalid descriptions', () => {
    it('rejects string exceeding max length', () => {
      const description = 'x'.repeat(descriptionMaxLength + 1)
      expect(() => descriptionSchema.parse(description)).toThrow()
    })

    it('rejects string with newline', () => {
      expect(() => descriptionSchema.parse('Line one\nLine two')).toThrow()
    })

    it('rejects string with carriage return', () => {
      expect(() => descriptionSchema.parse('Line one\rLine two')).toThrow()
    })

    it('rejects string with CRLF', () => {
      expect(() => descriptionSchema.parse('Line one\r\nLine two')).toThrow()
    })
  })
})

describe('descriptionRegex', () => {
  it('matches single line strings', () => {
    expect(descriptionRegex.test('Hello World')).toBe(true)
  })

  it('matches empty string', () => {
    expect(descriptionRegex.test('')).toBe(true)
  })

  it('does not match strings with newline', () => {
    expect(descriptionRegex.test('Hello\nWorld')).toBe(false)
  })

  it('does not match strings with carriage return', () => {
    expect(descriptionRegex.test('Hello\rWorld')).toBe(false)
  })
})

describe('descriptionMaxLength', () => {
  it('is 200', () => {
    expect(descriptionMaxLength).toBe(200)
  })
})
