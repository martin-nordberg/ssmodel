import type { Vendor } from '@/ledger/vendors/Vendor.ts'
import type { VndrId } from '@/ledger/vendors/VndrId.ts'

export interface IVendorQrySvc {
  /** Finds the vendor with given unique ID */
  findVendorById(vendorId: VndrId): Promise<Vendor | null>

  /** Finds the entire list of vendors */
  findVendorsAll(): Promise<Vendor[]>

  /** Counts non-deleted vendors. */
  countVendorsAll(): Promise<number>

  /** Checks if a vendor is used in any transaction. */
  isVendorInUse(vendorId: VndrId): Promise<boolean>
}
