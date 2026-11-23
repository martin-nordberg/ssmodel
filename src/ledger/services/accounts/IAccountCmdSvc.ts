import type { AccountCreationEvent, AccountDeletionEvent, AccountPatchEvent } from '@/ledger/accounts/Account.ts'

export interface IAccountCmdSvc {
  /** Creates a new account with given attributes. */
  createAccount(account: AccountCreationEvent): Promise<AccountCreationEvent | null>

  /** Deletes a given account. */
  deleteAccount(accountDeletion: AccountDeletionEvent): Promise<AccountDeletionEvent | null>

  /** Updates an account's attributes. */
  patchAccount(accountPatch: AccountPatchEvent): Promise<AccountPatchEvent | null>
}
