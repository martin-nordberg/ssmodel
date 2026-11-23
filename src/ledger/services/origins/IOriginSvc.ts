import type { IOriginCmdSvc } from '@/ledger/services/origins/IOriginCmdSvc.ts'
import type { IOriginQrySvc } from '@/ledger/services/origins/IOriginQrySvc.ts'

export interface IOriginSvc extends IOriginQrySvc, IOriginCmdSvc {}
