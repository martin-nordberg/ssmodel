import { type AcctCtgId, acctCtgIdSchema } from '@/ledger/accountCategories/AcctCtgId.ts'
import type { AcctTypeStr } from '@/ledger/accounts/AcctType.ts'
import { type NameStr, nameSchema } from '@/ledger/core/Name.ts'

/** Predefined root account category IDs, one per account type. Never user-created, renamed, or deleted. */
export const acctCtgIdAssets: AcctCtgId = acctCtgIdSchema.parse('actgassets000000000000000000')
export const acctCtgIdLiabilities: AcctCtgId = acctCtgIdSchema.parse('actgliabilities0000000000000')
export const acctCtgIdEquity: AcctCtgId = acctCtgIdSchema.parse('actgequity000000000000000000')
export const acctCtgIdIncome: AcctCtgId = acctCtgIdSchema.parse('actgincome000000000000000000')
export const acctCtgIdExpenses: AcctCtgId = acctCtgIdSchema.parse('actgexpenses0000000000000000')

/** Maps each account type to its predefined root account category ID. */
export const acctCtgRootId: Record<AcctTypeStr, AcctCtgId> = {
  ASSET: acctCtgIdAssets,
  LIABILITY: acctCtgIdLiabilities,
  EQUITY: acctCtgIdEquity,
  INCOME: acctCtgIdIncome,
  EXPENSE: acctCtgIdExpenses,
}

/**
 * Maps each account type to its predefined root category's display name. Note EQUITY's root category is
 * named "Equity", not "Net Worth" -- "Net Worth" is the name of the one predefined account that lives
 * directly under this root (see NetWorthAccount.ts), not the category itself.
 */
export const acctCtgRootName: Record<AcctTypeStr, NameStr> = {
  ASSET: nameSchema.parse('Assets'),
  LIABILITY: nameSchema.parse('Liabilities'),
  EQUITY: nameSchema.parse('Equity'),
  INCOME: nameSchema.parse('Income'),
  EXPENSE: nameSchema.parse('Expenses'),
}

const rootAcctCtgIds: ReadonlySet<AcctCtgId> = new Set(Object.values(acctCtgRootId))

/** True if the given ID is one of the five predefined root account categories. */
export const isRootAcctCtgId = (id: AcctCtgId): boolean => rootAcctCtgIds.has(id)

const rootAcctTypeByCtgId: ReadonlyMap<AcctCtgId, AcctTypeStr> = new Map(
  (Object.entries(acctCtgRootId) as [AcctTypeStr, AcctCtgId][]).map(([acctType, id]) => [id, acctType]),
)

/** The account type a predefined root category ID represents, or undefined if the ID isn't a root. */
export const acctTypeForRootCtgId = (id: AcctCtgId): AcctTypeStr | undefined => rootAcctTypeByCtgId.get(id)
