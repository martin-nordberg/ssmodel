import type { AccountCreationEvent, AccountDeletionEvent, AccountPatchEvent } from '@/ledger/accounts/Account.ts'
import type { IAccountCmdSvc } from '@/ledger/services/accounts/IAccountCmdSvc.ts'
import type { ActionLog } from '@/store/actionLog/ActionLog.ts'

export class AccountActionLogCmdSvc implements IAccountCmdSvc {
  private readonly log: ActionLog

  constructor(log: ActionLog) {
    this.log = log
  }

  createAccount(account: AccountCreationEvent): Promise<AccountCreationEvent | null> {
    return this.log.appendAction('create-account', account)
  }

  patchAccount(accountPatch: AccountPatchEvent): Promise<AccountPatchEvent | null> {
    return this.log.appendAction('update-account', accountPatch)
  }

  deleteAccount(accountDeletion: AccountDeletionEvent): Promise<AccountDeletionEvent | null> {
    return this.log.appendAction('delete-account', accountDeletion)
  }
}
