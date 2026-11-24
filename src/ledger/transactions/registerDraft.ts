import type { AcctTypeStr } from '@/ledger/accounts/AcctType.ts'
import { isDebitNormal } from '@/ledger/transactions/register.ts'
import type { Transaction } from '@/ledger/transactions/Transaction.ts'

// A transaction as entered in one account's register, and back [FR-LED-3, FR-HLP-6]. The register shows one amount
// for its own account (an increase or a decrease of its balance) and one or more lines that it's allocated to:
// one line for a simple transaction, several for a split. A line's amount is signed: positive in the usual
// direction (a $100 withdrawal to Groceries), negative against it (a paycheck deposit of $3,000 allocated as $4,000
// salary and −$1,000 taxes). This keeps beginners away from debits and credits; the entries stay double-entry.

export interface DraftLine {
  acctId: string
  /** Cents, allocated from the register amount; may be negative. */
  amount: number
}

export interface RegisterDraft {
  /** Whether the transaction increases this account's balance. */
  increase: boolean
  /** The change to this account's balance, in cents, zero or more. */
  total: number
  lines: DraftLine[]
}

export interface EntryDraft {
  acctId: string
  debit: number
  credit: number
}

/** True if a register-side debit increases the account (assets, expenses). */
const debitIncreases = isDebitNormal

/** The draft for an existing transaction, seen from `acctId`'s register. */
export function toRegisterDraft(
  txn: Pick<Transaction, 'entries'>,
  acctId: string,
  acctType: AcctTypeStr,
): RegisterDraft {
  let registerDebit = 0 // net debit to this account
  for (const e of txn.entries) if (e.acctId === acctId) registerDebit += e.debit - e.credit
  const debitSide = registerDebit >= 0
  const lines = txn.entries
    .filter((e) => e.acctId !== acctId)
    .map((e) => ({ acctId: e.acctId as string, amount: debitSide ? e.credit - e.debit : e.debit - e.credit }))
  return {
    increase: debitSide === debitIncreases(acctType),
    total: Math.abs(registerDebit),
    lines,
  }
}

/** Why a draft can't be saved, or null if it can. */
export function draftProblem(draft: RegisterDraft): string | null {
  const lines = draft.lines.filter((l) => l.amount !== 0)
  if (lines.some((l) => !l.acctId)) return 'Choose an account for every line.'
  if (lines.length === 0) return draft.total === 0 ? 'Enter an amount.' : 'Choose an account.'
  const allocated = lines.reduce((sum, l) => sum + l.amount, 0)
  if (allocated !== draft.total) {
    const diff = draft.total - allocated
    return `The split lines must add up to the amount (${diff > 0 ? 'short' : 'over'} by ${Math.abs(diff)} cents).`
  }
  return null
}

/** The double-entry entries for a draft: this account's entry, then one per non-zero line. */
export function draftEntries(draft: RegisterDraft, acctId: string, acctType: AcctTypeStr): EntryDraft[] {
  const debitSide = draft.increase === debitIncreases(acctType)
  const entries: EntryDraft[] = []
  if (draft.total !== 0) {
    entries.push({ acctId, debit: debitSide ? draft.total : 0, credit: debitSide ? 0 : draft.total })
  }
  for (const line of draft.lines) {
    if (line.amount === 0) continue
    // A positive line is on the opposite side from this account's entry.
    const opposite = line.amount > 0
    const amount = Math.abs(line.amount)
    const lineDebit = debitSide ? !opposite : opposite
    entries.push({ acctId: line.acctId, debit: lineDebit ? amount : 0, credit: lineDebit ? 0 : amount })
  }
  return entries
}
