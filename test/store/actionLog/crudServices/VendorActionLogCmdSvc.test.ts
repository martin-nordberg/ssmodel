import { describe, expect, it } from 'bun:test'
import { genOrigId } from '@/ledger/origins/OrigId.ts'
import {
  vendorCreationEventSchema,
  vendorDeletionEventSchema,
  vendorPatchEventSchema,
} from '@/ledger/vendors/Vendor.ts'
import { genVndrId } from '@/ledger/vendors/VndrId.ts'
import { collect, createInMemoryActionLog } from '../inMemory.ts'

describe('VendorActionLogCmdSvc', () => {
  it('createVendor appends a create-vendor row with a matching payload', async () => {
    const log = createInMemoryActionLog()
    const event = vendorCreationEventSchema.parse({
      id: genVndrId(),
      origId: genOrigId(),
      name: 'Acme Corp',
    })

    const result = await log.cmdSvcs.vendors.createVendor(event)
    expect(result).not.toBeNull()

    const [action] = await collect(log.readActions())
    expect(action!.actionType).toBe('create-vendor')
    expect((action!.payload as { name: string }).name as string).toBe('Acme Corp')
  })

  it('patchVendor appends an update-vendor row', async () => {
    const log = createInMemoryActionLog()
    const patch = vendorPatchEventSchema.parse({
      id: genVndrId(),
      origId: genOrigId(),
      isActive: false,
    })

    await log.cmdSvcs.vendors.patchVendor(patch)

    const [action] = await collect(log.readActions())
    expect(action!.actionType).toBe('update-vendor')
    expect((action!.payload as { isActive: boolean }).isActive).toBe(false)
  })

  it('deleteVendor appends a delete-vendor row', async () => {
    const log = createInMemoryActionLog()
    const deletion = vendorDeletionEventSchema.parse({
      id: genVndrId(),
      origId: genOrigId(),
    })

    await log.cmdSvcs.vendors.deleteVendor(deletion)

    const [action] = await collect(log.readActions())
    expect(action!.actionType).toBe('delete-vendor')
  })
})
