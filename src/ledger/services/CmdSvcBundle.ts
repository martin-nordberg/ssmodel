import type { IAccountCategoryCmdSvc } from '@/ledger/services/accountCategories/IAccountCategoryCmdSvc.ts'
import type { IAccountCmdSvc } from '@/ledger/services/accounts/IAccountCmdSvc.ts'
import type { IBalanceAssertionCmdSvc } from '@/ledger/services/balanceAssertions/IBalanceAssertionCmdSvc.ts'
import type { IOriginCmdSvc } from '@/ledger/services/origins/IOriginCmdSvc.ts'
import type { ITransactionCmdSvc } from '@/ledger/services/transactions/ITransactionCmdSvc.ts'
import type { IVendorCmdSvc } from '@/ledger/services/vendors/IVendorCmdSvc.ts'

/** One IXxxCmdSvc per entity, grouped together -- the shape both ActionLog.replayInto's target and every
 * XxxTeeSvc's per-entity cmdSvcs ultimately share. */
export type CmdSvcBundle = {
  accounts: IAccountCmdSvc
  accountCategories: IAccountCategoryCmdSvc
  vendors: IVendorCmdSvc
  transactions: ITransactionCmdSvc
  balanceAssertions: IBalanceAssertionCmdSvc
  origins: IOriginCmdSvc
}
