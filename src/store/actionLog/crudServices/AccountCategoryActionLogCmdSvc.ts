import type {
  AccountCategoryCreationEvent,
  AccountCategoryDeletionEvent,
  AccountCategoryPatchEvent,
} from '@/ledger/accountCategories/AccountCategory.ts'
import type { IAccountCategoryCmdSvc } from '@/ledger/services/accountCategories/IAccountCategoryCmdSvc.ts'
import type { ActionLog } from '@/store/actionLog/ActionLog.ts'

export class AccountCategoryActionLogCmdSvc implements IAccountCategoryCmdSvc {
  private readonly log: ActionLog

  constructor(log: ActionLog) {
    this.log = log
  }

  createAccountCategory(category: AccountCategoryCreationEvent): Promise<AccountCategoryCreationEvent | null> {
    return this.log.appendAction('create-account-category', category)
  }

  patchAccountCategory(categoryPatch: AccountCategoryPatchEvent): Promise<AccountCategoryPatchEvent | null> {
    return this.log.appendAction('update-account-category', categoryPatch)
  }

  deleteAccountCategory(categoryDeletion: AccountCategoryDeletionEvent): Promise<AccountCategoryDeletionEvent | null> {
    return this.log.appendAction('delete-account-category', categoryDeletion)
  }
}
