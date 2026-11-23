import type {
  BalanceAssertionCreationEvent,
  BalanceAssertionDeletionEvent,
  BalanceAssertionPatchEvent,
} from '@/ledger/balanceAssertions/BalanceAssertion.ts'
import type { IBalanceAssertionCmdSvc } from '@/ledger/services/balanceAssertions/IBalanceAssertionCmdSvc.ts'
import type { ActionLog } from '@/store/actionLog/ActionLog.ts'

export class BalanceAssertionActionLogCmdSvc implements IBalanceAssertionCmdSvc {
  private readonly log: ActionLog

  constructor(log: ActionLog) {
    this.log = log
  }

  createBalanceAssertion(
    assertionCreation: BalanceAssertionCreationEvent,
  ): Promise<BalanceAssertionCreationEvent | null> {
    return this.log.appendAction('create-balance-assertion', assertionCreation)
  }

  patchBalanceAssertion(assertionPatch: BalanceAssertionPatchEvent): Promise<BalanceAssertionPatchEvent | null> {
    return this.log.appendAction('update-balance-assertion', assertionPatch)
  }

  deleteBalanceAssertion(
    assertionDeletion: BalanceAssertionDeletionEvent,
  ): Promise<BalanceAssertionDeletionEvent | null> {
    return this.log.appendAction('delete-balance-assertion', assertionDeletion)
  }
}
