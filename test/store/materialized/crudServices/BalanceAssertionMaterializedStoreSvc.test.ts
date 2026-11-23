import { describe, expect, it } from 'bun:test'
import { genAcctId } from '@/ledger/accounts/AcctId.ts'
import { genAsrtId } from '@/ledger/balanceAssertions/AsrtId.ts'
import {
  balanceAssertionCreationEventSchema,
  balanceAssertionDeletionEventSchema,
  balanceAssertionPatchEventSchema,
} from '@/ledger/balanceAssertions/BalanceAssertion.ts'
import { genOrigId } from '@/ledger/origins/OrigId.ts'
import { openBunDriver } from '@/store/driver/bunSqlite.ts'
import { BalanceAssertionMaterializedStoreSvc } from '@/store/materialized/crudServices/BalanceAssertionMaterializedStoreSvc.ts'
import { createSchema } from '@/store/materialized/schema.ts'

function makeSvc() {
  const db = openBunDriver()
  createSchema(db)
  return { db, svc: new BalanceAssertionMaterializedStoreSvc(db) }
}

describe('BalanceAssertionMaterializedStoreSvc', () => {
  describe('createBalanceAssertion / findBalanceAssertionById / findBalanceAssertionsAll', () => {
    it('creates a balance assertion retrievable by id, storing and reading back the balance in cents', async () => {
      const { svc } = makeSvc()
      const event = balanceAssertionCreationEventSchema.parse({
        id: genAsrtId(),
        origId: genOrigId(),
        acctId: genAcctId(),
        assertionDate: '2026-01-31',
        balance: 123456,
      })

      await svc.createBalanceAssertion(event)
      const found = await svc.findBalanceAssertionById(event.id)

      expect(found).not.toBeNull()
      expect(found!.acctId).toBe(event.acctId)
      expect(found!.assertionDate as string).toBe('2026-01-31')
      expect(found!.balance).toBe(123456)
    })

    it('round-trips a negative balance', async () => {
      const { svc } = makeSvc()
      const event = balanceAssertionCreationEventSchema.parse({
        id: genAsrtId(),
        origId: genOrigId(),
        acctId: genAcctId(),
        assertionDate: '2026-01-31',
        balance: -50000,
      })
      await svc.createBalanceAssertion(event)
      const found = await svc.findBalanceAssertionById(event.id)
      expect(found!.balance).toBe(-50000)
    })

    it('findBalanceAssertionsAll only returns non-deleted assertions, ordered by assertionDate', async () => {
      const { svc } = makeSvc()
      const later = balanceAssertionCreationEventSchema.parse({
        id: genAsrtId(),
        origId: genOrigId(),
        acctId: genAcctId(),
        assertionDate: '2026-02-28',
        balance: 100,
      })
      const earlier = balanceAssertionCreationEventSchema.parse({
        id: genAsrtId(),
        origId: genOrigId(),
        acctId: genAcctId(),
        assertionDate: '2026-01-31',
        balance: 100,
      })
      await svc.createBalanceAssertion(later)
      await svc.createBalanceAssertion(earlier)

      const all = await svc.findBalanceAssertionsAll()
      expect(all.map((a) => a.assertionDate as string)).toEqual(['2026-01-31', '2026-02-28'])
    })
  })

  describe('findBalanceAssertionsByAccount', () => {
    it('returns only non-deleted assertions for the given account, ordered by assertionDate', async () => {
      const { svc } = makeSvc()
      const acctA = genAcctId()
      const acctB = genAcctId()

      const later = balanceAssertionCreationEventSchema.parse({
        id: genAsrtId(),
        origId: genOrigId(),
        acctId: acctA,
        assertionDate: '2026-02-28',
        balance: 100,
      })
      const earlier = balanceAssertionCreationEventSchema.parse({
        id: genAsrtId(),
        origId: genOrigId(),
        acctId: acctA,
        assertionDate: '2026-01-31',
        balance: 100,
      })
      const otherAccount = balanceAssertionCreationEventSchema.parse({
        id: genAsrtId(),
        origId: genOrigId(),
        acctId: acctB,
        assertionDate: '2026-01-15',
        balance: 100,
      })
      await svc.createBalanceAssertion(later)
      await svc.createBalanceAssertion(earlier)
      await svc.createBalanceAssertion(otherAccount)

      const deleted = balanceAssertionCreationEventSchema.parse({
        id: genAsrtId(),
        origId: genOrigId(),
        acctId: acctA,
        assertionDate: '2026-03-31',
        balance: 100,
      })
      await svc.createBalanceAssertion(deleted)
      await svc.deleteBalanceAssertion(
        balanceAssertionDeletionEventSchema.parse({ id: deleted.id, origId: genOrigId() }),
      )

      const found = await svc.findBalanceAssertionsByAccount(acctA)
      expect(found.map((a) => a.assertionDate as string)).toEqual(['2026-01-31', '2026-02-28'])
    })

    it('returns an empty array when the account has no assertions', async () => {
      const { svc } = makeSvc()
      expect(await svc.findBalanceAssertionsByAccount(genAcctId())).toEqual([])
    })
  })

  describe('patchBalanceAssertion', () => {
    it('updates only the fields present on the patch', async () => {
      const { svc } = makeSvc()
      const created = balanceAssertionCreationEventSchema.parse({
        id: genAsrtId(),
        origId: genOrigId(),
        acctId: genAcctId(),
        assertionDate: '2026-01-31',
        balance: 10000,
      })
      await svc.createBalanceAssertion(created)

      const patch = balanceAssertionPatchEventSchema.parse({
        id: created.id,
        origId: genOrigId(),
        balance: 20000,
      })
      await svc.patchBalanceAssertion(patch)

      const found = await svc.findBalanceAssertionById(created.id)
      expect(found!.balance).toBe(20000)
      expect(found!.assertionDate as string).toBe('2026-01-31')
    })

    it('throws when patching an unknown id', async () => {
      const { svc } = makeSvc()
      const patch = balanceAssertionPatchEventSchema.parse({ id: genAsrtId(), origId: genOrigId(), balance: 100 })
      await expect(svc.patchBalanceAssertion(patch)).rejects.toThrow()
    })
  })

  describe('deleteBalanceAssertion', () => {
    it('soft-deletes: findById still resolves it, findAll excludes it', async () => {
      const { svc } = makeSvc()
      const created = balanceAssertionCreationEventSchema.parse({
        id: genAsrtId(),
        origId: genOrigId(),
        acctId: genAcctId(),
        assertionDate: '2026-01-31',
        balance: 100,
      })
      await svc.createBalanceAssertion(created)

      const deletion = balanceAssertionDeletionEventSchema.parse({ id: created.id, origId: genOrigId() })
      await svc.deleteBalanceAssertion(deletion)

      expect(await svc.findBalanceAssertionById(created.id)).not.toBeNull()
      const all = await svc.findBalanceAssertionsAll()
      expect(all.find((a) => a.id === created.id)).toBeUndefined()
    })

    it('throws when deleting an unknown id', async () => {
      const { svc } = makeSvc()
      const deletion = balanceAssertionDeletionEventSchema.parse({ id: genAsrtId(), origId: genOrigId() })
      await expect(svc.deleteBalanceAssertion(deletion)).rejects.toThrow()
    })
  })

  describe('countBalanceAssertionsAll', () => {
    it('counts only non-deleted balance assertions', async () => {
      const { svc } = makeSvc()
      const a = balanceAssertionCreationEventSchema.parse({
        id: genAsrtId(),
        origId: genOrigId(),
        acctId: genAcctId(),
        assertionDate: '2026-01-31',
        balance: 100,
      })
      const b = balanceAssertionCreationEventSchema.parse({
        id: genAsrtId(),
        origId: genOrigId(),
        acctId: genAcctId(),
        assertionDate: '2026-02-28',
        balance: 200,
      })
      await svc.createBalanceAssertion(a)
      await svc.createBalanceAssertion(b)
      expect(await svc.countBalanceAssertionsAll()).toBe(2)

      await svc.deleteBalanceAssertion(balanceAssertionDeletionEventSchema.parse({ id: a.id, origId: genOrigId() }))
      expect(await svc.countBalanceAssertionsAll()).toBe(1)
    })
  })
})
