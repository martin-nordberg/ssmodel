import type { AccountCategory } from '@/ledger/accountCategories/AccountCategory.ts'
import type { AcctCtgId } from '@/ledger/accountCategories/AcctCtgId.ts'

export interface IAccountCategoryQrySvc {
  /** Finds the account category with given unique ID */
  findAccountCategoryById(acctCtgId: AcctCtgId): Promise<AccountCategory | null>

  /** Finds the entire list of account categories */
  findAccountCategoriesAll(): Promise<AccountCategory[]>

  /** Counts non-deleted account categories. */
  countAccountCategoriesAll(): Promise<number>

  /** Checks if a category has any live child category or child account -- can't be deleted if so. */
  isAccountCategoryInUse(acctCtgId: AcctCtgId): Promise<boolean>
}
