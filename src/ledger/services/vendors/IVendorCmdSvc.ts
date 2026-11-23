import type { VendorCreationEvent, VendorDeletionEvent, VendorPatchEvent } from '@/ledger/vendors/Vendor.ts'

export interface IVendorCmdSvc {
  /** Creates a new vendor with given attributes. */
  createVendor(vendorCreation: VendorCreationEvent): Promise<VendorCreationEvent | null>

  /** Deletes a given vendor. */
  deleteVendor(vendorDeletion: VendorDeletionEvent): Promise<VendorDeletionEvent | null>

  /** Updates a vendor's attributes. */
  patchVendor(vendorPatch: VendorPatchEvent): Promise<VendorPatchEvent | null>
}
