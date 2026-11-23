import { describe, expect, it } from 'bun:test'
import { acctTypeCodes, acctTypeFromName, acctTypeSchema, acctTypeText } from '@/ledger/accounts/AcctType.ts'

describe('acctTypeSchema', () => {
  describe('valid account types', () => {
    it('accepts ASSET', () => {
      expect(acctTypeSchema.parse('ASSET')).toBe('ASSET')
    })

    it('accepts LIABILITY', () => {
      expect(acctTypeSchema.parse('LIABILITY')).toBe('LIABILITY')
    })

    it('accepts EQUITY', () => {
      expect(acctTypeSchema.parse('EQUITY')).toBe('EQUITY')
    })

    it('accepts EXPENSE', () => {
      expect(acctTypeSchema.parse('EXPENSE')).toBe('EXPENSE')
    })

    it('accepts INCOME', () => {
      expect(acctTypeSchema.parse('INCOME')).toBe('INCOME')
    })
  })

  describe('invalid account types', () => {
    it('rejects lowercase asset', () => {
      expect(() => acctTypeSchema.parse('asset')).toThrow()
    })

    it('rejects unknown type', () => {
      expect(() => acctTypeSchema.parse('INVALID')).toThrow()
    })

    it('rejects empty string', () => {
      expect(() => acctTypeSchema.parse('')).toThrow()
    })

    it('rejects null', () => {
      expect(() => acctTypeSchema.parse(null)).toThrow()
    })

    it('rejects number', () => {
      expect(() => acctTypeSchema.parse(123)).toThrow()
    })
  })
})

describe('acctTypeCodes', () => {
  it('contains all five account types', () => {
    expect(acctTypeCodes).toEqual(['ASSET', 'LIABILITY', 'EQUITY', 'EXPENSE', 'INCOME'])
  })

  it('has length of 5', () => {
    expect(acctTypeCodes.length).toBe(5)
  })
})

describe('acctTypeText', () => {
  it('returns "Asset" for ASSET', () => {
    expect(acctTypeText('ASSET')).toBe('Asset')
  })

  it('returns "Liability" for LIABILITY', () => {
    expect(acctTypeText('LIABILITY')).toBe('Liability')
  })

  it('returns "Net Worth" for EQUITY', () => {
    expect(acctTypeText('EQUITY')).toBe('Net Worth')
  })

  it('returns "Expense" for EXPENSE', () => {
    expect(acctTypeText('EXPENSE')).toBe('Expense')
  })

  it('returns "Income" for INCOME', () => {
    expect(acctTypeText('INCOME')).toBe('Income')
  })
})

describe('acctTypeFromName', () => {
  describe('valid account names', () => {
    it('returns ASSET for names starting with "Assets"', () => {
      expect(acctTypeFromName('Assets:Checking')).toBe('ASSET')
    })

    it('returns ASSET for "Assets" alone', () => {
      expect(acctTypeFromName('Assets')).toBe('ASSET')
    })

    it('returns LIABILITY for names starting with "Liabilities"', () => {
      expect(acctTypeFromName('Liabilities:Credit Card')).toBe('LIABILITY')
    })

    it('returns EQUITY for names starting with "Equity"', () => {
      expect(acctTypeFromName('Equity:Retained Earnings')).toBe('EQUITY')
    })

    it('returns EXPENSE for names starting with "Expenses"', () => {
      expect(acctTypeFromName('Expenses:Food')).toBe('EXPENSE')
    })

    it('returns INCOME for names starting with "Income"', () => {
      expect(acctTypeFromName('Income:Salary')).toBe('INCOME')
    })
  })

  describe('invalid account names', () => {
    it('throws error for unknown prefix', () => {
      expect(() => acctTypeFromName('Unknown:Account')).toThrow('Unknown account type for account: Unknown:Account')
    })

    it('throws error for empty string', () => {
      expect(() => acctTypeFromName('')).toThrow('Unknown account type for account: ')
    })

    it('throws error for lowercase "assets"', () => {
      expect(() => acctTypeFromName('assets:Checking')).toThrow()
    })

    it('throws error for partial match "Asset" (singular)', () => {
      expect(() => acctTypeFromName('Asset:Checking')).toThrow()
    })

    it('throws error for partial match "Expense" (singular)', () => {
      expect(() => acctTypeFromName('Expense:Food')).toThrow()
    })

    it('throws error for partial match "Liability" (singular)', () => {
      expect(() => acctTypeFromName('Liability:Card')).toThrow()
    })
  })
})
