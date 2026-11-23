import type { IAccountCategoryQrySvc } from '@/ledger/services/accountCategories/IAccountCategoryQrySvc.ts'
import type { IAccountQrySvc } from '@/ledger/services/accounts/IAccountQrySvc.ts'
import type { IBalanceAssertionQrySvc } from '@/ledger/services/balanceAssertions/IBalanceAssertionQrySvc.ts'
import type { IOriginQrySvc } from '@/ledger/services/origins/IOriginQrySvc.ts'
import type { ITransactionQrySvc } from '@/ledger/services/transactions/ITransactionQrySvc.ts'
import type { IVendorQrySvc } from '@/ledger/services/vendors/IVendorQrySvc.ts'

/** One IXxxQrySvc per entity, grouped together -- the shape MaterializedStore.qrySvcs exposes. */
export type QrySvcBundle = {
  accounts: IAccountQrySvc
  accountCategories: IAccountCategoryQrySvc
  vendors: IVendorQrySvc
  transactions: ITransactionQrySvc
  balanceAssertions: IBalanceAssertionQrySvc
  origins: IOriginQrySvc
}
