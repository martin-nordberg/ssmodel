import type { AcctId } from '@/ledger/accounts/AcctId.ts'
import type { IsoDate } from '@/ledger/core/IsoDate.ts'
import type { AccountBalance } from '@/ledger/transactions/AccountBalance.ts'
import type { Transaction } from '@/ledger/transactions/Transaction.ts'
import type { TxnId } from '@/ledger/transactions/TxnId.ts'
import type { VndrId } from '@/ledger/vendors/VndrId.ts'

export interface ITransactionQrySvc {
  /** Finds the transaction with given unique ID. */
  findTransactionById(transactionId: TxnId): Promise<Transaction | null>

  /** Counts non-deleted transactions. */
  countTransactionsAll(): Promise<number>

  /** Every non-deleted transaction with an entry against this account, ordered oldest-first (see
   *  TransactionMaterializedStoreSvc for the tie-break) -- the client computes running balance/reversal. */
  findTransactionsByAccount(accountId: AcctId): Promise<Transaction[]>

  /** The most recent non-deleted transaction with an entry against this account whose vndrId matches, or
   *  null if none -- backs the register's "Repeat Prior" action. */
  findLatestTransactionForVendorAndAccount(vndrId: VndrId, accountId: AcctId): Promise<Transaction | null>

  /** Net debit/credit totals (not sign-flipped for account normal balance -- see buildBalanceSheet.ts) for
   *  every account with at least one live entry whose transaction's postDate is on or before asOfDate.
   *  Accounts with no qualifying entries are simply absent from the result, not zero-rows -- the caller
   *  defaults them to $0.00. Spans every account type, not just ASSET/LIABILITY; the balance sheet filters
   *  client-side using the same accounts list it already fetches for the category tree. */
  findAccountBalancesAsOf(asOfDate: IsoDate): Promise<AccountBalance[]>

  /** Net debit/credit totals per account, for every live entry whose transaction's postDate falls within
   *  [startDate, endDate] inclusive -- the Income Statement Summary's raw per-account data. Same unscoped-
   *  by-account-type shape as findAccountBalancesAsOf; the caller decides which account types matter. */
  findAccountBalancesForPeriod(startDate: IsoDate, endDate: IsoDate): Promise<AccountBalance[]>

  /** Every non-deleted transaction whose postDate falls within [startDate, endDate] inclusive, oldest
   *  first -- the Income Statement Details view's raw data; the client groups entries by account and
   *  resolves vendor labels. Unscoped by which accounts a transaction touches (same reasoning as
   *  findTransactionsByAccount). */
  findTransactionsForPeriod(startDate: IsoDate, endDate: IsoDate): Promise<Transaction[]>

  /** Live transactions whose description, code or vendor name contains `text` (ignoring case), or with an entry of
   *  exactly `cents`, newest first, at most `limit` [FR-UI-26]. */
  searchTransactions(text: string, cents: number | null, limit: number): Promise<Transaction[]>
}
