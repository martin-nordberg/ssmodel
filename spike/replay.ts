import type { Database } from '@sqlite.org/sqlite-wasm'
import type { Account, Balance } from './totals.ts'

// Replays decrypted Checquery actions into an in-memory copy of the materialized store's ledger tables
// [NFR-ARCH-10] and runs Checquery's balance queries (TransactionMaterializedStoreSvc's
// findAccountBalancesAsOf / findAccountBalancesForPeriod). Only what the statements need is materialized:
// accounts, transactions and entries. Other entities are counted and skipped.

export const ledgerSchema = `
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY, acct_type TEXT NOT NULL, is_deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE transactions (
    id TEXT PRIMARY KEY, post_date TEXT NOT NULL, is_deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX transactions_post_date_idx ON transactions (post_date);
  CREATE TABLE entries (
    id INTEGER PRIMARY KEY, transaction_id TEXT NOT NULL, ordinal INTEGER NOT NULL, acct_id TEXT NOT NULL,
    debit_cents INTEGER NOT NULL, credit_cents INTEGER NOT NULL
  );
  CREATE INDEX entries_transaction_id_idx ON entries (transaction_id);
  CREATE INDEX entries_acct_id_idx ON entries (acct_id);
`

/** Checquery's toCents: `$1,234.56` → 123456, `($1.00)` → -100. */
export function toCents(amount: string): number {
  if (amount.startsWith('(') && amount.endsWith(')')) return -toCents(amount.slice(1, -1))
  return Number.parseInt(amount.replace(/[$,.]/g, ''), 10)
}

interface EntryPayload {
  acctId: string
  debit?: string
  credit?: string
}

interface Payload {
  id: string
  acctType?: string
  postDate?: string
  entries?: EntryPayload[]
}

export class LedgerReplay {
  readonly counts: Record<string, number> = {}

  constructor(private readonly db: Database) {
    db.exec(ledgerSchema)
  }

  private insertEntries(txnId: string, entries: EntryPayload[]) {
    entries.forEach((e, ordinal) => {
      this.db.exec({
        sql: 'INSERT INTO entries (transaction_id, ordinal, acct_id, debit_cents, credit_cents) VALUES (?, ?, ?, ?, ?)',
        bind: [txnId, ordinal, e.acctId, toCents(e.debit ?? '$0.00'), toCents(e.credit ?? '$0.00')],
      })
    })
  }

  private mustChange(what: string, id: string) {
    if (this.db.changes() === 0) throw new Error(`${what}: no row with id ${id}`)
  }

  apply(actionType: string, payloadJson: string): void {
    this.counts[actionType] = (this.counts[actionType] ?? 0) + 1
    const p = JSON.parse(payloadJson) as Payload
    switch (actionType) {
      case 'create-account':
        this.db.exec({ sql: 'INSERT INTO accounts (id, acct_type) VALUES (?, ?)', bind: [p.id, p.acctType] })
        return
      case 'update-account':
        this.db.exec({ sql: 'UPDATE accounts SET id = id WHERE id = ?', bind: [p.id] })
        this.mustChange(actionType, p.id)
        return
      case 'delete-account':
        this.db.exec({ sql: 'UPDATE accounts SET is_deleted = 1 WHERE id = ?', bind: [p.id] })
        this.mustChange(actionType, p.id)
        return
      case 'create-transaction':
        this.db.exec({ sql: 'INSERT INTO transactions (id, post_date) VALUES (?, ?)', bind: [p.id, p.postDate] })
        this.insertEntries(p.id, p.entries ?? [])
        return
      case 'update-transaction':
        this.db.exec({ sql: 'UPDATE transactions SET id = id WHERE id = ?', bind: [p.id] })
        this.mustChange(actionType, p.id)
        if (p.postDate !== undefined)
          this.db.exec({ sql: 'UPDATE transactions SET post_date = ? WHERE id = ?', bind: [p.postDate, p.id] })
        if (p.entries !== undefined) {
          this.db.exec({ sql: 'DELETE FROM entries WHERE transaction_id = ?', bind: [p.id] })
          this.insertEntries(p.id, p.entries)
        }
        return
      case 'delete-transaction':
        this.db.exec({ sql: 'UPDATE transactions SET is_deleted = 1 WHERE id = ?', bind: [p.id] })
        this.mustChange(actionType, p.id)
        return
      default:
        // Categories, vendors, balance assertions and origins don't affect statement totals.
        return
    }
  }

  liveAccounts(): Account[] {
    return this.db
      .selectObjects('SELECT id, acct_type FROM accounts WHERE is_deleted = 0')
      .map((r) => ({ id: r.id as string, acctType: r.acct_type as string }))
  }

  private balances(where: string, bind: string[]): Balance[] {
    return this.db
      .selectObjects(
        `SELECT e.acct_id AS acct_id,
                COALESCE(SUM(e.debit_cents), 0) AS debit_cents,
                COALESCE(SUM(e.credit_cents), 0) AS credit_cents
         FROM entries e
         JOIN transactions t ON t.id = e.transaction_id
         WHERE t.is_deleted = 0 AND ${where}
         GROUP BY e.acct_id`,
        bind,
      )
      .map((r) => ({
        acctId: r.acct_id as string,
        debitCents: Number(r.debit_cents),
        creditCents: Number(r.credit_cents),
      }))
  }

  balancesAsOf(date: string): Balance[] {
    return this.balances('t.post_date <= ?', [date])
  }

  balancesForPeriod(start: string, end: string): Balance[] {
    return this.balances('t.post_date >= ? AND t.post_date <= ?', [start, end])
  }
}
