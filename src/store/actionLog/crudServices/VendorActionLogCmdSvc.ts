import type { IVendorCmdSvc } from '@/ledger/services/vendors/IVendorCmdSvc.ts'
import type { VendorCreationEvent, VendorDeletionEvent, VendorPatchEvent } from '@/ledger/vendors/Vendor.ts'
import type { ActionLog } from '@/store/actionLog/ActionLog.ts'

export class VendorActionLogCmdSvc implements IVendorCmdSvc {
  private readonly log: ActionLog

  constructor(log: ActionLog) {
    this.log = log
  }

  createVendor(vendorCreation: VendorCreationEvent): Promise<VendorCreationEvent | null> {
    return this.log.appendAction('create-vendor', vendorCreation)
  }

  patchVendor(vendorPatch: VendorPatchEvent): Promise<VendorPatchEvent | null> {
    return this.log.appendAction('update-vendor', vendorPatch)
  }

  deleteVendor(vendorDeletion: VendorDeletionEvent): Promise<VendorDeletionEvent | null> {
    return this.log.appendAction('delete-vendor', vendorDeletion)
  }
}
