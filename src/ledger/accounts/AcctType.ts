import { z } from 'zod'

/** Schema for a Checquery account type. */
export const acctTypeSchema = z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'EXPENSE', 'INCOME'])

export const acctTypeCodes = acctTypeSchema.options

export type AcctTypeStr = z.infer<typeof acctTypeSchema>

export function acctTypeText(acctType: AcctTypeStr) {
  switch (acctType) {
    case 'ASSET':
      return 'Asset'
    case 'LIABILITY':
      return 'Liability'
    case 'EQUITY':
      return 'Net Worth'
    case 'EXPENSE':
      return 'Expense'
    case 'INCOME':
      return 'Income'
  }
}

export function acctTypeFromName(accountName: string): AcctTypeStr {
  if (accountName.startsWith('Assets')) {
    return 'ASSET'
  }
  if (accountName.startsWith('Liabilities')) {
    return 'LIABILITY'
  }
  if (accountName.startsWith('Equity')) {
    return 'EQUITY'
  }
  if (accountName.startsWith('Expenses')) {
    return 'EXPENSE'
  }
  if (accountName.startsWith('Income')) {
    return 'INCOME'
  }

  throw Error(`Unknown account type for account: ${accountName}`)
}
