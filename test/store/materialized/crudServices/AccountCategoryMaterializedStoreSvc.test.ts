import { describe, expect, it } from 'bun:test'
import {
  accountCategoryCreationEventSchema,
  accountCategoryDeletionEventSchema,
  accountCategoryPatchEventSchema,
} from '@/ledger/accountCategories/AccountCategory.ts'
import { genAcctCtgId } from '@/ledger/accountCategories/AcctCtgId.ts'
import { acctCtgIdAssets } from '@/ledger/accountCategories/AcctCtgRoot.ts'
import { accountCreationEventSchema } from '@/ledger/accounts/Account.ts'
import { genAcctId } from '@/ledger/accounts/AcctId.ts'
import { genOrigId } from '@/ledger/origins/OrigId.ts'
import { openBunDriver } from '@/store/driver/bunSqlite.ts'
import { AccountCategoryMaterializedStoreSvc } from '@/store/materialized/crudServices/AccountCategoryMaterializedStoreSvc.ts'
import { AccountMaterializedStoreSvc } from '@/store/materialized/crudServices/AccountMaterializedStoreSvc.ts'
import { createSchema } from '@/store/materialized/schema.ts'

function makeSvc() {
  const db = openBunDriver()
  createSchema(db)
  return { db, svc: new AccountCategoryMaterializedStoreSvc(db) }
}

