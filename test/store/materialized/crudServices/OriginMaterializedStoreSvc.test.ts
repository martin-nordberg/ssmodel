import { describe, expect, it } from 'bun:test'
import { genOrigId } from '@/ledger/origins/OrigId.ts'
import { originCreationEventSchema } from '@/ledger/origins/Origin.ts'
import { openBunDriver } from '@/store/driver/bunSqlite.ts'
import { OriginMaterializedStoreSvc } from '@/store/materialized/crudServices/OriginMaterializedStoreSvc.ts'
import { createSchema } from '@/store/materialized/schema.ts'

function makeSvc() {
  const db = openBunDriver()
  createSchema(db)
  return { db, svc: new OriginMaterializedStoreSvc(db) }
}

describe('OriginMaterializedStoreSvc', () => {
  it('creates an origin retrievable by id', async () => {
    const { svc } = makeSvc()
    const event = originCreationEventSchema.parse({
      id: genOrigId(),
      name: 'Jane Doe',
      ipAddress: '192.168.1.1',
    })

    await svc.createOrigin(event)
    const found = await svc.findOriginById(event.id)

    expect(found).not.toBeNull()
    expect(found!.name as string).toBe('Jane Doe')
    expect(found!.ipAddress as string).toBe('192.168.1.1')
  })

  it('findOriginById returns null for an unknown id', async () => {
    const { svc } = makeSvc()
    expect(await svc.findOriginById(genOrigId())).toBeNull()
  })

  it('findOriginsAll returns every origin, ordered by name (no soft-delete concept)', async () => {
    const { svc } = makeSvc()
    const b = originCreationEventSchema.parse({ id: genOrigId(), name: 'B Person', ipAddress: '1.1.1.1' })
    const a = originCreationEventSchema.parse({ id: genOrigId(), name: 'A Person', ipAddress: '2.2.2.2' })
    await svc.createOrigin(b)
    await svc.createOrigin(a)

    const all = await svc.findOriginsAll()
    expect(all.map((o) => o.name as string)).toEqual(['A Person', 'B Person'])
  })

  it('countOriginsAll counts every origin (no soft-delete concept)', async () => {
    const { svc } = makeSvc()
    await svc.createOrigin(originCreationEventSchema.parse({ id: genOrigId(), name: 'A', ipAddress: '1.1.1.1' }))
    await svc.createOrigin(originCreationEventSchema.parse({ id: genOrigId(), name: 'B', ipAddress: '2.2.2.2' }))
    expect(await svc.countOriginsAll()).toBe(2)
  })
})
