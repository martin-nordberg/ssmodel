import type { OrigId } from '@/ledger/origins/OrigId.ts'
import type { Origin, OriginCreationEvent } from '@/ledger/origins/Origin.ts'
import type { IOriginCmdSvc } from '@/ledger/services/origins/IOriginCmdSvc.ts'
import type { IOriginQrySvc } from '@/ledger/services/origins/IOriginQrySvc.ts'
import type { IOriginSvc } from '@/ledger/services/origins/IOriginSvc.ts'

export class OriginTeeSvc implements IOriginSvc {
  private readonly qrySvc: IOriginQrySvc
  private readonly cmdSvcs: IOriginCmdSvc[]

  constructor(qrySvc: IOriginQrySvc, cmdSvcs: IOriginCmdSvc[]) {
    this.qrySvc = qrySvc
    this.cmdSvcs = cmdSvcs
  }

  /** Creates a new origin with given attributes. */
  async createOrigin(originCreation: OriginCreationEvent): Promise<OriginCreationEvent | null> {
    let result: OriginCreationEvent | null = originCreation
    for (const svc of this.cmdSvcs) {
      result = result ? await svc.createOrigin(result) : null
    }
    return result
  }

  /** Finds the origin with given unique ID */
  async findOriginById(originId: OrigId): Promise<Origin | null> {
    return this.qrySvc.findOriginById(originId)
  }

  /** Finds the entire list of origins */
  async findOriginsAll(): Promise<Origin[]> {
    return this.qrySvc.findOriginsAll()
  }

  /** Counts origins. */
  async countOriginsAll(): Promise<number> {
    return this.qrySvc.countOriginsAll()
  }
}