describe('AccountCategoryMaterializedStoreSvc', () => {
  describe('createAccountCategory / findAccountCategoryById / findAccountCategoriesAll', () => {
    it('creates a category retrievable by id', async () => {
      const { svc } = makeSvc()
      const event = accountCategoryCreationEventSchema.parse({
        id: genAcctCtgId(),
        origId: genOrigId(),
        parentCtgId: acctCtgIdAssets,
        acctType: 'ASSET',
        name: 'Checking Accounts',
        description: 'All checking accounts',
      })

      await svc.createAccountCategory(event)
      const found = await svc.findAccountCategoryById(event.id)

      expect(found).not.toBeNull()
      expect(found!.id).toBe(event.id)
      expect(found!.origId).toBe(event.origId)
      expect(found!.parentCtgId).toBe(acctCtgIdAssets)
      expect(found!.name as string).toBe('Checking Accounts')
      expect(found!.description as string).toBe('All checking accounts')
    })

    it('findAccountCategoriesAll only returns non-deleted categories, ordered by name', async () => {
      const { svc } = makeSvc()
      const b = accountCategoryCreationEventSchema.parse({
        id: genAcctCtgId(),
        origId: genOrigId(),
        parentCtgId: acctCtgIdAssets,
        acctType: 'ASSET',
        name: 'B category',
      })
      const a = accountCategoryCreationEventSchema.parse({
        id: genAcctCtgId(),
        origId: genOrigId(),
        parentCtgId: acctCtgIdAssets,
        acctType: 'ASSET',
        name: 'A category',
      })
      await svc.createAccountCategory(b)
      await svc.createAccountCategory(a)

      const all = await svc.findAccountCategoriesAll()
      expect(all.map((ctg) => ctg.name as string)).toEqual(['A category', 'B category'])
    })

    it('findAccountCategoryById returns null for an unknown id', async () => {
      const { svc } = makeSvc()
      expect(await svc.findAccountCategoryById(genAcctCtgId())).toBeNull()
    })
  })

  describe('countAccountCategoriesAll', () => {
    it('counts only non-deleted categories', async () => {
      const { svc } = makeSvc()
      const a = accountCategoryCreationEventSchema.parse({
        id: genAcctCtgId(),
        origId: genOrigId(),
        parentCtgId: acctCtgIdAssets,
        acctType: 'ASSET',
        name: 'A',
      })
      const b = accountCategoryCreationEventSchema.parse({
        id: genAcctCtgId(),
        origId: genOrigId(),
        parentCtgId: acctCtgIdAssets,
        acctType: 'ASSET',
        name: 'B',
      })
      await svc.createAccountCategory(a)
      await svc.createAccountCategory(b)
      expect(await svc.countAccountCategoriesAll()).toBe(2)

      await svc.deleteAccountCategory(accountCategoryDeletionEventSchema.parse({ id: a.id, origId: genOrigId() }))
      expect(await svc.countAccountCategoriesAll()).toBe(1)
    })
  })

  describe('patchAccountCategory', () => {
    it('updates only the fields present on the patch, leaving others unchanged', async () => {
      const { svc } = makeSvc()
      const created = accountCategoryCreationEventSchema.parse({
        id: genAcctCtgId(),
        origId: genOrigId(),
        parentCtgId: acctCtgIdAssets,
        acctType: 'ASSET',
        name: 'Original',
        description: 'original description',
      })
      await svc.createAccountCategory(created)

      const patch = accountCategoryPatchEventSchema.parse({
        id: created.id,
        origId: genOrigId(),
        name: 'Renamed',
      })
      await svc.patchAccountCategory(patch)

      const found = await svc.findAccountCategoryById(created.id)
      expect(found!.name as string).toBe('Renamed')
      expect(found!.description as string).toBe('original description')
      expect(found!.origId).toBe(patch.origId)
    })

    it('reparents a category to a new parent category', async () => {
      const { svc } = makeSvc()
      const created = accountCategoryCreationEventSchema.parse({
        id: genAcctCtgId(),
        origId: genOrigId(),
        parentCtgId: acctCtgIdAssets,
        acctType: 'ASSET',
        name: 'Movable',
      })
      await svc.createAccountCategory(created)

      const newParentCtgId = genAcctCtgId()
      const patch = accountCategoryPatchEventSchema.parse({
        id: created.id,
        origId: genOrigId(),
        parentCtgId: newParentCtgId,
      })
      await svc.patchAccountCategory(patch)

      const found = await svc.findAccountCategoryById(created.id)
      expect(found!.parentCtgId).toBe(newParentCtgId)
    })

    it('throws when patching an unknown id', async () => {
      const { svc } = makeSvc()
      const patch = accountCategoryPatchEventSchema.parse({ id: genAcctCtgId(), origId: genOrigId(), name: 'X' })
      await expect(svc.patchAccountCategory(patch)).rejects.toThrow()
    })
  })

  describe('deleteAccountCategory', () => {
    it('soft-deletes: findAccountCategoryById still resolves it, findAccountCategoriesAll excludes it', async () => {
      const { svc } = makeSvc()
      const created = accountCategoryCreationEventSchema.parse({
        id: genAcctCtgId(),
        origId: genOrigId(),
        parentCtgId: acctCtgIdAssets,
        acctType: 'ASSET',
        name: 'Deleted Ctg',
      })
      await svc.createAccountCategory(created)

      const deletion = accountCategoryDeletionEventSchema.parse({ id: created.id, origId: genOrigId() })
      await svc.deleteAccountCategory(deletion)

      const byId = await svc.findAccountCategoryById(created.id)
      expect(byId).not.toBeNull()
      expect(byId!.name as string).toBe('Deleted Ctg')
      expect(byId!.origId).toBe(deletion.origId)

      const all = await svc.findAccountCategoriesAll()
      expect(all.find((ctg) => ctg.id === created.id)).toBeUndefined()
    })

    it('throws when deleting an unknown id', async () => {
      const { svc } = makeSvc()
      const deletion = accountCategoryDeletionEventSchema.parse({ id: genAcctCtgId(), origId: genOrigId() })
      await expect(svc.deleteAccountCategory(deletion)).rejects.toThrow()
    })
  })

  describe('isAccountCategoryInUse', () => {
    it('is false for a category with no children', async () => {
      const { svc } = makeSvc()
      const created = accountCategoryCreationEventSchema.parse({
        id: genAcctCtgId(),
        origId: genOrigId(),
        parentCtgId: acctCtgIdAssets,
        acctType: 'ASSET',
        name: 'Empty',
      })
      await svc.createAccountCategory(created)
      expect(await svc.isAccountCategoryInUse(created.id)).toBe(false)
    })

    it('is true when it has a live child category, false again once that child is deleted', async () => {
      const { svc } = makeSvc()
      const parent = accountCategoryCreationEventSchema.parse({
        id: genAcctCtgId(),
        origId: genOrigId(),
        parentCtgId: acctCtgIdAssets,
        acctType: 'ASSET',
        name: 'Parent',
      })
      await svc.createAccountCategory(parent)
      const child = accountCategoryCreationEventSchema.parse({
        id: genAcctCtgId(),
        origId: genOrigId(),
        parentCtgId: parent.id,
        acctType: 'ASSET',
        name: 'Child',
      })
      await svc.createAccountCategory(child)

      expect(await svc.isAccountCategoryInUse(parent.id)).toBe(true)

      await svc.deleteAccountCategory(accountCategoryDeletionEventSchema.parse({ id: child.id, origId: genOrigId() }))
      expect(await svc.isAccountCategoryInUse(parent.id)).toBe(false)
    })

    it('is true when it has a live child account, false again once that account is deleted', async () => {
      const { db, svc } = makeSvc()
      const accountSvc = new AccountMaterializedStoreSvc(db)

      const parent = accountCategoryCreationEventSchema.parse({
        id: genAcctCtgId(),
        origId: genOrigId(),
        parentCtgId: acctCtgIdAssets,
        acctType: 'ASSET',
        name: 'Parent',
      })
      await svc.createAccountCategory(parent)

      const account = accountCreationEventSchema.parse({
        id: genAcctId(),
        origId: genOrigId(),
        parentCtgId: parent.id,
        acctType: 'ASSET',
        name: 'Checking',
      })
      await accountSvc.createAccount(account)

      expect(await svc.isAccountCategoryInUse(parent.id)).toBe(true)

      await accountSvc.deleteAccount({ id: account.id, origId: genOrigId() })
      expect(await svc.isAccountCategoryInUse(parent.id)).toBe(false)
    })
  })
})
