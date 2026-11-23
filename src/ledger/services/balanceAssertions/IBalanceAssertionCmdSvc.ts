import type {
  BalanceAssertionCreationEvent,
  BalanceAssertionDeletionEvent,
  BalanceAssertionPatchEvent,
} from '@/ledger/balanceAssertions/BalanceAssertion.ts'

export interface IBalanceAssertionCmdSvc {
  /** Creates a new balance assertion with given attributes. */
  createBalanceAssertion(
    assertionCreation: BalanceAssertionCreationEvent,
  ): Promise<BalanceAssertionCreationEvent | null>

  /** Deletes a given balance assertion. */
  deleteBalanceAssertion(
    assertionDeletion: BalanceAssertionDeletionEvent,
  ): Promise<BalanceAssertionDeletionEvent | null>

  /** Updates a balance assertion's attributes. */
  patchBalanceAssertion(assertionPatch: BalanceAssertionPatchEvent): Promise<BalanceAssertionPatchEvent | null>
}
