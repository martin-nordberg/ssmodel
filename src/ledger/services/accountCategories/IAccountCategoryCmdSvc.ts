import type {
  AccountCategoryCreationEvent,
  AccountCategoryDeletionEvent,
  AccountCategoryPatchEvent,
} from '@/ledger/accountCategories/AccountCategory.ts'

export interface IAccountCategoryCmdSvc {
  /** Creates a new account category with given attributes. */
  createAccountCategory(category: AccountCategoryCreationEvent): Promise<AccountCategoryCreationEvent | null>

  /** Deletes a given account category. */
  deleteAccountCategory(categoryDeletion: AccountCategoryDeletionEvent): Promise<AccountCategoryDeletionEvent | null>

  /** Updates an account category's attributes. */
  patchAccountCategory(categoryPatch: AccountCategoryPatchEvent): Promise<AccountCategoryPatchEvent | null>
}
