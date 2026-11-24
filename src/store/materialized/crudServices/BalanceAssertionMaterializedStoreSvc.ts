import type { AcctId } from '@/ledger/accounts/AcctId.ts'
import type { AsrtId } from '@/ledger/balanceAssertions/AsrtId.ts'
import type {
  BalanceAssertion,
  BalanceAssertionCreationEvent,
  BalanceAssertionDeletionEvent,
  BalanceAssertionPatchEvent,
} from '@/ledger/balanceAssertions/BalanceAssertion.ts'
import type { IsoDate } from '@/ledger/core/IsoDate.ts'
import type { OrigId } from '@/ledger/origins/OrigId.ts'
import type { IBalanceAssertionSvc } from '@/ledger/services/balanceAssertions/IBalanceAssertionSvc.ts'
import type { DbDriver, SqlValue } from '@/store/driver/DbDriver.ts'

type BalanceAssertionRow = {
  id: string
  orig_id: string
  acct_id: string
  assertion_date: string
  balance_cents: number
}

function rowToBalanceAssertion(row: BalanceAssertionRow): BalanceAssertion {
  return {
    id: row.id as AsrtId,
    origId: row.orig_id as OrigId,
    acctId: row.acct_id as AcctId,
    assertionDate: row.assertion_date as IsoDate,
    balance: row.balance_cents,
  } as BalanceAssertion
}

/** The materialized-store half of the BalanceAssertion entity -- see documentation/materialized-store.md. */
export class BalanceAssertionMaterializedStoreSvc implements IBalanceAssertionSvc {
  private readonly db: DbDriver

  constructor(db: DbDriver) {
    this.db = db
  }

  async createBalanceAssertion(
    assertionCreation: BalanceAssertionCreationEvent,
  ): Promise<BalanceAssertionCreationEvent | null> {
    // Creating a deleted id restores it (the undo of a delete); creating a live id is an error.
    const { changes } = this.db.run(
      `INSERT INTO balance_assertions (id, orig_id, acct_id, assertion_date, balance_cents)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET orig_id = excluded.orig_id, acct_id = excluded.acct_id, assertion_date = excluded.assertion_date, balance_cents = excluded.balance_cents, is_deleted = 0 WHERE balance_assertions.is_deleted = 1`,
      [
        assertionCreation.id,
        assertionCreation.origId,
        assertionCreation.acctId,
        assertionCreation.assertionDate,
        assertionCreation.balance,
      ],
    )
    if (changes === 0) throw new Error(`createBalanceAssertion: id ${assertionCreation.id} already exists`)
    return assertionCreation
  }

  async patchBalanceAssertion(assertionPatch: BalanceAssertionPatchEvent): Promise<BalanceAssertionPatchEvent | null> {
    const sets: string[] = ['orig_id = ?']
    const params: SqlValue[] = [assertionPatch.origId]

    if (assertionPatch.acctId !== undefined) {
      sets.push('acct_id = ?')
      params.push(assertionPatch.acctId)
    }
    if (assertionPatch.assertionDate !== undefined) {
      sets.push('assertion_date = ?')
      params.push(assertionPatch.assertionDate)
    }
    if (assertionPatch.balance !== undefined) {
      sets.push('balance_cents = ?')
      params.push(assertionPatch.balance)
    }
    params.push(assertionPatch.id)

    const { changes } = this.db.run(`UPDATE balance_assertions SET ${sets.join(', ')} WHERE id = ?`, params)
    if (changes === 0) {
      throw new Error(`patchBalanceAssertion: no balance assertion with id ${assertionPatch.id}`)
    }
    return assertionPatch
  }

  async deleteBalanceAssertion(
    assertionDeletion: BalanceAssertionDeletionEvent,
  ): Promise<BalanceAssertionDeletionEvent | null> {
    const { changes } = this.db.run(`UPDATE balance_assertions SET is_deleted = 1, orig_id = ? WHERE id = ?`, [
      assertionDeletion.origId,
      assertionDeletion.id,
    ])
    if (changes === 0) {
      throw new Error(`deleteBalanceAssertion: no balance assertion with id ${assertionDeletion.id}`)
    }
    return assertionDeletion
  }

  async findBalanceAssertionById(assertionId: AsrtId): Promise<BalanceAssertion | null> {
    const row = this.db.get(`SELECT * FROM balance_assertions WHERE id = ?`, [
      assertionId,
    ]) as BalanceAssertionRow | null
    return row ? rowToBalanceAssertion(row) : null
  }

  async findBalanceAssertionsAll(): Promise<BalanceAssertion[]> {
    const rows = this.db.all(
      `SELECT * FROM balance_assertions WHERE is_deleted = 0 ORDER BY assertion_date`,
    ) as BalanceAssertionRow[]
    return rows.map(rowToBalanceAssertion)
  }

  async findBalanceAssertionsByAccount(accountId: AcctId): Promise<BalanceAssertion[]> {
    const rows = this.db.all(
      `SELECT * FROM balance_assertions WHERE acct_id = ? AND is_deleted = 0 ORDER BY assertion_date`,
      [accountId],
    ) as BalanceAssertionRow[]
    return rows.map(rowToBalanceAssertion)
  }

  async countBalanceAssertionsAll(): Promise<number> {
    const row = this.db.get(`SELECT COUNT(*) as n FROM balance_assertions WHERE is_deleted = 0`) as { n: number }
    return row.n
  }
}
