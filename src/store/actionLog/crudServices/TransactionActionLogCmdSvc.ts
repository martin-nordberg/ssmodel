import type { ITransactionCmdSvc } from '@/ledger/services/transactions/ITransactionCmdSvc.ts'
import type {
  TransactionCreationEvent,
  TransactionDeletionEvent,
  TransactionPatchEvent,
} from '@/ledger/transactions/Transaction.ts'
import type { ActionLog } from '@/store/actionLog/ActionLog.ts'

export class TransactionActionLogCmdSvc implements ITransactionCmdSvc {
  private readonly log: ActionLog

  constructor(log: ActionLog) {
    this.log = log
  }

  createTransaction(transactionCreation: TransactionCreationEvent): Promise<TransactionCreationEvent | null> {
    return this.log.appendAction('create-transaction', transactionCreation)
  }

  patchTransaction(transactionPatch: TransactionPatchEvent): Promise<TransactionPatchEvent | null> {
    return this.log.appendAction('update-transaction', transactionPatch)
  }

  deleteTransaction(transactionDeletion: TransactionDeletionEvent): Promise<TransactionDeletionEvent | null> {
    return this.log.appendAction('delete-transaction', transactionDeletion)
  }
}
