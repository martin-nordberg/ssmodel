import { describe, expect, it } from 'bun:test'
import { accountCategoryCreationEventSchema } from '@/ledger/accountCategories/AccountCategory.ts'
import { genAcctCtgId } from '@/ledger/accountCategories/AcctCtgId.ts'
import { acctCtgIdAssets } from '@/ledger/accountCategories/AcctCtgRoot.ts'
import { accountCreationEventSchema, accountPatchEventSchema } from '@/ledger/accounts/Account.ts'
import { genAcctId } from '@/ledger/accounts/AcctId.ts'
import { genAsrtId } from '@/ledger/balanceAssertions/AsrtId.ts'
import { balanceAssertionCreationEventSchema } from '@/ledger/balanceAssertions/BalanceAssertion.ts'
import { genOrigId } from '@/ledger/origins/OrigId.ts'
import { originCreationEventSchema } from '@/ledger/origins/Origin.ts'
import { transactionCreationEventSchema } from '@/ledger/transactions/Transaction.ts'
import { genTxnId } from '@/ledger/transactions/TxnId.ts'
import { vendorCreationEventSchema, vendorDeletionEventSchema } from '@/ledger/vendors/Vendor.ts'
import { genVndrId } from '@/ledger/vendors/VndrId.ts'
import { openBunDriver } from '@/store/driver/bunSqlite.ts'
import { MaterializedStore } from '@/store/materialized/MaterializedStore.ts'
import { createInMemoryActionLog } from '../actionLog/inMemory.ts'

describe('MaterializedStore construction', () => {
  it('produces working, empty cmdSvcs/qrySvcs bundles', async () => {
    const store = new MaterializedStore(openBunDriver())
    expect(await store.qrySvcs.accounts.findAccountsAll()).toEqual([])
    expect(await store.qrySvcs.accountCategories.findAccountCategoriesAll()).toEqual([])
    expect(await store.qrySvcs.vendors.findVendorsAll()).toEqual([])
    expect(await store.qrySvcs.balanceAssertions.findBalanceAssertionsAll()).toEqual([])
    expect(await store.qrySvcs.origins.findOriginsAll()).toEqual([])
  })

  it('constructs independent instances -- writing to one does not affect another', async () => {
    const storeA = new MaterializedStore(openBunDriver())
    const storeB = new MaterializedStore(openBunDriver())

    const origin = originCreationEventSchema.parse({ id: genOrigId(), name: 'Jane', ipAddress: '1.2.3.4' })
    await storeA.cmdSvcs.origins.createOrigin(origin)

    expect(await storeA.qrySvcs.origins.findOriginsAll()).toHaveLength(1)
    expect(await storeB.qrySvcs.origins.findOriginsAll()).toHaveLength(0)
  })
})

describe('replaying an ActionLog into a MaterializedStore', () => {
  it('leaves the store reflecting the fully-replayed state across every entity', async () => {
    const actionLog = createInMemoryActionLog()

    const acctId = genAcctId()
    const acctId2 = genAcctId()
    const acctCtgId = genAcctCtgId()
    const vndrId = genVndrId()
    const txnId = genTxnId()
    const asrtId = genAsrtId()
    const origId = genOrigId()

    // Live user activity, appended straight through the log -- exactly what a real XxxTeeSvc would do.
    await actionLog.cmdSvcs.origins.createOrigin(
      originCreationEventSchema.parse({ id: origId, name: 'Jane', ipAddress: '10.0.0.1' }),
    )
    await actionLog.cmdSvcs.accountCategories.createAccountCategory(
      accountCategoryCreationEventSchema.parse({
        id: acctCtgId,
        origId,
        parentCtgId: acctCtgIdAssets,
        acctType: 'ASSET',
        name: 'Bank Accounts',
      }),
    )
    await actionLog.cmdSvcs.accounts.createAccount(
      accountCreationEventSchema.parse({
        id: acctId,
        origId,
        parentCtgId: acctCtgId,
        acctType: 'ASSET',
        name: 'Checking',
      }),
    )
    await actionLog.cmdSvcs.accounts.createAccount(
      accountCreationEventSchema.parse({
        id: acctId2,
        origId,
        parentCtgId: acctCtgId,
        acctType: 'ASSET',
        name: 'Savings',
      }),
    )
    await actionLog.cmdSvcs.accounts.patchAccount(
      accountPatchEventSchema.parse({ id: acctId, origId, name: 'Primary Checking' }),
    )
    await actionLog.cmdSvcs.vendors.createVendor(
      vendorCreationEventSchema.parse({ id: vndrId, origId, name: 'Acme Corp' }),
    )
    const deletedVndrId = genVndrId()
    await actionLog.cmdSvcs.vendors.createVendor(
      vendorCreationEventSchema.parse({ id: deletedVndrId, origId, name: 'Gone Vendor' }),
    )
    await actionLog.cmdSvcs.vendors.deleteVendor(vendorDeletionEventSchema.parse({ id: deletedVndrId, origId }))
    await actionLog.cmdSvcs.transactions.createTransaction(
      transactionCreationEventSchema.parse({
        id: txnId,
        origId,
        postDate: '2026-01-15',
        vndrId,
        entries: [
          { acctId, debit: 5000, credit: 0 },
          { acctId: acctId2, debit: 0, credit: 5000 },
        ],
      }),
    )
    await actionLog.cmdSvcs.balanceAssertions.createBalanceAssertion(
      balanceAssertionCreationEventSchema.parse({
        id: asrtId,
        origId,
        acctId,
        assertionDate: '2026-01-31',
        balance: 5000,
      }),
    )

    const store = new MaterializedStore(openBunDriver())
    await actionLog.replayInto(store.cmdSvcs)

    const account = await store.qrySvcs.accounts.findAccountById(acctId)
    expect(account!.name as string).toBe('Primary Checking')

    const allAccounts = await store.qrySvcs.accounts.findAccountsAll()
    expect(allAccounts).toHaveLength(2)

    const category = await store.qrySvcs.accountCategories.findAccountCategoryById(acctCtgId)
    expect(category!.name as string).toBe('Bank Accounts')

    const vendor = await store.qrySvcs.vendors.findVendorById(vndrId)
    expect(vendor!.name as string).toBe('Acme Corp')

    // The deleted vendor still resolves by id (soft-delete asymmetry) but is excluded from findVendorsAll.
    const deletedVendor = await store.qrySvcs.vendors.findVendorById(deletedVndrId)
    expect(deletedVendor).not.toBeNull()
    const allVendors = await store.qrySvcs.vendors.findVendorsAll()
    expect(allVendors.map((v) => v.id)).not.toContain(deletedVndrId)

    const transaction = await store.qrySvcs.transactions.findTransactionById(txnId)
    expect(transaction!.vndrId).toBe(vndrId)
    expect(transaction!.entries).toHaveLength(2)

    const assertions = await store.qrySvcs.balanceAssertions.findBalanceAssertionsAll()
    expect(assertions).toHaveLength(1)
    expect(assertions[0]!.balance).toBe(5000)

    const origin = await store.qrySvcs.origins.findOriginById(origId)
    expect(origin!.name as string).toBe('Jane')

    // The account is now in use (live transaction entry) -- proves cross-entity queries work post-replay.
    expect(await store.qrySvcs.accounts.isAccountInUse(acctId)).toBe(true)
    expect(await store.qrySvcs.vendors.isVendorInUse(vndrId)).toBe(true)
  })
})
