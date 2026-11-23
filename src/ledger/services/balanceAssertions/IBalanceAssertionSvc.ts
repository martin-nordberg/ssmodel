import type { IBalanceAssertionCmdSvc } from '@/ledger/services/balanceAssertions/IBalanceAssertionCmdSvc.ts'
import type { IBalanceAssertionQrySvc } from '@/ledger/services/balanceAssertions/IBalanceAssertionQrySvc.ts'

export interface IBalanceAssertionSvc extends IBalanceAssertionQrySvc, IBalanceAssertionCmdSvc {}
