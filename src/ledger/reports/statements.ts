import type { AccountCategory } from '@/ledger/accountCategories/AccountCategory.ts'
import { type AccountTreeNode, buildAccountTree } from '@/ledger/accountCategories/accountTree.ts'
import type { Account } from '@/ledger/accounts/Account.ts'
import type { AcctTypeStr } from '@/ledger/accounts/AcctType.ts'
import type { AccountBalance } from '@/ledger/transactions/AccountBalance.ts'
import type { Transaction } from '@/ledger/transactions/Transaction.ts'
import type { Vendor } from '@/ledger/vendors/Vendor.ts'

// The Balance Sheet and Income Statement [FR-LED-2, FR-LED-3, RPT-LED-1, RPT-LED-2 base versions], in integer cents.
// From Checquery's buildBalanceSheet, buildIncomeStatementSummary/Details and buildCategoryRollupSection. Reports use
// the posted date (Checquery's reporting date); registers order by the transaction date.

export interface RollupLine {
  kind: 'category' | 'account'
  depth: number
  label: string
  /** Cents, in the section's normal direction; a category's is its subtotal. */
  amount: number
  /** The account or category id. */
  id: string
}

export interface RollupSection {
  heading: string
  lines: RollupLine[]
  total: number
}

/** A section's lines in tree order: each category (with its subtotal) above its children. */
export function rollupSection(
  heading: string,
  categories: readonly AccountCategory[],
  accounts: readonly Account[],
  amountByAcct: ReadonlyMap<string, number>,
  acctType: AcctTypeStr,
): RollupSection {
  const lines: RollupLine[] = []
  const walk = (node: AccountTreeNode, depth: number, out: RollupLine[]): number => {
    if (node.kind === 'account') {
      const amount = amountByAcct.get(node.account.id) ?? 0
      out.push({ kind: 'account', depth, label: node.account.name, amount, id: node.account.id })
      return amount
    }
    const children: RollupLine[] = []
    let subtotal = 0
    for (const child of node.children) subtotal += walk(child, depth + 1, children)
    out.push({ kind: 'category', depth, label: node.category.name, amount: subtotal, id: node.category.id })
    out.push(...children)
    return subtotal
  }
  let total = 0
  for (const node of buildAccountTree(categories, accounts, acctType)) total += walk(node, 0, lines)
  return { heading, lines, total }
}

/** Per-account amounts in each account's normal direction (debits for assets and expenses, credits otherwise). */
function signedAmounts(accounts: readonly Account[], balances: readonly AccountBalance[]): Map<string, number> {
  const type = new Map(accounts.map((a) => [a.id as string, a.acctType]))
  const out = new Map<string, number>()
  for (const b of balances) {
    const t = type.get(b.acctId)
    if (!t) continue
    out.set(b.acctId, t === 'ASSET' || t === 'EXPENSE' ? b.debit - b.credit : b.credit - b.debit)
  }
  return out
}

export interface BalanceSheet {
  asOf: string
  assets: RollupSection
  liabilities: RollupSection
  /** Assets minus liabilities: never the Net Worth account's own balance [FR-LED-2]. */
  netWorth: number
}

/** The Balance Sheet as of a date, from findAccountBalancesAsOf(asOf). */
export function buildBalanceSheet(
  categories: readonly AccountCategory[],
  accounts: readonly Account[],
  balances: readonly AccountBalance[],
  asOf: string,
): BalanceSheet {
  const amounts = signedAmounts(accounts, balances)
  const assets = rollupSection('Assets', categories, accounts, amounts, 'ASSET')
  const liabilities = rollupSection('Liabilities', categories, accounts, amounts, 'LIABILITY')
  return { asOf, assets, liabilities, netWorth: assets.total - liabilities.total }
}

export interface IncomeStatement {
  start: string
  end: string
  income: RollupSection
  expenses: RollupSection
  /** Income minus expenses. */
  netIncome: number
}

/** The Income Statement summary for a period, from findAccountBalancesForPeriod(start, end). */
export function buildIncomeStatement(
  categories: readonly AccountCategory[],
  accounts: readonly Account[],
  balances: readonly AccountBalance[],
  start: string,
  end: string,
): IncomeStatement {
  const amounts = signedAmounts(accounts, balances)
  const income = rollupSection('Income', categories, accounts, amounts, 'INCOME')
  const expenses = rollupSection('Expenses', categories, accounts, amounts, 'EXPENSE')
  return { start, end, income, expenses, netIncome: income.total - expenses.total }
}

export interface DetailEntry {
  txnId: string
  date: string
  label: string
  /** Cents, in the account's normal direction. */
  amount: number
}

/**
 * The Income Statement's details: each income and expense account's entries in the period (from
 * findTransactionsForPeriod), oldest first, labeled with the vendor and description.
 */
export function incomeStatementEntries(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  vendors: readonly Vendor[],
): Map<string, DetailEntry[]> {
  const type = new Map(accounts.map((a) => [a.id as string, a.acctType]))
  const vendorName = new Map(vendors.map((v) => [v.id as string, v.name as string]))
  const out = new Map<string, DetailEntry[]>()
  for (const txn of transactions) {
    const vendor = txn.vndrId ? vendorName.get(txn.vndrId) : undefined
    const label = vendor && txn.description ? `${vendor} — ${txn.description}` : (vendor ?? txn.description)
    for (const e of txn.entries) {
      const t = type.get(e.acctId)
      if (t !== 'INCOME' && t !== 'EXPENSE') continue
      const amount = t === 'EXPENSE' ? e.debit - e.credit : e.credit - e.debit
      out.set(e.acctId, [...(out.get(e.acctId) ?? []), { txnId: txn.id, date: txn.postDate, label, amount }])
    }
  }
  for (const list of out.values()) list.sort((a, b) => a.date.localeCompare(b.date))
  return out
}
