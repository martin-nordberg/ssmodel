import type { AcctId } from '@/ledger/accounts/AcctId.ts'
import type { DescriptionStr } from '@/ledger/core/Description.ts'
import type { IsoDate } from '@/ledger/core/IsoDate.ts'
import type { OrigId } from '@/ledger/origins/OrigId.ts'
import type { ITransactionSvc } from '@/ledger/services/transactions/ITransactionSvc.ts'
import type { AccountBalance } from '@/ledger/transactions/AccountBalance.ts'
import type { Entry, EntryToWrite } from '@/ledger/transactions/Entry.ts'
import type {
  Transaction,
  TransactionCreationEvent,
  TransactionDeletionEvent,
  TransactionPatchEvent,
} from '@/ledger/transactions/Transaction.ts'
import type { TxnId } from '@/ledger/transactions/TxnId.ts'
import type { VndrId } from '@/ledger/vendors/VndrId.ts'
import type { DbDriver, SqlValue } from '@/store/driver/DbDriver.ts'

type TransactionRow = {
  id: string
  orig_id: string
  post_date: string
  cleared_date: string | null
  code: string
  vndr_id: string | null
  description: string
  needs_review: number
}

type EntryRow = {
  acct_id: string
  debit_cents: number
  credit_cents: number
}

function rowToEntry(row: EntryRow): Entry {
  return {
    acctId: row.acct_id as AcctId,
    debit: row.debit_cents,
    credit: row.credit_cents,
  } as Entry
}

/** Clamps clearedDate up to postDate when it would otherwise be earlier -- covers both a defensive fresh
 * write (the schema-level refine in Transaction.ts already rejects this on a normal single-payload save, but
 * doesn't run during replay) and a historical replayed action from before the postDate<=clearedDate
 * constraint existed, since replay dispatches straight into createTransaction/patchTransaction below with no
 * schema re-validation in between (see ActionLog.ts's replayDispatch). Returns the (possibly adjusted)
 * clearedDate, still possibly undefined. */
function normalizeClearedDate(postDate: IsoDate, clearedDate: IsoDate | undefined): IsoDate | undefined {
  if (clearedDate !== undefined && clearedDate < postDate) return postDate
  return clearedDate
}

function rowToTransaction(row: TransactionRow, entryRows: EntryRow[]): Transaction {
  return {
    id: row.id as TxnId,
    origId: row.orig_id as OrigId,
    postDate: row.post_date as IsoDate,
    clearedDate: row.cleared_date !== null ? (row.cleared_date as IsoDate) : undefined,
    code: row.code,
    vndrId: row.vndr_id !== null ? (row.vndr_id as VndrId) : undefined,
    description: row.description as DescriptionStr,
    needsReview: row.needs_review === 1,
    entries: entryRows.map(rowToEntry),
  } as Transaction
}

/** The materialized-store half of the Transaction entity -- see documentation/materialized-store.md §4.3.
 * Entries have no domain ID of their own and are always fully replaced on a patch that touches them, so they
 * live in their own table keyed only by transaction_id + ordinal (display order). */
export class TransactionMaterializedStoreSvc implements ITransactionSvc {
  private readonly db: DbDriver

  constructor(db: DbDriver) {
    this.db = db
  }

  private insertEntries(transactionId: TxnId, entries: readonly EntryToWrite[]): void {
    entries.forEach((entry, ordinal) => {
      this.db.run(
        `INSERT INTO entries (transaction_id, ordinal, acct_id, debit_cents, credit_cents)
                 VALUES (?, ?, ?, ?, ?)`,
        [transactionId, ordinal, entry.acctId, entry.debit, entry.credit],
      )
    })
  }

  async createTransaction(transactionCreation: TransactionCreationEvent): Promise<TransactionCreationEvent | null> {
    const clearedDate = normalizeClearedDate(transactionCreation.postDate, transactionCreation.clearedDate)
    // Creating a deleted id restores it (the undo of a delete); creating a live id is an error.
    const { changes } = this.db.run(
      `INSERT INTO transactions (id, orig_id, post_date, cleared_date, code, vndr_id, description, needs_review)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET orig_id = excluded.orig_id, post_date = excluded.post_date, cleared_date = excluded.cleared_date, code = excluded.code, vndr_id = excluded.vndr_id, description = excluded.description, needs_review = excluded.needs_review, is_deleted = 0 WHERE transactions.is_deleted = 1`,
      [
        transactionCreation.id,
        transactionCreation.origId,
        transactionCreation.postDate,
        clearedDate ?? null,
        transactionCreation.code,
        transactionCreation.vndrId ?? null,
        transactionCreation.description,
        transactionCreation.needsReview ? 1 : 0,
      ],
    )
    if (changes === 0) throw new Error(`createTransaction: id ${transactionCreation.id} already exists`)
    // A restored transaction gets its entries back as given.
    this.db.run(`DELETE FROM entries WHERE transaction_id = ?`, [transactionCreation.id])
    this.insertEntries(transactionCreation.id, transactionCreation.entries)
    return transactionCreation
  }

