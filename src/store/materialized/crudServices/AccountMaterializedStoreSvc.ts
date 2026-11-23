import type { AcctCtgId } from '@/ledger/accountCategories/AcctCtgId.ts'
import type {
  Account,
  AccountCreationEvent,
  AccountDeletionEvent,
  AccountPatchEvent,
} from '@/ledger/accounts/Account.ts'
import type { AcctId } from '@/ledger/accounts/AcctId.ts'
import type { AcctTypeStr } from '@/ledger/accounts/AcctType.ts'
import type { DescriptionStr } from '@/ledger/core/Description.ts'
import type { NameStr } from '@/ledger/core/Name.ts'
import type { OrigId } from '@/ledger/origins/OrigId.ts'
import type { IAccountSvc } from '@/ledger/services/accounts/IAccountSvc.ts'
import type { DbDriver, SqlValue } from '@/store/driver/DbDriver.ts'

type AccountRow = {
  id: string
  orig_id: string
  parent_ctg_id: string
  acct_type: string
  name: string
  description: string
  is_primary: number
}

function rowToAccount(row: AccountRow): Account {
  return {
    id: row.id as AcctId,
    origId: row.orig_id as OrigId,
    parentCtgId: row.parent_ctg_id as AcctCtgId,
    acctType: row.acct_type as AcctTypeStr,
    name: row.name as NameStr,
    description: row.description as DescriptionStr,
    isPrimary: row.is_primary === 1,
  } as Account
}

/** The materialized-store half of the Account entity: current state only, in ordinary (unencrypted) tables --
 * see documentation/materialized-store.md. Implements both IAccountQrySvc and IAccountCmdSvc since one set of
 * tables naturally serves both. */
export class AccountMaterializedStoreSvc implements IAccountSvc {
  private readonly db: DbDriver

  constructor(db: DbDriver) {
    this.db = db
  }

  async createAccount(account: AccountCreationEvent): Promise<AccountCreationEvent | null> {
    this.db.run(
      `INSERT INTO accounts (id, orig_id, parent_ctg_id, acct_type, name, description, is_primary)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        account.id,
        account.origId,
        account.parentCtgId,
        account.acctType,
        account.name,
        account.description,
        account.isPrimary ? 1 : 0,
      ],
    )
    return account
  }

  async patchAccount(accountPatch: AccountPatchEvent): Promise<AccountPatchEvent | null> {
    const sets: string[] = ['orig_id = ?']
    const params: SqlValue[] = [accountPatch.origId]

    if (accountPatch.parentCtgId !== undefined) {
      sets.push('parent_ctg_id = ?')
      params.push(accountPatch.parentCtgId)
    }
    if (accountPatch.name !== undefined) {
      sets.push('name = ?')
      params.push(accountPatch.name)
    }
    if (accountPatch.description !== undefined) {
      sets.push('description = ?')
      params.push(accountPatch.description)
    }
    if (accountPatch.isPrimary !== undefined) {
      sets.push('is_primary = ?')
      params.push(accountPatch.isPrimary ? 1 : 0)
    }
    params.push(accountPatch.id)

    const { changes } = this.db.run(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`, params)
    if (changes === 0) {
      throw new Error(`patchAccount: no account with id ${accountPatch.id}`)
    }
    return accountPatch
  }

  async deleteAccount(accountDeletion: AccountDeletionEvent): Promise<AccountDeletionEvent | null> {
    const { changes } = this.db.run(`UPDATE accounts SET is_deleted = 1, orig_id = ? WHERE id = ?`, [
      accountDeletion.origId,
      accountDeletion.id,
    ])
    if (changes === 0) {
      throw new Error(`deleteAccount: no account with id ${accountDeletion.id}`)
    }
    return accountDeletion
  }

  async findAccountById(accountId: AcctId): Promise<Account | null> {
    const row = this.db.get(`SELECT * FROM accounts WHERE id = ?`, [accountId]) as AccountRow | null
    return row ? rowToAccount(row) : null
  }

  async findAccountsAll(): Promise<Account[]> {
    const rows = this.db.all(`SELECT * FROM accounts WHERE is_deleted = 0 ORDER BY name`) as AccountRow[]
    return rows.map(rowToAccount)
  }

  async countAccountsAll(): Promise<number> {
    const row = this.db.get(`SELECT COUNT(*) as n FROM accounts WHERE is_deleted = 0`) as { n: number }
    return row.n
  }

  async isAccountInUse(accountId: AcctId): Promise<boolean> {
    const row = this.db.get(
      `SELECT (
                    EXISTS (
                        SELECT 1 FROM entries e JOIN transactions t ON t.id = e.transaction_id
                        WHERE e.acct_id = ? AND t.is_deleted = 0
                    )
                    OR EXISTS (
                        SELECT 1 FROM vendors WHERE default_acct_id = ? AND is_deleted = 0
                    )
                ) AS in_use`,
      [accountId, accountId],
    ) as { in_use: number }
    return row.in_use === 1
  }
}
