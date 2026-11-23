import type { ITransactionCmdSvc } from '@/ledger/services/transactions/ITransactionCmdSvc.ts'
import type { ITransactionQrySvc } from '@/ledger/services/transactions/ITransactionQrySvc.ts'

export interface ITransactionSvc extends ITransactionQrySvc, ITransactionCmdSvc {}
