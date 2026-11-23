import type { Account } from '@/ledger/accounts/Account.ts'
import type { AcctId } from '@/ledger/accounts/AcctId.ts'

export interface IAccountQrySvc {
  /** Finds the account with given unique ID */
  findAccountById(accountId: AcctId): Promise<Account | null>

  /** Finds the entire list of accounts */
  findAccountsAll(): Promise<Account[]>

  /** Counts non-deleted accounts. */
  countAccountsAll(): Promise<number>

  /** Checks if an account is used in any transaction entry or default for a vendor. */
  isAccountInUse(accountId: AcctId): Promise<boolean>
}
