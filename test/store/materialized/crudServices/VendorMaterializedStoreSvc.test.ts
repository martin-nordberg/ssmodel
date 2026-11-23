import { describe, expect, it } from 'bun:test'
import { genAcctId } from '@/ledger/accounts/AcctId.ts'
import { genOrigId } from '@/ledger/origins/OrigId.ts'
import { genTxnId } from '@/ledger/transactions/TxnId.ts'
import {
  vendorCreationEventSchema,
  vendorDeletionEventSchema,
  vendorPatchEventSchema,
} from '@/ledger/vendors/Vendor.ts'
import { genVndrId } from '@/ledger/vendors/VndrId.ts'
import { openBunDriver } from '@/store/driver/bunSqlite.ts'
import { VendorMaterializedStoreSvc } from '@/store/materialized/crudServices/VendorMaterializedStoreSvc.ts'
import { createSchema } from '@/store/materialized/schema.ts'

function makeSvc() {
  const db = openBunDriver()
  createSchema(db)
  return { db, svc: new VendorMaterializedStoreSvc(db) }
}

describe('VendorMaterializedStoreSvc', () => {
  describe('createVendor / findVendorById / findVendorsAll', () => {
    it('creates a vendor retrievable by id', async () => {
      const { svc } = makeSvc()
      const acctId = genAcctId()
      const event = vendorCreationEventSchema.parse({
        id: genVndrId(),
        origId: genOrigId(),
        name: 'Acme Corp',
        description: 'A fictional vendor',
        defaultAcctId: acctId,
        isActive: true,
      })

      await svc.createVendor(event)
      const found = await svc.findVendorById(event.id)

      expect(found).not.toBeNull()
      expect(found!.name as string).toBe('Acme Corp')
      expect(found!.defaultAcctId).toBe(acctId)
      expect(found!.isActive).toBe(true)
    })

    it('leaves defaultAcctId undefined when absent', async () => {
      const { svc } = makeSvc()
      const event = vendorCreationEventSchema.parse({
        id: genVndrId(),
        origId: genOrigId(),
        name: 'No Default',
      })
      await svc.createVendor(event)
      const found = await svc.findVendorById(event.id)
      expect(found!.defaultAcctId).toBeUndefined()
    })

    it('findVendorsAll only returns non-deleted vendors, ordered by name', async () => {
      const { svc } = makeSvc()
      const b = vendorCreationEventSchema.parse({ id: genVndrId(), origId: genOrigId(), name: 'B Vendor' })
      const a = vendorCreationEventSchema.parse({ id: genVndrId(), origId: genOrigId(), name: 'A Vendor' })
      await svc.createVendor(b)
      await svc.createVendor(a)

      const all = await svc.findVendorsAll()
      expect(all.map((v) => v.name as string)).toEqual(['A Vendor', 'B Vendor'])
    })
  })

  describe('patchVendor', () => {
    it('updates only the fields present on the patch', async () => {
      const { svc } = makeSvc()
      const created = vendorCreationEventSchema.parse({
        id: genVndrId(),
        origId: genOrigId(),
        name: 'Original',
        isActive: true,
      })
      await svc.createVendor(created)

      const patch = vendorPatchEventSchema.parse({ id: created.id, origId: genOrigId(), isActive: false })
      await svc.patchVendor(patch)

      const found = await svc.findVendorById(created.id)
      expect(found!.name as string).toBe('Original')
      expect(found!.isActive).toBe(false)
    })

    it('throws when patching an unknown id', async () => {
      const { svc } = makeSvc()
      const patch = vendorPatchEventSchema.parse({ id: genVndrId(), origId: genOrigId(), isActive: false })
      await expect(svc.patchVendor(patch)).rejects.toThrow()
    })
  })

  describe('deleteVendor', () => {
    it('soft-deletes: findVendorById still resolves it, findVendorsAll excludes it', async () => {
      const { svc } = makeSvc()
      const created = vendorCreationEventSchema.parse({
        id: genVndrId(),
        origId: genOrigId(),
        name: 'Deleted',
      })
      await svc.createVendor(created)

      const deletion = vendorDeletionEventSchema.parse({ id: created.id, origId: genOrigId() })
      await svc.deleteVendor(deletion)

      const byId = await svc.findVendorById(created.id)
      expect(byId).not.toBeNull()

      const all = await svc.findVendorsAll()
      expect(all.find((v) => v.id === created.id)).toBeUndefined()
    })

    it('throws when deleting an unknown id', async () => {
      const { svc } = makeSvc()
      const deletion = vendorDeletionEventSchema.parse({ id: genVndrId(), origId: genOrigId() })
      await expect(svc.deleteVendor(deletion)).rejects.toThrow()
    })
  })

  describe('countVendorsAll', () => {
    it('counts only non-deleted vendors', async () => {
      const { svc } = makeSvc()
      const a = vendorCreationEventSchema.parse({ id: genVndrId(), origId: genOrigId(), name: 'A' })
      const b = vendorCreationEventSchema.parse({ id: genVndrId(), origId: genOrigId(), name: 'B' })
      await svc.createVendor(a)
      await svc.createVendor(b)
      expect(await svc.countVendorsAll()).toBe(2)

      await svc.deleteVendor(vendorDeletionEventSchema.parse({ id: a.id, origId: genOrigId() }))
      expect(await svc.countVendorsAll()).toBe(1)
    })
  })

  describe('isVendorInUse', () => {
    it('is false for a vendor nothing references', async () => {
      const { svc } = makeSvc()
      const created = vendorCreationEventSchema.parse({
        id: genVndrId(),
        origId: genOrigId(),
        name: 'Unused',
      })
      await svc.createVendor(created)
      expect(await svc.isVendorInUse(created.id)).toBe(false)
    })

    it('is true when referenced by a live transaction, false once that transaction is deleted', async () => {
      const { db, svc } = makeSvc()
      const created = vendorCreationEventSchema.parse({
        id: genVndrId(),
        origId: genOrigId(),
        name: 'Used',
      })
      await svc.createVendor(created)

      const txnId = genTxnId()
      db.run(
        `INSERT INTO transactions (id, orig_id, post_date, code, vndr_id, description, needs_review) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [txnId, genOrigId(), '2026-01-01', '', created.id, '', 0],
      )

      expect(await svc.isVendorInUse(created.id)).toBe(true)

      db.run(`UPDATE transactions SET is_deleted = 1 WHERE id = ?`, [txnId])
      expect(await svc.isVendorInUse(created.id)).toBe(false)
    })
  })
})
