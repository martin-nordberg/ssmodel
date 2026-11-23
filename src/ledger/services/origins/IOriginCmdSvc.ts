import type { OriginCreationEvent } from '@/ledger/origins/Origin.ts'

export interface IOriginCmdSvc {
  /** Creates a new origin with given attributes. Origins are immutable once created: there is no
   * update or delete, since amending or removing the record of who made a change would defeat its
   * purpose as an audit trail. */
  createOrigin(originCreation: OriginCreationEvent): Promise<OriginCreationEvent | null>
}
