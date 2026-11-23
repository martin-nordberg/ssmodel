import type { OrigId } from '@/ledger/origins/OrigId.ts'
import type { Origin } from '@/ledger/origins/Origin.ts'

export interface IOriginQrySvc {
  /** Finds the origin with given unique ID */
  findOriginById(originId: OrigId): Promise<Origin | null>

  /** Finds the entire list of origins */
  findOriginsAll(): Promise<Origin[]>

  /** Counts origins. Origins are immutable and never deleted, so this is simply the total. */
  countOriginsAll(): Promise<number>
}
