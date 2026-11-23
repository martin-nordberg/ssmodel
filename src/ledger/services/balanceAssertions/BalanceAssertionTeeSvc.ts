import type { AcctId } from '@/ledger/accounts/AcctId.ts'
import type { AsrtId } from '@/ledger/balanceAssertions/AsrtId.ts'
import type {
  BalanceAssertion,
  BalanceAssertionCreationEvent,
  BalanceAssertionDeletionEvent,
  BalanceAssertionPatchEvent,
} from '@/ledger/balanceAssertions/BalanceAssertion.ts'
import type { IBalanceAssertionCmdSvc } from '@/ledger/services/balanceAssertions/IBalanceAssertionCmdSvc.ts'
import type { IBalanceAssertionQrySvc } from '@/ledger/services/balanceAssertions/IBalanceAssertionQrySvc.ts'
import type { IBalanceAssertionSvc } from '@/ledger/services/balanceAssertions/IBalanceAssertionSvc.ts'

export class BalanceAssertionTeeSvc implements IBalanceAssertionSvc {
  private readonly qrySvc: IBalanceAssertionQrySvc
  private readonly cmdSvcs: IBalanceAssertionCmdSvc[]

  constructor(qrySvc: IBalanceAssertionQrySvc, cmdSvcs: IBalanceAssertionCmdSvc[]) {
    this.qrySvc = qrySvc
    this.cmdSvcs = cmdSvcs
  }

  /** Creates a new balance assertion with given attributes. */
  async createBalanceAssertion(
    assertionCreation: BalanceAssertionCreationEvent,
  ): Promise<BalanceAssertionCreationEvent | null> {
    let result: BalanceAssertionCreationEvent | null = assertionCreation
    for (const svc of this.cmdSvcs) {
      result = result ? await svc.createBalanceAssertion(result) : null
    }
    return result
  }

  /** Deletes a given balance assertion. */
  async deleteBalanceAssertion(
    assertionDeletion: BalanceAssertionDeletionEvent,
  ): Promise<BalanceAssertionDeletionEvent | null> {
    let result: BalanceAssertionDeletionEvent | null = assertionDeletion
    for (const svc of this.cmdSvcs) {
      result = result ? await svc.deleteBalanceAssertion(result) : null
    }
    return result
  }

  /** Finds the balance assertion with given unique ID */
  async findBalanceAssertionById(assertionId: AsrtId): Promise<BalanceAssertion | null> {
    return this.qrySvc.findBalanceAssertionById(assertionId)
  }

  /** Finds the entire list of balance assertions */
  async findBalanceAssertionsAll(): Promise<BalanceAssertion[]> {
    return this.qrySvc.findBalanceAssertionsAll()
  }

  /** Every non-deleted balance assertion for this account. */
  async findBalanceAssertionsByAccount(accountId: AcctId): Promise<BalanceAssertion[]> {
    return this.qrySvc.findBalanceAssertionsByAccount(accountId)
  }

  /** Counts non-deleted balance assertions. */
  async countBalanceAssertionsAll(): Promise<number> {
    return this.qrySvc.countBalanceAssertionsAll()
  }

  /** Updates a balance assertion's attributes. */
  async patchBalanceAssertion(assertionPatch: BalanceAssertionPatchEvent): Promise<BalanceAssertionPatchEvent | null> {
    let result: BalanceAssertionPatchEvent | null = assertionPatch
    for (const svc of this.cmdSvcs) {
      result = result ? await svc.patchBalanceAssertion(result) : null
    }
    return result
  }
}
