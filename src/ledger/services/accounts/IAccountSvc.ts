import type { IAccountCmdSvc } from '@/ledger/services/accounts/IAccountCmdSvc.ts'
import type { IAccountQrySvc } from '@/ledger/services/accounts/IAccountQrySvc.ts'

export interface IAccountSvc extends IAccountQrySvc, IAccountCmdSvc {}
