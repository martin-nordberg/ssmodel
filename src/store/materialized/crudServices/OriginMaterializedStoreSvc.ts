import type { IpAddress } from '@/ledger/core/IpAddress.ts'
import type { NameStr } from '@/ledger/core/Name.ts'
import type { OrigId } from '@/ledger/origins/OrigId.ts'
import type { Origin, OriginCreationEvent } from '@/ledger/origins/Origin.ts'
import type { IOriginSvc } from '@/ledger/services/origins/IOriginSvc.ts'
import type { DbDriver } from '@/store/driver/DbDriver.ts'

type OriginRow = {
  id: string
  name: string
  ip_address: string | null
}

function rowToOrigin(row: OriginRow): Origin {
  return {
    id: row.id as OrigId,
    name: row.name as NameStr,
    ...(row.ip_address !== null ? { ipAddress: row.ip_address as IpAddress } : {}),
  } as Origin
}

/** The materialized-store half of the Origin entity -- see documentation/materialized-store.md. Origins are
 * immutable (no patch/delete action exists), so this is the simplest of the five: create and find only. */
export class OriginMaterializedStoreSvc implements IOriginSvc {
  private readonly db: DbDriver

  constructor(db: DbDriver) {
    this.db = db
  }

  async createOrigin(originCreation: OriginCreationEvent): Promise<OriginCreationEvent | null> {
    this.db.run(`INSERT INTO origins (id, name, ip_address) VALUES (?, ?, ?)`, [
      originCreation.id,
      originCreation.name,
      originCreation.ipAddress ?? null,
    ])
    return originCreation
  }

  async findOriginById(originId: OrigId): Promise<Origin | null> {
    const row = this.db.get(`SELECT * FROM origins WHERE id = ?`, [originId]) as OriginRow | null
    return row ? rowToOrigin(row) : null
  }

  async findOriginsAll(): Promise<Origin[]> {
    const rows = this.db.all(`SELECT * FROM origins ORDER BY name`) as OriginRow[]
    return rows.map(rowToOrigin)
  }

  async countOriginsAll(): Promise<number> {
    const row = this.db.get(`SELECT COUNT(*) as n FROM origins`) as { n: number }
    return row.n
  }
}
