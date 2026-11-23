import type {
  AccountCategory,
  AccountCategoryCreationEvent,
  AccountCategoryDeletionEvent,
  AccountCategoryPatchEvent,
} from '@/ledger/accountCategories/AccountCategory.ts'
import type { AcctCtgId } from '@/ledger/accountCategories/AcctCtgId.ts'
import type { AcctTypeStr } from '@/ledger/accounts/AcctType.ts'
import type { DescriptionStr } from '@/ledger/core/Description.ts'
import type { NameStr } from '@/ledger/core/Name.ts'
import type { OrigId } from '@/ledger/origins/OrigId.ts'
import type { IAccountCategorySvc } from '@/ledger/services/accountCategories/IAccountCategorySvc.ts'
import type { DbDriver, SqlValue } from '@/store/driver/DbDriver.ts'

type AccountCategoryRow = {
  id: string
  orig_id: string
  parent_ctg_id: string | null
  acct_type: string
  name: string
  description: string
}

function rowToAccountCategory(row: AccountCategoryRow): AccountCategory {
  return {
    id: row.id as AcctCtgId,
    origId: row.orig_id as OrigId,
    parentCtgId: row.parent_ctg_id !== null ? (row.parent_ctg_id as AcctCtgId) : undefined,
    acctType: row.acct_type as AcctTypeStr,
    name: row.name as NameStr,
    description: row.description as DescriptionStr,
  } as AccountCategory
}

/** The materialized-store half of the AccountCategory entity: current state only, in ordinary (unencrypted)
 * tables -- see documentation/materialized-store.md. Implements both IAccountCategoryQrySvc and
 * IAccountCategoryCmdSvc since one set of tables naturally serves both. */
export class AccountCategoryMaterializedStoreSvc implements IAccountCategorySvc {
  private readonly db: DbDriver

  constructor(db: DbDriver) {
    this.db = db
  }

  async createAccountCategory(category: AccountCategoryCreationEvent): Promise<AccountCategoryCreationEvent | null> {
    this.db.run(
      `INSERT INTO account_categories (id, orig_id, parent_ctg_id, acct_type, name, description)
             VALUES (?, ?, ?, ?, ?, ?)`,
      [
        category.id,
        category.origId,
        category.parentCtgId ?? null,
        category.acctType,
        category.name,
        category.description,
      ],
    )
    return category
  }

  async patchAccountCategory(categoryPatch: AccountCategoryPatchEvent): Promise<AccountCategoryPatchEvent | null> {
    const sets: string[] = ['orig_id = ?']
    const params: SqlValue[] = [categoryPatch.origId]

    if (categoryPatch.parentCtgId !== undefined) {
      sets.push('parent_ctg_id = ?')
      params.push(categoryPatch.parentCtgId)
    }
    if (categoryPatch.name !== undefined) {
      sets.push('name = ?')
      params.push(categoryPatch.name)
    }
    if (categoryPatch.description !== undefined) {
      sets.push('description = ?')
      params.push(categoryPatch.description)
    }
    params.push(categoryPatch.id)

    const { changes } = this.db.run(`UPDATE account_categories SET ${sets.join(', ')} WHERE id = ?`, params)
    if (changes === 0) {
      throw new Error(`patchAccountCategory: no account category with id ${categoryPatch.id}`)
    }
    return categoryPatch
  }

  async deleteAccountCategory(
    categoryDeletion: AccountCategoryDeletionEvent,
  ): Promise<AccountCategoryDeletionEvent | null> {
    const { changes } = this.db.run(`UPDATE account_categories SET is_deleted = 1, orig_id = ? WHERE id = ?`, [
      categoryDeletion.origId,
      categoryDeletion.id,
    ])
    if (changes === 0) {
      throw new Error(`deleteAccountCategory: no account category with id ${categoryDeletion.id}`)
    }
    return categoryDeletion
  }

  async findAccountCategoryById(acctCtgId: AcctCtgId): Promise<AccountCategory | null> {
    const row = this.db.get(`SELECT * FROM account_categories WHERE id = ?`, [acctCtgId]) as AccountCategoryRow | null
    return row ? rowToAccountCategory(row) : null
  }

  async findAccountCategoriesAll(): Promise<AccountCategory[]> {
    const rows = this.db.all(
      `SELECT * FROM account_categories WHERE is_deleted = 0 ORDER BY name`,
    ) as AccountCategoryRow[]
    return rows.map(rowToAccountCategory)
  }

  async countAccountCategoriesAll(): Promise<number> {
    const row = this.db.get(`SELECT COUNT(*) as n FROM account_categories WHERE is_deleted = 0`) as { n: number }
    return row.n
  }

  async isAccountCategoryInUse(acctCtgId: AcctCtgId): Promise<boolean> {
    const row = this.db.get(
      `SELECT (
                    EXISTS (
                        SELECT 1 FROM account_categories WHERE parent_ctg_id = ? AND is_deleted = 0
                    )
                    OR EXISTS (
                        SELECT 1 FROM accounts WHERE parent_ctg_id = ? AND is_deleted = 0
                    )
                ) AS in_use`,
      [acctCtgId, acctCtgId],
    ) as { in_use: number }
    return row.in_use === 1
  }
}