  async patchTransaction(transactionPatch: TransactionPatchEvent): Promise<TransactionPatchEvent | null> {
    const sets: string[] = ['orig_id = ?']
    const params: SqlValue[] = [transactionPatch.origId]

    if (transactionPatch.postDate !== undefined || transactionPatch.clearedDate !== undefined) {
      // Either date is changing -- resolve both final values (falling back to what's already stored for
      // whichever one isn't part of this patch) so the postDate<=clearedDate clamp can be applied
      // correctly even when the patch only touches one of the two fields.
      const current = this.db.get(`SELECT post_date, cleared_date FROM transactions WHERE id = ?`, [
        transactionPatch.id,
      ]) as { post_date: string; cleared_date: string | null } | null
      if (!current) {
        throw new Error(`patchTransaction: no transaction with id ${transactionPatch.id}`)
      }
      const postDate = transactionPatch.postDate ?? (current.post_date as IsoDate)
      // null clears the cleared date; undefined keeps the stored one.
      const rawClearedDate =
        transactionPatch.clearedDate === null
          ? undefined
          : transactionPatch.clearedDate !== undefined
            ? transactionPatch.clearedDate
            : ((current.cleared_date ?? undefined) as IsoDate | undefined)
      const clearedDate = normalizeClearedDate(postDate, rawClearedDate)

      sets.push('post_date = ?', 'cleared_date = ?')
      params.push(postDate, clearedDate ?? null)
    }
    if (transactionPatch.code !== undefined) {
      sets.push('code = ?')
      params.push(transactionPatch.code)
    }
    if (transactionPatch.vndrId !== undefined) {
      sets.push('vndr_id = ?')
      params.push(transactionPatch.vndrId)
    }
    if (transactionPatch.description !== undefined) {
      sets.push('description = ?')
      params.push(transactionPatch.description)
    }
    if (transactionPatch.needsReview !== undefined) {
      sets.push('needs_review = ?')
      params.push(transactionPatch.needsReview ? 1 : 0)
    }
    params.push(transactionPatch.id)

    const { changes } = this.db.run(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ?`, params)
    if (changes === 0) {
      throw new Error(`patchTransaction: no transaction with id ${transactionPatch.id}`)
    }

    if (transactionPatch.entries !== undefined) {
      this.db.run(`DELETE FROM entries WHERE transaction_id = ?`, [transactionPatch.id])
      this.insertEntries(transactionPatch.id, transactionPatch.entries)
    }

    return transactionPatch
  }

  async deleteTransaction(transactionDeletion: TransactionDeletionEvent): Promise<TransactionDeletionEvent | null> {
    const { changes } = this.db.run(`UPDATE transactions SET is_deleted = 1, orig_id = ? WHERE id = ?`, [
      transactionDeletion.origId,
      transactionDeletion.id,
    ])
    if (changes === 0) {
      throw new Error(`deleteTransaction: no transaction with id ${transactionDeletion.id}`)
    }
    return transactionDeletion
  }

  private hydrate(row: TransactionRow): Transaction {
    const entryRows = this.db.all(
      `SELECT acct_id, debit_cents, credit_cents FROM entries WHERE transaction_id = ? ORDER BY ordinal`,
      [row.id],
    ) as EntryRow[]
    return rowToTransaction(row, entryRows)
  }

  async findTransactionById(transactionId: TxnId): Promise<Transaction | null> {
    const row = this.db.get(`SELECT * FROM transactions WHERE id = ?`, [transactionId]) as TransactionRow | null
    if (!row) return null
    return this.hydrate(row)
  }

  async countTransactionsAll(): Promise<number> {
    const row = this.db.get(`SELECT COUNT(*) as n FROM transactions WHERE is_deleted = 0`) as { n: number }
    return row.n
  }

  /** Every non-deleted transaction with an entry against this account, ordered oldest-first by transaction
   *  date (clearedDate when present, otherwise postDate -- see Transaction.ts's transactionDate()), then
   *  rowid as an insertion-order tie-break (the transactions table has no explicit insert-order column, but
   *  as an ordinary SQLite table it has an implicit rowid that increases with insertion). Ordering by
   *  transaction date rather than post_date matters for the tie-break: two transactions can share a
   *  transaction date via different post_date/cleared_date combinations, and the register's "last entered"
   *  tie-break (buildRegisterLineItems.ts) only comes out right if same-transaction-date rows already
   *  arrive in entry order. */
  async findTransactionsByAccount(accountId: AcctId): Promise<Transaction[]> {
    const rows = this.db.all(
      `SELECT * FROM transactions t
             WHERE t.is_deleted = 0
               AND EXISTS (SELECT 1 FROM entries e WHERE e.transaction_id = t.id AND e.acct_id = ?)
             ORDER BY COALESCE(t.cleared_date, t.post_date), t.rowid`,
      [accountId],
    ) as TransactionRow[]
    return rows.map((row) => this.hydrate(row))
  }

  /** The most recent non-deleted transaction with an entry against this account whose vndr_id matches. */
  async findLatestTransactionForVendorAndAccount(vndrId: VndrId, accountId: AcctId): Promise<Transaction | null> {
    const row = this.db.get(
      `SELECT * FROM transactions t
             WHERE t.is_deleted = 0
               AND t.vndr_id = ?
               AND EXISTS (SELECT 1 FROM entries e WHERE e.transaction_id = t.id AND e.acct_id = ?)
             ORDER BY t.post_date DESC, t.rowid DESC
             LIMIT 1`,
      [vndrId, accountId],
    ) as TransactionRow | null
    return row ? this.hydrate(row) : null
  }

  /** Net debit/credit totals per account, summed over every live entry whose transaction's post_date is on
   *  or before asOfDate. Grouped by account only -- no join out to accounts for acct_type/name, so this
   *  stays a reusable low-level primitive; see materialized-store.md §9 and buildBalanceSheet.ts for how
   *  callers turn this into a report. */
  async findAccountBalancesAsOf(asOfDate: IsoDate): Promise<AccountBalance[]> {
    const rows = this.db.all(
      `SELECT e.acct_id AS acct_id,
                    COALESCE(SUM(e.debit_cents), 0) AS debit_cents,
                    COALESCE(SUM(e.credit_cents), 0) AS credit_cents
             FROM entries e
             JOIN transactions t ON t.id = e.transaction_id
             WHERE t.is_deleted = 0 AND t.post_date <= ?
             GROUP BY e.acct_id`,
      [asOfDate],
    ) as { acct_id: string; debit_cents: number; credit_cents: number }[]
    return rows.map((row) => ({
      acctId: row.acct_id as AcctId,
      debit: row.debit_cents,
      credit: row.credit_cents,
    }))
  }

  /** Net debit/credit totals per account, summed over every live entry whose transaction's post_date falls
   *  within [startDate, endDate] inclusive -- same shape as findAccountBalancesAsOf, just bounded on both
   *  ends instead of one. Backs the Income Statement Summary. */
  async findAccountBalancesForPeriod(startDate: IsoDate, endDate: IsoDate): Promise<AccountBalance[]> {
    const rows = this.db.all(
      `SELECT e.acct_id AS acct_id,
                    COALESCE(SUM(e.debit_cents), 0) AS debit_cents,
                    COALESCE(SUM(e.credit_cents), 0) AS credit_cents
             FROM entries e
             JOIN transactions t ON t.id = e.transaction_id
             WHERE t.is_deleted = 0 AND t.post_date >= ? AND t.post_date <= ?
             GROUP BY e.acct_id`,
      [startDate, endDate],
    ) as { acct_id: string; debit_cents: number; credit_cents: number }[]
    return rows.map((row) => ({
      acctId: row.acct_id as AcctId,
      debit: row.debit_cents,
      credit: row.credit_cents,
    }))
  }

  /** Every non-deleted transaction whose post_date falls within [startDate, endDate] inclusive, oldest
   *  first (post_date, then rowid tie-break, same convention as findTransactionsByAccount). Backs the
   *  Income Statement Details view -- unscoped by which accounts a transaction touches. */
  async findTransactionsForPeriod(startDate: IsoDate, endDate: IsoDate): Promise<Transaction[]> {
    const rows = this.db.all(
      `SELECT * FROM transactions t
             WHERE t.is_deleted = 0 AND t.post_date >= ? AND t.post_date <= ?
             ORDER BY t.post_date, t.rowid`,
      [startDate, endDate],
    ) as TransactionRow[]
    return rows.map((row) => this.hydrate(row))
  }

  /** See ITransactionQrySvc.searchTransactions [FR-UI-26]. */
  async searchTransactions(text: string, cents: number | null, limit: number): Promise<Transaction[]> {
    const pattern = `%${text.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    const hasText = text.trim().length > 0
    const rows = this.db.all(
      `SELECT * FROM transactions t
       WHERE t.is_deleted = 0 AND (
         (? AND (t.description LIKE ? ESCAPE '\\' OR t.code LIKE ? ESCAPE '\\'
                 OR EXISTS (SELECT 1 FROM vendors v WHERE v.id = t.vndr_id AND v.name LIKE ? ESCAPE '\\')))
         OR (? IS NOT NULL AND EXISTS (SELECT 1 FROM entries e WHERE e.transaction_id = t.id
                                       AND (e.debit_cents = ? OR e.credit_cents = ?)))
       )
       ORDER BY t.post_date DESC, t.rowid DESC
       LIMIT ?`,
      [hasText ? 1 : 0, pattern, pattern, pattern, cents, cents, cents, limit],
    ) as TransactionRow[]
    return rows.map((row) => this.hydrate(row))
  }
}
