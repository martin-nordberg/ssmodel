import type { IVendorCmdSvc } from '@/ledger/services/vendors/IVendorCmdSvc.ts'
import type { IVendorQrySvc } from '@/ledger/services/vendors/IVendorQrySvc.ts'

export interface IVendorSvc extends IVendorQrySvc, IVendorCmdSvc {}
