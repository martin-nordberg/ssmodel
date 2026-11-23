import type { CmdSvcBundle } from '@/ledger/services/CmdSvcBundle.ts'
import type { QrySvcBundle } from '@/ledger/services/QrySvcBundle.ts'
import type { DbDriver } from '@/store/driver/DbDriver.ts'
import { AccountCategoryMaterializedStoreSvc } from '@/store/materialized/crudServices/AccountCategoryMaterializedStoreSvc.ts'
import { AccountMaterializedStoreSvc } from '@/store/materialized/crudServices/AccountMaterializedStoreSvc.ts'
import { BalanceAssertionMaterializedStoreSvc } from '@/store/materialized/crudServices/BalanceAssertionMaterializedStoreSvc.ts'
import { OriginMaterializedStoreSvc } from '@/store/materialized/crudServices/OriginMaterializedStoreSvc.ts'
import { TransactionMaterializedStoreSvc } from '@/store/materialized/crudServices/TransactionMaterializedStoreSvc.ts'
import { VendorMaterializedStoreSvc } from '@/store/materialized/crudServices/VendorMaterializedStoreSvc.ts'
import { createSchema } from '@/store/materialized/schema.ts'

/**
 * The in-memory, unencrypted store of *current* entity state (see documentation/materialized-store.md) -- the
 * other branch of each entity's XxxTeeSvc, alongside ActionLog, and the sole implementation of every
 * IXxxQrySvc. Always a fresh in-memory database, passed in by the caller so this module never imports a driver
 * [NFR-ARCH-9]: `new MaterializedStore(openBunDriver())` in tests, an in-memory SQLite WASM database in the worker.
 *
 * No module-level singleton state, same as ActionLog: nothing prevents constructing an extra throwaway store
 * (e.g. to answer "what's currently live?" during compaction) alongside the app's one real live store.
 */
export class MaterializedStore {
  private readonly db: DbDriver
  readonly cmdSvcs: CmdSvcBundle
  readonly qrySvcs: QrySvcBundle

  constructor(db: DbDriver) {
    this.db = db
    createSchema(this.db)

    const accounts = new AccountMaterializedStoreSvc(this.db)
    const accountCategories = new AccountCategoryMaterializedStoreSvc(this.db)
    const vendors = new VendorMaterializedStoreSvc(this.db)
    const transactions = new TransactionMaterializedStoreSvc(this.db)
    const balanceAssertions = new BalanceAssertionMaterializedStoreSvc(this.db)
    const origins = new OriginMaterializedStoreSvc(this.db)

    this.cmdSvcs = { accounts, accountCategories, vendors, transactions, balanceAssertions, origins }
    this.qrySvcs = { accounts, accountCategories, vendors, transactions, balanceAssertions, origins }
  }
}
