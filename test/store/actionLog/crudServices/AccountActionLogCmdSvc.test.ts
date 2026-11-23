import { describe, expect, it } from 'bun:test'
import { genAcctCtgId } from '@/ledger/accountCategories/AcctCtgId.ts'
import {
  accountCreationEventSchema,
  accountDeletionEventSchema,
  accountPatchEventSchema,
} from '@/ledger/accounts/Account.ts'
import { genAcctId } from '@/ledger/accounts/AcctId.ts'
import { genOrigId } from '@/ledger/origins/OrigId.ts'
import { collect, createInMemoryActionLog } from '../inMemory.ts'

describe('AccountActionLogCmdSvc', () => {
  it('createAccount appends a create-account row with a matching payload', async () => {
    const log = createInMemoryActionLog()
    const event = accountCreationEventSchema.parse({
      id: genAcctId(),
      origId: genOrigId(),
      parentCtgId: genAcctCtgId(),
      acctType: 'ASSET',
      name: 'Checking',
    })

    const result = await log.cmdSvcs.accounts.createAccount(event)
    expect(result).not.toBeNull()
    expect(result!.hlc).toBeDefined()

    const [action] = await collect(log.readActions())
    expect(action!.actionType).toBe('create-account')
    expect((action!.payload as { id: string }).id).toBe(event.id)
    expect((action!.payload as { name: string }).name as string).toBe('Checking')
  })

  it('patchAccount appends an update-account row', async () => {
    const log = createInMemoryActionLog()
    const patch = accountPatchEventSchema.parse({
      id: genAcctId(),
      origId: genOrigId(),
      name: 'Renamed',
    })

    const result = await log.cmdSvcs.accounts.patchAccount(patch)
    expect(result).not.toBeNull()

    const [action] = await collect(log.readActions())
    expect(action!.actionType).toBe('update-account')
    expect((action!.payload as { name: string }).name as string).toBe('Renamed')
  })

  it('deleteAccount appends a delete-account row', async () => {
    const log = createInMemoryActionLog()
    const deletion = accountDeletionEventSchema.parse({
      id: genAcctId(),
      origId: genOrigId(),
    })

    const result = await log.cmdSvcs.accounts.deleteAccount(deletion)
    expect(result).not.toBeNull()

    const [action] = await collect(log.readActions())
    expect(action!.actionType).toBe('delete-account')
    expect((action!.payload as { id: string }).id).toBe(deletion.id)
  })
})
