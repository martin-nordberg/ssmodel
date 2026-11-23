import type { OriginCreationEvent } from '@/ledger/origins/Origin.ts'
import type { IOriginCmdSvc } from '@/ledger/services/origins/IOriginCmdSvc.ts'
import type { ActionLog } from '@/store/actionLog/ActionLog.ts'

export class OriginActionLogCmdSvc implements IOriginCmdSvc {
  private readonly log: ActionLog

  constructor(log: ActionLog) {
    this.log = log
  }

  createOrigin(originCreation: OriginCreationEvent): Promise<OriginCreationEvent | null> {
    return this.log.appendAction('create-origin', originCreation)
  }
}
