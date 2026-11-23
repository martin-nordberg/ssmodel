import type { IAccountCategorySvc } from '@/ledger/services/accountCategories/IAccountCategorySvc.ts'
import type { IAccountSvc } from '@/ledger/services/accounts/IAccountSvc.ts'
import type { IBalanceAssertionSvc } from '@/ledger/services/balanceAssertions/IBalanceAssertionSvc.ts'
import type { IOriginSvc } from '@/ledger/services/origins/IOriginSvc.ts'
import type { ITransactionSvc } from '@/ledger/services/transactions/ITransactionSvc.ts'
import type { IVendorSvc } from '@/ledger/services/vendors/IVendorSvc.ts'

/** One IXxxSvc per entity, grouped together -- the shape LedgerStore.svcs exposes. */
export type SvcBundle = {
  accounts: IAccountSvc
  accountCategories: IAccountCategorySvc
  vendors: IVendorSvc
  transactions: ITransactionSvc
  balanceAssertions: IBalanceAssertionSvc
  origins: IOriginSvc
}
