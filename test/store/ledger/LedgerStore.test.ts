import { describe, expect, it } from 'bun:test'
import { genAcctCtgId } from '@/ledger/accountCategories/AcctCtgId.ts'
import {
  accountCreationEventSchema,
  accountDeletionEventSchema,
  accountPatchEventSchema,
} from '@/ledger/accounts/Account.ts'
import { genAcctId } from '@/ledger/accounts/AcctId.ts'
import { genOrigId } from '@/ledger/origins/OrigId.ts'
import { originCreationEventSchema } from '@/ledger/origins/Origin.ts'
import { vendorCreationEventSchema } from '@/ledger/vendors/Vendor.ts'
import { genVndrId } from '@/ledger/vendors/VndrId.ts'
import { openBunDriver } from '@/store/driver/bunSqlite.ts'
import { LedgerStore } from '@/store/ledger/LedgerStore.ts'
import { MaterializedStore } from '@/store/materialized/MaterializedStore.ts'
import { collect, createInMemoryActionLog } from '../actionLog/inMemory.ts'

function makeOrigin() {
  return originCreationEventSchema.parse({ id: genOrigId(), name: 'Tester', ipAddress: '127.0.0.1' })
}

describe('LedgerStore', () => {
  describe('round trip', () => {
    it('a write through svcs is queryable from svcs and recorded in the action log with a matching hlc', async () => {
      const actionLog = createInMemoryActionLog()
      const store = await LedgerStore.open(actionLog, new MaterializedStore(openBunDriver()))

      const origin = makeOrigin()
      const event = accountCreationEventSchema.parse({
        id: genAcctId(),
        origId: origin.id,
        parentCtgId: genAcctCtgId(),
        acctType: 'ASSET',
        name: 'Checking',
      })

      const result = await store.svcs.accounts.createAccount(event)
      expect(result).not.toBeNull()
      expect(result!.hlc).toBeDefined()

      const found = await store.svcs.accounts.findAccountById(event.id)
      expect(found).not.toBeNull()
      expect(found!.name as string).toBe('Checking')

      const [action] = await collect(actionLog.readActionsForAccount(event.id))
      expect(action!.actionType).toBe('create-account')
      expect(action!.hlc).toBe(result!.hlc!)
    })
  })

  describe('replay on open', () => {
    it('hydrates a fresh MaterializedStore from actions already in the log, across entity types', async () => {
      const actionLog = createInMemoryActionLog()
      const origin = await actionLog.cmdSvcs.origins.createOrigin(makeOrigin())

      const account = accountCreationEventSchema.parse({
        id: genAcctId(),
        origId: origin!.id,
        parentCtgId: genAcctCtgId(),
        acctType: 'ASSET',
        name: 'Pre-existing Account',
      })
      await actionLog.cmdSvcs.accounts.createAccount(account)

      const vendor = vendorCreationEventSchema.parse({
        id: genVndrId(),
        origId: origin!.id,
        name: 'Pre-existing Vendor',
      })
      await actionLog.cmdSvcs.vendors.createVendor(vendor)

      const store = await LedgerStore.open(actionLog, new MaterializedStore(openBunDriver()))

      const accounts = await store.svcs.accounts.findAccountsAll()
      expect(accounts.map((a) => a.name as string)).toContain('Pre-existing Account')

      const vendors = await store.svcs.vendors.findVendorsAll()
      expect(vendors.map((v) => v.name as string)).toContain('Pre-existing Vendor')
    })

    it('an empty log produces an empty (but usable) store', async () => {
      const actionLog = createInMemoryActionLog()
      const store = await LedgerStore.open(actionLog, new MaterializedStore(openBunDriver()))
      expect(await store.svcs.accounts.findAccountsAll()).toEqual([])
    })
  })

  describe('patch/delete flow', () => {
    it('create, patch, then delete an account, checking findAccountById and isAccountInUse along the way', async () => {
      const actionLog = createInMemoryActionLog()
      const store = await LedgerStore.open(actionLog, new MaterializedStore(openBunDriver()))
      const origin = makeOrigin()

      const created = accountCreationEventSchema.parse({
        id: genAcctId(),
        origId: origin.id,
        parentCtgId: genAcctCtgId(),
        acctType: 'ASSET',
        name: 'Original',
      })
      await store.svcs.accounts.createAccount(created)
      expect(await store.svcs.accounts.isAccountInUse(created.id)).toBe(false)

      const patch = accountPatchEventSchema.parse({ id: created.id, origId: origin.id, name: 'Renamed' })
      await store.svcs.accounts.patchAccount(patch)
      const patched = await store.svcs.accounts.findAccountById(created.id)
      expect(patched!.name as string).toBe('Renamed')

      const deletion = accountDeletionEventSchema.parse({ id: created.id, origId: origin.id })
      await store.svcs.accounts.deleteAccount(deletion)
      const all = await store.svcs.accounts.findAccountsAll()
      expect(all.find((a) => a.id === created.id)).toBeUndefined()
    })
  })

  describe('error propagation', () => {
    it('rejects when the materialized-store half of a tee fails, after the log write already succeeded', async () => {
      const actionLog = createInMemoryActionLog()
      const store = await LedgerStore.open(actionLog, new MaterializedStore(openBunDriver()))

      const patch = accountPatchEventSchema.parse({ id: genAcctId(), origId: genOrigId(), name: 'Ghost' })
      await expect(store.svcs.accounts.patchAccount(patch)).rejects.toThrow()

      // The log write already happened -- LedgerStore does not roll it back on a downstream failure.
      const [action] = await collect(actionLog.readActionsForAccount(patch.id))
      expect(action!.actionType).toBe('update-account')
    })
  })

  describe('isolation', () => {
    it("two LedgerStores over separate logs/stores do not see each other's writes", async () => {
      const storeA = await LedgerStore.open(createInMemoryActionLog(), new MaterializedStore(openBunDriver()))
      const storeB = await LedgerStore.open(createInMemoryActionLog(), new MaterializedStore(openBunDriver()))

      const origin = makeOrigin()
      const event = accountCreationEventSchema.parse({
        id: genAcctId(),
        origId: origin.id,
        parentCtgId: genAcctCtgId(),
        acctType: 'ASSET',
        name: 'Only In A',
      })
      await storeA.svcs.accounts.createAccount(event)

      expect(await storeA.svcs.accounts.findAccountById(event.id)).not.toBeNull()
      expect(await storeB.svcs.accounts.findAccountById(event.id)).toBeNull()
    })

    it('the constructor alone (no replay) leaves the materialized store empty even with a non-empty log', async () => {
      const actionLog = createInMemoryActionLog()
      await actionLog.cmdSvcs.origins.createOrigin(makeOrigin())
      const account = accountCreationEventSchema.parse({
        id: genAcctId(),
        origId: genOrigId(),
        parentCtgId: genAcctCtgId(),
        acctType: 'ASSET',
        name: 'Not Replayed',
      })
      await actionLog.cmdSvcs.accounts.createAccount(account)

      const store = new LedgerStore(actionLog, new MaterializedStore(openBunDriver()))
      expect(await store.svcs.accounts.findAccountsAll()).toEqual([])
    })
  })
})
