import { describe, expect, it } from 'bun:test'
import {
  acctCtgIdLength,
  acctCtgIdPrefix,
  acctCtgIdSchema,
  genAcctCtgId,
} from '@/ledger/accountCategories/AcctCtgId.ts'
import {
  acctCtgIdAssets,
  acctCtgIdEquity,
  acctCtgIdExpenses,
  acctCtgIdIncome,
  acctCtgIdLiabilities,
  acctCtgRootId,
  acctCtgRootName,
  acctTypeForRootCtgId,
  isRootAcctCtgId,
} from '@/ledger/accountCategories/AcctCtgRoot.ts'
import { acctTypeCodes } from '@/ledger/accounts/AcctType.ts'

const allRootCtgIds = [acctCtgIdAssets, acctCtgIdLiabilities, acctCtgIdEquity, acctCtgIdIncome, acctCtgIdExpenses]

describe('predefined root account category IDs', () => {
  it('are all valid AcctCtgIds', () => {
    for (const id of allRootCtgIds) {
      expect(() => acctCtgIdSchema.parse(id)).not.toThrow()
    }
  })

  it('all have the correct prefix and length', () => {
    for (const id of allRootCtgIds) {
      expect((id as string).startsWith(acctCtgIdPrefix)).toBe(true)
      expect((id as string).length).toBe(acctCtgIdLength)
    }
  })

  it('are all distinct from one another', () => {
    expect(new Set(allRootCtgIds).size).toBe(allRootCtgIds.length)
  })
})

describe('acctCtgRootId', () => {
  it('has an entry for every account type', () => {
    expect(Object.keys(acctCtgRootId).sort()).toEqual([...acctTypeCodes].sort())
  })

  it('maps each type to the correct predefined root', () => {
    expect(acctCtgRootId.ASSET).toBe(acctCtgIdAssets)
    expect(acctCtgRootId.LIABILITY).toBe(acctCtgIdLiabilities)
    expect(acctCtgRootId.EQUITY).toBe(acctCtgIdEquity)
    expect(acctCtgRootId.INCOME).toBe(acctCtgIdIncome)
    expect(acctCtgRootId.EXPENSE).toBe(acctCtgIdExpenses)
  })
})

describe('acctCtgRootName', () => {
  it('has an entry for every account type', () => {
    expect(Object.keys(acctCtgRootName).sort()).toEqual([...acctTypeCodes].sort())
  })

  it('maps each type to the correct display name -- EQUITY is "Equity", not "Net Worth"', () => {
    expect(acctCtgRootName.ASSET as string).toBe('Assets')
    expect(acctCtgRootName.LIABILITY as string).toBe('Liabilities')
    expect(acctCtgRootName.EQUITY as string).toBe('Equity')
    expect(acctCtgRootName.INCOME as string).toBe('Income')
    expect(acctCtgRootName.EXPENSE as string).toBe('Expenses')
  })
})

describe('isRootAcctCtgId', () => {
  it('is true for all five predefined roots', () => {
    for (const id of allRootCtgIds) {
      expect(isRootAcctCtgId(id)).toBe(true)
    }
  })

  it('is false for a freshly generated category ID', () => {
    expect(isRootAcctCtgId(genAcctCtgId())).toBe(false)
  })

  it('is false for multiple freshly generated category IDs', () => {
    for (let i = 0; i < 10; i += 1) {
      expect(isRootAcctCtgId(genAcctCtgId())).toBe(false)
    }
  })
})

describe('acctTypeForRootCtgId', () => {
  it('returns the correct type for each predefined root', () => {
    expect(acctTypeForRootCtgId(acctCtgIdAssets)).toBe('ASSET')
    expect(acctTypeForRootCtgId(acctCtgIdLiabilities)).toBe('LIABILITY')
    expect(acctTypeForRootCtgId(acctCtgIdEquity)).toBe('EQUITY')
    expect(acctTypeForRootCtgId(acctCtgIdIncome)).toBe('INCOME')
    expect(acctTypeForRootCtgId(acctCtgIdExpenses)).toBe('EXPENSE')
  })

  it('returns undefined for a non-root category ID', () => {
    expect(acctTypeForRootCtgId(genAcctCtgId())).toBeUndefined()
  })
})
