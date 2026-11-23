import type { AcctId } from '@/ledger/accounts/AcctId.ts'
import type { Cents } from '@/ledger/core/money.ts'

/** Net debit/credit totals for one account as of some date -- raw output of
 *  ITransactionQrySvc.findAccountBalancesAsOf. Not a persisted entity (no creation/patch/deletion variants,
 *  no schema) -- just a query DTO assembled from already-validated domain types, the same non-schema
 *  treatment the prior effort gave BalSheetLineItem/BalanceSheet. Spans every account type touched by any
 *  entry, including EQUITY -- callers that build reports (see buildBalanceSheet.ts) are responsible for
 *  filtering to the account types that are actually meaningful to report, and per CLAUDE.md's Domain Model
 *  Notes, the Net Worth (EQUITY) row here must never be used for that purpose. */
export type AccountBalance = {
  acctId: AcctId
  debit: Cents
  credit: Cents
}
