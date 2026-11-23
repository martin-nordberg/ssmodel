import { describe, expect, it } from 'bun:test'
import { genAcctId } from '@/ledger/accounts/AcctId.ts'
import { genOrigId } from '@/ledger/origins/OrigId.ts'
import {
  transactionCreationEventSchema,
  transactionDeletionEventSchema,
  transactionPatchEventSchema,
} from '@/ledger/transactions/Transaction.ts'
import { genTxnId } from '@/ledger/transactions/TxnId.ts'
import { genVndrId } from '@/ledger/vendors/VndrId.ts'
import { collect, createInMemoryActionLog } from '../inMemory.ts'

const balancedEntries = [
  { acctId: genAcctId(), debit: 10000, credit: 0 },
  { acctId: genAcctId(), debit: 0, credit: 10000 },
]

describe('TransactionActionLogCmdSvc', () => {
  it('createTransaction appends a create-transaction row with a matching payload', async () => {
    const log = createInMemoryActionLog()
    const event = transactionCreationEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
      postDate: '2026-01-15',
      vndrId: genVndrId(),
      entries: balancedEntries,
    })

    const result = await log.cmdSvcs.transactions.createTransaction(event)
    expect(result).not.toBeNull()

    const [action] = await collect(log.readActions())
    expect(action!.actionType).toBe('create-transaction')
    expect((action!.payload as { postDate: string }).postDate as string).toBe('2026-01-15')
    expect((action!.payload as { entries: unknown[] }).entries).toHaveLength(2)
  })

  it('patchTransaction appends an update-transaction row', async () => {
    const log = createInMemoryActionLog()
    const patch = transactionPatchEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
      postDate: '2026-02-01',
    })

    await log.cmdSvcs.transactions.patchTransaction(patch)

    const [action] = await collect(log.readActions())
    expect(action!.actionType).toBe('update-transaction')
    expect((action!.payload as { postDate: string }).postDate as string).toBe('2026-02-01')
  })

  it('deleteTransaction appends a delete-transaction row', async () => {
    const log = createInMemoryActionLog()
    const deletion = transactionDeletionEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
    })

    await log.cmdSvcs.transactions.deleteTransaction(deletion)

    const [action] = await collect(log.readActions())
    expect(action!.actionType).toBe('delete-transaction')
  })
})
