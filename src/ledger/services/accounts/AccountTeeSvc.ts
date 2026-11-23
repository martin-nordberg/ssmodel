import type {
  Account,
  AccountCreationEvent,
  AccountDeletionEvent,
  AccountPatchEvent,
} from '@/ledger/accounts/Account.ts'
import type { AcctId } from '@/ledger/accounts/AcctId.ts'
import type { IAccountCmdSvc } from '@/ledger/services/accounts/IAccountCmdSvc.ts'
import type { IAccountQrySvc } from '@/ledger/services/accounts/IAccountQrySvc.ts'
import type { IAccountSvc } from '@/ledger/services/accounts/IAccountSvc.ts'

export class AccountTeeSvc implements IAccountSvc {
  private readonly qrySvc: IAccountQrySvc
  private readonly cmdSvcs: IAccountCmdSvc[]

  constructor(qrySvc: IAccountQrySvc, cmdSvcs: IAccountCmdSvc[]) {
    this.qrySvc = qrySvc
    this.cmdSvcs = cmdSvcs
  }

  /** Creates a new account with given attributes. */
  async createAccount(accountCreation: AccountCreationEvent): Promise<AccountCreationEvent | null> {
    let result: AccountCreationEvent | null = accountCreation
    for (const svc of this.cmdSvcs) {
      result = result ? await svc.createAccount(result) : null
    }
    return result
  }

  /** Deletes a given account. */
  async deleteAccount(accountDeletion: AccountDeletionEvent): Promise<AccountDeletionEvent | null> {
    let result: AccountDeletionEvent | null = accountDeletion
    for (const svc of this.cmdSvcs) {
      result = result ? await svc.deleteAccount(result) : null
    }
    return result
  }

  /** Finds the account with given unique ID */
  async findAccountById(accountId: AcctId): Promise<Account | null> {
    return this.qrySvc.findAccountById(accountId)
  }

  /** Finds the entire list of accounts */
  async findAccountsAll(): Promise<Account[]> {
    return this.qrySvc.findAccountsAll()
  }

  /** Counts non-deleted accounts. */
  async countAccountsAll(): Promise<number> {
    return this.qrySvc.countAccountsAll()
  }

  /** Checks if an account is used in any transaction entry or default for a vendor. */
  async isAccountInUse(accountId: AcctId): Promise<boolean> {
    return this.qrySvc.isAccountInUse(accountId)
  }

  /** Updates an account's attributes. */
  async patchAccount(accountPatch: AccountPatchEvent): Promise<AccountPatchEvent | null> {
    let result: AccountPatchEvent | null = accountPatch
    for (const svc of this.cmdSvcs) {
      result = result ? await svc.patchAccount(result) : null
    }
    return result
  }
}
