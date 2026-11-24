import type { Account } from '@/ledger/accounts/Account.ts'
import type { AcctTypeStr } from '@/ledger/accounts/AcctType.ts'
import type { BalanceAssertion } from '@/ledger/balanceAssertions/BalanceAssertion.ts'
import { type Transaction, transactionDate } from '@/ledger/transactions/Transaction.ts'
import type { Vendor } from '@/ledger/vendors/Vendor.ts'

// One account's register: a line per transaction, newest first, with a running balance, merged with the account's
// balance assertions. From Checquery's buildRegisterLineItems and buildRegisterRows, in integer cents.

/** True for accounts whose balance grows with debits (assets and expenses). */
export function isDebitNormal(acctType: AcctTypeStr): boolean {
  return acctType === 'ASSET' || acctType === 'EXPENSE'
}

export interface RegisterLine {
  txn: Transaction
  /** The cleared date when there is one, otherwise the posted date: the date the register orders by. */
  date: string
  vendorName: string | undefined
  /** The other account's name, "Split" for several, or "" for none. */
  offsetLabel: string
  /** The change to this account's balance, in cents: positive increases it (in its normal direction). */
  amount: number
  /** The balance after this line, in cents. */
  balance: number
}

export type RegisterRow =
  | { kind: 'transaction'; line: RegisterLine }
  | {
      kind: 'assertion'
      assertion: BalanceAssertion
      /** The register's balance at the end of the assertion's date. */
      balance: number
      matches: boolean
      /** The asserted balance minus the register's balance. */
      difference: number
    }

export const splitLabel = 'Split'

/**
 * The register's lines, newest first. Ordered (and the balance accumulated) by transaction date, keeping the
 * input order for ties (the store returns same-date transactions in the order they were entered).
 */
export function buildRegisterLines(
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  vendors: readonly Vendor[],
  acctId: string,
  acctType: AcctTypeStr,
): RegisterLine[] {
  const accountName = new Map(accounts.map((a) => [a.id as string, a.name as string]))
  const vendorName = new Map(vendors.map((v) => [v.id as string, v.name as string]))
  const sign = isDebitNormal(acctType) ? 1 : -1
  const ascending = transactions
    .filter((txn) => txn.entries.some((e) => e.acctId === acctId))
    .map((txn, i) => ({ txn, i, date: transactionDate(txn) as string }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.i - b.i)
  let balance = 0
  const lines = ascending.map(({ txn, date }): RegisterLine => {
    let net = 0
    const others: string[] = []
    for (const e of txn.entries) {
      if (e.acctId === acctId) net += e.debit - e.credit
      else others.push(accountName.get(e.acctId) ?? '')
    }
    const amount = sign * net || 0 // no −0
    balance += amount
    return {
      txn,
      date,
      vendorName: txn.vndrId ? vendorName.get(txn.vndrId) : undefined,
      offsetLabel: others.length === 1 ? others[0]! : others.length === 0 ? '' : splitLabel,
      amount,
      balance,
    }
  })
  return lines.reverse()
}

/**
 * Merges newest-first lines with the account's balance assertions. An assertion states the balance at the end of
 * its date, so it goes above (newer than) that date's transactions.
 */
export function buildRegisterRows(
  lines: readonly RegisterLine[],
  assertions: readonly BalanceAssertion[],
): RegisterRow[] {
  const byDate = new Map<string, RegisterLine[]>()
  for (const line of lines) byDate.set(line.date, [...(byDate.get(line.date) ?? []), line])
  const assertionByDate = new Map(assertions.map((a) => [a.assertionDate as string, a]))
  const lineDatesDesc = [...byDate.keys()].sort().reverse()
  const balanceAsOf = (date: string): number => {
    for (const d of lineDatesDesc) if (d <= date) return byDate.get(d)![0]!.balance
    return 0
  }
  const rows: RegisterRow[] = []
  for (const date of [...new Set([...byDate.keys(), ...assertionByDate.keys()])].sort().reverse()) {
    const assertion = assertionByDate.get(date)
    if (assertion) {
      const balance = balanceAsOf(date)
      rows.push({
        kind: 'assertion',
        assertion,
        balance,
        matches: assertion.balance === balance,
        difference: assertion.balance - balance,
      })
    }
    for (const line of byDate.get(date) ?? []) rows.push({ kind: 'transaction', line })
  }
  return rows
}
