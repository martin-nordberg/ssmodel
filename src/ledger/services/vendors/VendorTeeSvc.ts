import type { IVendorCmdSvc } from '@/ledger/services/vendors/IVendorCmdSvc.ts'
import type { IVendorQrySvc } from '@/ledger/services/vendors/IVendorQrySvc.ts'
import type { IVendorSvc } from '@/ledger/services/vendors/IVendorSvc.ts'
import type { Vendor, VendorCreationEvent, VendorDeletionEvent, VendorPatchEvent } from '@/ledger/vendors/Vendor.ts'
import type { VndrId } from '@/ledger/vendors/VndrId.ts'

export class VendorTeeSvc implements IVendorSvc {
  private readonly qrySvc: IVendorQrySvc
  private readonly cmdSvcs: IVendorCmdSvc[]

  constructor(qrySvc: IVendorQrySvc, cmdSvcs: IVendorCmdSvc[]) {
    this.qrySvc = qrySvc
    this.cmdSvcs = cmdSvcs
  }

  /** Creates a new vendor with given attributes. */
  async createVendor(vendorCreation: VendorCreationEvent): Promise<VendorCreationEvent | null> {
    let result: VendorCreationEvent | null = vendorCreation
    for (const svc of this.cmdSvcs) {
      result = result ? await svc.createVendor(result) : null
    }
    return result
  }

  /** Deletes a given vendor. */
  async deleteVendor(vendorDeletion: VendorDeletionEvent): Promise<VendorDeletionEvent | null> {
    let result: VendorDeletionEvent | null = vendorDeletion
    for (const svc of this.cmdSvcs) {
      result = result ? await svc.deleteVendor(result) : null
    }
    return result
  }

  /** Finds the vendor with given unique ID */
  async findVendorById(vendorId: VndrId): Promise<Vendor | null> {
    return this.qrySvc.findVendorById(vendorId)
  }

  /** Finds the entire list of vendors */
  async findVendorsAll(): Promise<Vendor[]> {
    return this.qrySvc.findVendorsAll()
  }

  /** Counts non-deleted vendors. */
  async countVendorsAll(): Promise<number> {
    return this.qrySvc.countVendorsAll()
  }

  /** Checks if a vendor is used in any transaction. */
  async isVendorInUse(vendorId: VndrId): Promise<boolean> {
    return this.qrySvc.isVendorInUse(vendorId)
  }

  /** Updates a vendor's attributes. */
  async patchVendor(vendorPatch: VendorPatchEvent): Promise<VendorPatchEvent | null> {
    let result: VendorPatchEvent | null = vendorPatch
    for (const svc of this.cmdSvcs) {
      result = result ? await svc.patchVendor(result) : null
    }
    return result
  }
}
