import type {
  TransactionCreationEvent,
  TransactionDeletionEvent,
  TransactionPatchEvent,
} from '@/ledger/transactions/Transaction.ts'

export interface ITransactionCmdSvc {
  /** Creates a new transaction with given attributes. */
  createTransaction(transactionCreation: TransactionCreationEvent): Promise<TransactionCreationEvent | null>

  /** Deletes a given transaction. */
  deleteTransaction(transactionDeletion: TransactionDeletionEvent): Promise<TransactionDeletionEvent | null>

  /** Updates a transaction's attributes. */
  patchTransaction(transactionPatch: TransactionPatchEvent): Promise<TransactionPatchEvent | null>
}
