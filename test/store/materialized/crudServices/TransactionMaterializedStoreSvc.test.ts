import { describe, expect, it } from 'bun:test'
import { genAcctId } from '@/ledger/accounts/AcctId.ts'
import { isoDateSchema } from '@/ledger/core/IsoDate.ts'
import { genOrigId } from '@/ledger/origins/OrigId.ts'
import {
  type TransactionCreationEvent,
  type TransactionPatchEvent,
  transactionCreationEventSchema,
  transactionDeletionEventSchema,
  transactionPatchEventSchema,
} from '@/ledger/transactions/Transaction.ts'
import { genTxnId } from '@/ledger/transactions/TxnId.ts'
import { genVndrId } from '@/ledger/vendors/VndrId.ts'
import { openBunDriver } from '@/store/driver/bunSqlite.ts'
import { TransactionMaterializedStoreSvc } from '@/store/materialized/crudServices/TransactionMaterializedStoreSvc.ts'
import { createSchema } from '@/store/materialized/schema.ts'

function makeSvc() {
  const db = openBunDriver()
  createSchema(db)
  return { db, svc: new TransactionMaterializedStoreSvc(db) }
}

const acctA = genAcctId()
const acctB = genAcctId()

describe('TransactionMaterializedStoreSvc', () => {
  describe('createTransaction / findTransactionById', () => {
    it('creates a transaction with its entries, retrievable by id in ordinal order', async () => {
      const { svc } = makeSvc()
      const vndrId = genVndrId()
      const event = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        vndrId,
        description: 'Groceries',
        entries: [
          { acctId: acctA, debit: 10000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 10000 },
        ],
      })

      await svc.createTransaction(event)
      const found = await svc.findTransactionById(event.id)

      expect(found).not.toBeNull()
      expect(found!.postDate as string).toBe('2026-01-15')
      expect(found!.vndrId).toBe(vndrId)
      expect(found!.entries).toHaveLength(2)
      expect(found!.entries[0]!.acctId).toBe(acctA)
      expect(found!.entries[0]!.debit).toBe(10000)
      expect(found!.entries[0]!.credit).toBe(0)
      expect(found!.entries[1]!.acctId).toBe(acctB)
      expect(found!.entries[1]!.credit).toBe(10000)
    })

    it('preserves entry order across more than two entries', async () => {
      const { svc } = makeSvc()
      const acctC = genAcctId()
      const event = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        description: 'Split purchase',
        entries: [
          { acctId: acctA, debit: 5000, credit: 0 },
          { acctId: acctB, debit: 5000, credit: 0 },
          { acctId: acctC, debit: 0, credit: 10000 },
        ],
      })

      await svc.createTransaction(event)
      const found = await svc.findTransactionById(event.id)
      expect(found!.entries.map((e) => e.acctId)).toEqual([acctA, acctB, acctC])
    })

    it('findTransactionById returns null for an unknown id', async () => {
      const { svc } = makeSvc()
      expect(await svc.findTransactionById(genTxnId())).toBeNull()
    })

    it('clamps clearedDate up to postDate when a raw (unvalidated) payload has clearedDate < postDate -- the replay case, since ActionLog.replayDispatch casts straight to TransactionCreationEvent with no schema.parse() in between', async () => {
      const { svc } = makeSvc()
      // Built as a plain object, not via transactionCreationEventSchema.parse(), which now rejects this
      // combination -- this simulates what replay actually hands the materialized store for a historical
      // action recorded before that constraint existed.
      const event = {
        id: genTxnId(),
        origId: genOrigId(),
        postDate: isoDateSchema.parse('2026-01-20'),
        clearedDate: isoDateSchema.parse('2026-01-15'),
        code: '',
        description: 'Historical',
        needsReview: false,
        entries: [
          { acctId: acctA, debit: 1000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 1000 },
        ],
      } as TransactionCreationEvent

      await svc.createTransaction(event)
      const found = await svc.findTransactionById(event.id)
      expect(found!.postDate as string).toBe('2026-01-20')
      expect(found!.clearedDate as string).toBe('2026-01-20')
    })
  })

  describe('patchTransaction', () => {
    it('updates only the fields present, leaving entries untouched when entries is absent', async () => {
      const { svc } = makeSvc()
      const created = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        description: 'Original',
        entries: [
          { acctId: acctA, debit: 10000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 10000 },
        ],
      })
      await svc.createTransaction(created)

      const patch = transactionPatchEventSchema.parse({
        id: created.id,
        origId: genOrigId(),
        description: 'Renamed',
      })
      await svc.patchTransaction(patch)

      const found = await svc.findTransactionById(created.id)
      expect(found!.description as string).toBe('Renamed')
      expect(found!.postDate as string).toBe('2026-01-15')
      expect(found!.entries).toHaveLength(2)
      expect(found!.entries[0]!.acctId).toBe(acctA)
    })

    it('fully replaces entries when entries is present on the patch', async () => {
      const { svc } = makeSvc()
      const created = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        description: 'Original',
        entries: [
          { acctId: acctA, debit: 10000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 10000 },
        ],
      })
      await svc.createTransaction(created)

      const acctC = genAcctId()
      const patch = transactionPatchEventSchema.parse({
        id: created.id,
        origId: genOrigId(),
        entries: [
          { acctId: acctC, debit: 7500, credit: 0 },
          { acctId: acctB, debit: 0, credit: 7500 },
        ],
      })
      await svc.patchTransaction(patch)

      const found = await svc.findTransactionById(created.id)
      expect(found!.entries).toHaveLength(2)
      expect(found!.entries.map((e) => e.acctId)).toEqual([acctC, acctB])
      expect(found!.entries[0]!.debit).toBe(7500)
    })

    it('throws when patching an unknown id', async () => {
      const { svc } = makeSvc()
      const patch = transactionPatchEventSchema.parse({ id: genTxnId(), origId: genOrigId(), description: 'X' })
      await expect(svc.patchTransaction(patch)).rejects.toThrow()
    })

    it('clamps clearedDate up to postDate when a raw (unvalidated) patch sets both at once', async () => {
      const { svc } = makeSvc()
      const created = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-10',
        description: 'Original',
        entries: [
          { acctId: acctA, debit: 1000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 1000 },
        ],
      })
      await svc.createTransaction(created)

      const patch = {
        id: created.id,
        origId: genOrigId(),
        postDate: isoDateSchema.parse('2026-01-20'),
        clearedDate: isoDateSchema.parse('2026-01-15'),
      } as TransactionPatchEvent
      await svc.patchTransaction(patch)

      const found = await svc.findTransactionById(created.id)
      expect(found!.postDate as string).toBe('2026-01-20')
      expect(found!.clearedDate as string).toBe('2026-01-20')
    })

    it('clamps against the already-stored postDate when the patch only changes clearedDate', async () => {
      const { svc } = makeSvc()
      const created = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-20',
        description: 'Original',
        entries: [
          { acctId: acctA, debit: 1000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 1000 },
        ],
      })
      await svc.createTransaction(created)

      const patch = {
        id: created.id,
        origId: genOrigId(),
        clearedDate: isoDateSchema.parse('2026-01-15'),
      } as TransactionPatchEvent
      await svc.patchTransaction(patch)

      const found = await svc.findTransactionById(created.id)
      expect(found!.postDate as string).toBe('2026-01-20')
      expect(found!.clearedDate as string).toBe('2026-01-20')
    })

    it('clamps against the incoming postDate when the patch only changes postDate past the stored clearedDate', async () => {
      const { svc } = makeSvc()
      const created = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-10',
        clearedDate: '2026-01-12',
        description: 'Original',
        entries: [
          { acctId: acctA, debit: 1000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 1000 },
        ],
      })
      await svc.createTransaction(created)

      const patch = transactionPatchEventSchema.parse({
        id: created.id,
        origId: genOrigId(),
        postDate: '2026-01-20',
      })
      await svc.patchTransaction(patch)

      const found = await svc.findTransactionById(created.id)
      expect(found!.postDate as string).toBe('2026-01-20')
      expect(found!.clearedDate as string).toBe('2026-01-20')
    })
  })

  describe('deleteTransaction', () => {
    it('soft-deletes: findTransactionById still resolves it', async () => {
      const { svc } = makeSvc()
      const created = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        description: 'To delete',
        entries: [
          { acctId: acctA, debit: 1000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 1000 },
        ],
      })
      await svc.createTransaction(created)

      const deletion = transactionDeletionEventSchema.parse({ id: created.id, origId: genOrigId() })
      await svc.deleteTransaction(deletion)

      const found = await svc.findTransactionById(created.id)
      expect(found).not.toBeNull()
      expect(found!.origId).toBe(deletion.origId)
    })

    it('throws when deleting an unknown id', async () => {
      const { svc } = makeSvc()
      const deletion = transactionDeletionEventSchema.parse({ id: genTxnId(), origId: genOrigId() })
      await expect(svc.deleteTransaction(deletion)).rejects.toThrow()
    })
  })

  describe('countTransactionsAll', () => {
    it('counts only non-deleted transactions', async () => {
      const { svc } = makeSvc()
      const a = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        description: 'A',
        entries: [
          { acctId: acctA, debit: 1000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 1000 },
        ],
      })
      const b = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-16',
        description: 'B',
        entries: [
          { acctId: acctA, debit: 500, credit: 0 },
          { acctId: acctB, debit: 0, credit: 500 },
        ],
      })
      await svc.createTransaction(a)
      await svc.createTransaction(b)
      expect(await svc.countTransactionsAll()).toBe(2)

      await svc.deleteTransaction(transactionDeletionEventSchema.parse({ id: a.id, origId: genOrigId() }))
      expect(await svc.countTransactionsAll()).toBe(1)
    })
  })

  describe('findTransactionsByAccount', () => {
    it('returns only transactions touching the account, oldest first, breaking same-day ties by insertion order', async () => {
      const { svc } = makeSvc()
      const acctC = genAcctId()

      const early = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-10',
        description: 'Early',
        entries: [
          { acctId: acctA, debit: 1000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 1000 },
        ],
      })
      const sameDayFirst = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        description: 'Same day, first',
        entries: [
          { acctId: acctA, debit: 2000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 2000 },
        ],
      })
      const sameDaySecond = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        description: 'Same day, second',
        entries: [
          { acctId: acctA, debit: 3000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 3000 },
        ],
      })
      const otherAccount = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-12',
        description: 'Not acctA',
        entries: [
          { acctId: acctB, debit: 4000, credit: 0 },
          { acctId: acctC, debit: 0, credit: 4000 },
        ],
      })

      await svc.createTransaction(early)
      await svc.createTransaction(sameDayFirst)
      await svc.createTransaction(otherAccount)
      await svc.createTransaction(sameDaySecond)

      const deleted = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-20',
        description: 'Deleted',
        entries: [
          { acctId: acctA, debit: 100, credit: 0 },
          { acctId: acctB, debit: 0, credit: 100 },
        ],
      })
      await svc.createTransaction(deleted)
      await svc.deleteTransaction(transactionDeletionEventSchema.parse({ id: deleted.id, origId: genOrigId() }))

      const found = await svc.findTransactionsByAccount(acctA)
      expect(found.map((t) => t.description as string)).toEqual(['Early', 'Same day, first', 'Same day, second'])
    })

    it('returns an empty array when the account has no transactions', async () => {
      const { svc } = makeSvc()
      expect(await svc.findTransactionsByAccount(genAcctId())).toEqual([])
    })

    it('orders by transaction date (clearedDate when present, else postDate), not raw postDate, breaking ties by insertion order', async () => {
      const { svc } = makeSvc()

      // Cleared on 2026-01-15 despite an earlier postDate -- its transaction date ties with sameDay's.
      const clearedIntoTie = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-05',
        clearedDate: '2026-01-15',
        description: 'Cleared into the tie',
        entries: [
          { acctId: acctA, debit: 500, credit: 0 },
          { acctId: acctB, debit: 0, credit: 500 },
        ],
      })
      const sameDay = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        description: 'Same transaction date',
        entries: [
          { acctId: acctA, debit: 1000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 1000 },
        ],
      })

      await svc.createTransaction(sameDay)
      await svc.createTransaction(clearedIntoTie)

      const found = await svc.findTransactionsByAccount(acctA)
      // Both share transaction date 2026-01-15; entered order (sameDay, then clearedIntoTie) wins the tie
      // even though clearedIntoTie's raw postDate (01-05) sorts earlier than sameDay's (01-15).
      expect(found.map((t) => t.description as string)).toEqual(['Same transaction date', 'Cleared into the tie'])
    })
  })

  describe('findLatestTransactionForVendorAndAccount', () => {
    it('picks the most recent matching transaction, ignoring other vendors and other accounts', async () => {
      const { svc } = makeSvc()
      const vndrX = genVndrId()
      const vndrY = genVndrId()
      const acctC = genAcctId()

      const older = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-05',
        vndrId: vndrX,
        description: 'Older',
        entries: [
          { acctId: acctA, debit: 1000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 1000 },
        ],
      })
      const newer = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-20',
        vndrId: vndrX,
        description: 'Newer',
        entries: [
          { acctId: acctA, debit: 1500, credit: 0 },
          { acctId: acctB, debit: 0, credit: 1500 },
        ],
      })
      const wrongVendor = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-25',
        vndrId: vndrY,
        description: 'Wrong vendor',
        entries: [
          { acctId: acctA, debit: 9900, credit: 0 },
          { acctId: acctB, debit: 0, credit: 9900 },
        ],
      })
      const wrongAccount = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-26',
        vndrId: vndrX,
        description: 'Wrong account',
        entries: [
          { acctId: acctB, debit: 9900, credit: 0 },
          { acctId: acctC, debit: 0, credit: 9900 },
        ],
      })

      await svc.createTransaction(older)
      await svc.createTransaction(newer)
      await svc.createTransaction(wrongVendor)
      await svc.createTransaction(wrongAccount)

      const found = await svc.findLatestTransactionForVendorAndAccount(vndrX, acctA)
      expect(found?.description as string).toBe('Newer')
    })

    it('returns null when there is no matching transaction', async () => {
      const { svc } = makeSvc()
      expect(await svc.findLatestTransactionForVendorAndAccount(genVndrId(), genAcctId())).toBeNull()
    })
  })

  describe('findAccountBalancesAsOf', () => {
    it('sums multiple entries per account', async () => {
      const { svc } = makeSvc()
      const first = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-10',
        description: 'First',
        entries: [
          { acctId: acctA, debit: 10000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 10000 },
        ],
      })
      const second = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-11',
        description: 'Second',
        entries: [
          { acctId: acctA, debit: 5000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 5000 },
        ],
      })
      await svc.createTransaction(first)
      await svc.createTransaction(second)

      const balances = await svc.findAccountBalancesAsOf(isoDateSchema.parse('2026-01-31'))
      const acctABalance = balances.find((b) => b.acctId === acctA)
      const acctBBalance = balances.find((b) => b.acctId === acctB)
      expect(acctABalance!.debit).toBe(15000)
      expect(acctABalance!.credit).toBe(0)
      expect(acctBBalance!.debit).toBe(0)
      expect(acctBBalance!.credit).toBe(15000)
    })

    it('excludes entries whose transaction is soft-deleted', async () => {
      const { svc } = makeSvc()
      const kept = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-10',
        description: 'Kept',
        entries: [
          { acctId: acctA, debit: 1000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 1000 },
        ],
      })
      const deleted = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-11',
        description: 'Deleted',
        entries: [
          { acctId: acctA, debit: 99900, credit: 0 },
          { acctId: acctB, debit: 0, credit: 99900 },
        ],
      })
      await svc.createTransaction(kept)
      await svc.createTransaction(deleted)
      await svc.deleteTransaction(transactionDeletionEventSchema.parse({ id: deleted.id, origId: genOrigId() }))

      const balances = await svc.findAccountBalancesAsOf(isoDateSchema.parse('2026-01-31'))
      const acctABalance = balances.find((b) => b.acctId === acctA)
      expect(acctABalance!.debit).toBe(1000)
    })

    it('excludes entries whose transaction postDate is after asOfDate, includes postDate equal to asOfDate', async () => {
      const { svc } = makeSvc()
      const onDate = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        description: 'On date',
        entries: [
          { acctId: acctA, debit: 1000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 1000 },
        ],
      })
      const afterDate = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-16',
        description: 'After date',
        entries: [
          { acctId: acctA, debit: 99900, credit: 0 },
          { acctId: acctB, debit: 0, credit: 99900 },
        ],
      })
      await svc.createTransaction(onDate)
      await svc.createTransaction(afterDate)

      const balances = await svc.findAccountBalancesAsOf(isoDateSchema.parse('2026-01-15'))
      const acctABalance = balances.find((b) => b.acctId === acctA)
      expect(acctABalance!.debit).toBe(1000)
    })

    it('an account with no qualifying entries is simply absent from the result', async () => {
      const { svc } = makeSvc()
      const balances = await svc.findAccountBalancesAsOf(isoDateSchema.parse('2026-01-31'))
      expect(balances.find((b) => b.acctId === genAcctId())).toBeUndefined()
      expect(balances).toEqual([])
    })
  })

  describe('findAccountBalancesForPeriod', () => {
    it('sums entries within the range, excluding entries before startDate and after endDate', async () => {
      const { svc } = makeSvc()
      const before = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-31',
        description: 'Before',
        entries: [
          { acctId: acctA, debit: 99900, credit: 0 },
          { acctId: acctB, debit: 0, credit: 99900 },
        ],
      })
      const within = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-02-15',
        description: 'Within',
        entries: [
          { acctId: acctA, debit: 5000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 5000 },
        ],
      })
      const after = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-03-01',
        description: 'After',
        entries: [
          { acctId: acctA, debit: 99900, credit: 0 },
          { acctId: acctB, debit: 0, credit: 99900 },
        ],
      })
      await svc.createTransaction(before)
      await svc.createTransaction(within)
      await svc.createTransaction(after)

      const balances = await svc.findAccountBalancesForPeriod(
        isoDateSchema.parse('2026-02-01'),
        isoDateSchema.parse('2026-02-28'),
      )
      const acctABalance = balances.find((b) => b.acctId === acctA)
      expect(acctABalance!.debit).toBe(5000)
    })

    it('includes entries exactly on either boundary date', async () => {
      const { svc } = makeSvc()
      const onStart = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-02-01',
        description: 'On start',
        entries: [
          { acctId: acctA, debit: 1000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 1000 },
        ],
      })
      const onEnd = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-02-28',
        description: 'On end',
        entries: [
          { acctId: acctA, debit: 2000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 2000 },
        ],
      })
      await svc.createTransaction(onStart)
      await svc.createTransaction(onEnd)

      const balances = await svc.findAccountBalancesForPeriod(
        isoDateSchema.parse('2026-02-01'),
        isoDateSchema.parse('2026-02-28'),
      )
      const acctABalance = balances.find((b) => b.acctId === acctA)
      expect(acctABalance!.debit).toBe(3000)
    })

    it('excludes entries whose transaction is soft-deleted', async () => {
      const { svc } = makeSvc()
      const kept = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-02-10',
        description: 'Kept',
        entries: [
          { acctId: acctA, debit: 1000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 1000 },
        ],
      })
      const deleted = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-02-11',
        description: 'Deleted',
        entries: [
          { acctId: acctA, debit: 99900, credit: 0 },
          { acctId: acctB, debit: 0, credit: 99900 },
        ],
      })
      await svc.createTransaction(kept)
      await svc.createTransaction(deleted)
      await svc.deleteTransaction(transactionDeletionEventSchema.parse({ id: deleted.id, origId: genOrigId() }))

      const balances = await svc.findAccountBalancesForPeriod(
        isoDateSchema.parse('2026-02-01'),
        isoDateSchema.parse('2026-02-28'),
      )
      const acctABalance = balances.find((b) => b.acctId === acctA)
      expect(acctABalance!.debit).toBe(1000)
    })

    it('an account with no qualifying entries is simply absent from the result', async () => {
      const { svc } = makeSvc()
      const balances = await svc.findAccountBalancesForPeriod(
        isoDateSchema.parse('2026-02-01'),
        isoDateSchema.parse('2026-02-28'),
      )
      expect(balances).toEqual([])
    })
  })

  describe('findTransactionsForPeriod', () => {
    it('returns only transactions within the range, oldest first, excluding soft-deleted', async () => {
      const { svc } = makeSvc()
      const before = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-31',
        description: 'Before',
        entries: [
          { acctId: acctA, debit: 1000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 1000 },
        ],
      })
      const withinFirst = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-02-05',
        description: 'Within, first',
        entries: [
          { acctId: acctA, debit: 2000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 2000 },
        ],
      })
      const withinSecond = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-02-20',
        description: 'Within, second',
        entries: [
          { acctId: acctA, debit: 3000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 3000 },
        ],
      })
      const after = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-03-01',
        description: 'After',
        entries: [
          { acctId: acctA, debit: 4000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 4000 },
        ],
      })
      const deleted = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-02-10',
        description: 'Deleted',
        entries: [
          { acctId: acctA, debit: 9900, credit: 0 },
          { acctId: acctB, debit: 0, credit: 9900 },
        ],
      })
      await svc.createTransaction(before)
      await svc.createTransaction(withinFirst)
      await svc.createTransaction(withinSecond)
      await svc.createTransaction(after)
      await svc.createTransaction(deleted)
      await svc.deleteTransaction(transactionDeletionEventSchema.parse({ id: deleted.id, origId: genOrigId() }))

      const found = await svc.findTransactionsForPeriod(
        isoDateSchema.parse('2026-02-01'),
        isoDateSchema.parse('2026-02-28'),
      )
      expect(found.map((t) => t.description as string)).toEqual(['Within, first', 'Within, second'])
    })

    it('includes transactions exactly on either boundary date', async () => {
      const { svc } = makeSvc()
      const onStart = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-02-01',
        description: 'On start',
        entries: [
          { acctId: acctA, debit: 1000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 1000 },
        ],
      })
      const onEnd = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-02-28',
        description: 'On end',
        entries: [
          { acctId: acctA, debit: 2000, credit: 0 },
          { acctId: acctB, debit: 0, credit: 2000 },
        ],
      })
      await svc.createTransaction(onStart)
      await svc.createTransaction(onEnd)

      const found = await svc.findTransactionsForPeriod(
        isoDateSchema.parse('2026-02-01'),
        isoDateSchema.parse('2026-02-28'),
      )
      expect(found.map((t) => t.description as string)).toEqual(['On start', 'On end'])
    })

    it('returns an empty array when nothing falls within the range', async () => {
      const { svc } = makeSvc()
      expect(
        await svc.findTransactionsForPeriod(isoDateSchema.parse('2026-02-01'), isoDateSchema.parse('2026-02-28')),
      ).toEqual([])
    })
  })
})
