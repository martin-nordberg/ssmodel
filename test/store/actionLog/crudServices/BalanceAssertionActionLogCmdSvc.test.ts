import { describe, expect, it } from 'bun:test'
import { genAcctId } from '@/ledger/accounts/AcctId.ts'
import { genAsrtId } from '@/ledger/balanceAssertions/AsrtId.ts'
import {
  balanceAssertionCreationEventSchema,
  balanceAssertionDeletionEventSchema,
  balanceAssertionPatchEventSchema,
} from '@/ledger/balanceAssertions/BalanceAssertion.ts'
import { genOrigId } from '@/ledger/origins/OrigId.ts'
import { collect, createInMemoryActionLog } from '../inMemory.ts'

describe('BalanceAssertionActionLogCmdSvc', () => {
  it('createBalanceAssertion appends a create-balance-assertion row with a matching payload', async () => {
    const log = createInMemoryActionLog()
    const event = balanceAssertionCreationEventSchema.parse({
      id: genAsrtId(),
      origId: genOrigId(),
      acctId: genAcctId(),
      assertionDate: '2026-01-31',
      balance: '$1,234.56',
    })

    const result = await log.cmdSvcs.balanceAssertions.createBalanceAssertion(event)
    expect(result).not.toBeNull()

    const [action] = await collect(log.readActions())
    expect(action!.actionType).toBe('create-balance-assertion')
    expect((action!.payload as { balance: string }).balance as string).toBe('$1,234.56')
  })

  it('patchBalanceAssertion appends an update-balance-assertion row', async () => {
    const log = createInMemoryActionLog()
    const patch = balanceAssertionPatchEventSchema.parse({
      id: genAsrtId(),
      origId: genOrigId(),
      balance: '$750.00',
    })

    await log.cmdSvcs.balanceAssertions.patchBalanceAssertion(patch)

    const [action] = await collect(log.readActions())
    expect(action!.actionType).toBe('update-balance-assertion')
  })

  it('deleteBalanceAssertion appends a delete-balance-assertion row', async () => {
    const log = createInMemoryActionLog()
    const deletion = balanceAssertionDeletionEventSchema.parse({
      id: genAsrtId(),
      origId: genOrigId(),
    })

    await log.cmdSvcs.balanceAssertions.deleteBalanceAssertion(deletion)

    const [action] = await collect(log.readActions())
    expect(action!.actionType).toBe('delete-balance-assertion')
  })
})
