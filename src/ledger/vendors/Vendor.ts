import { z } from 'zod'
import { acctIdSchema } from '@/ledger/accounts/AcctId.ts'
import { descriptionSchema } from '@/ledger/core/Description.ts'
import { hlcSchema } from '@/ledger/core/HybridLogicalClock.ts'
import { nameSchema } from '@/ledger/core/Name.ts'
import { origIdSchema } from '@/ledger/origins/OrigId.ts'
import { vndrIdSchema } from '@/ledger/vendors/VndrId.ts'

/** Base schema for a Checquery vendor's details. */
export const vendorAttributesSchema = z.strictObject({
  /** The unique ID of the vendor. */
  id: vndrIdSchema,

  /** The ID of the origin (who/where) that created or most recently modified this vendor. */
  origId: origIdSchema,

  /** The name of the vendor. */
  name: nameSchema,

  /* A short description of the vendor. */
  description: descriptionSchema,

  /** The ID of the default account for transactions with this vendor. */
  defaultAcctId: acctIdSchema.optional(),

  /** Whether the vendor is active. */
  isActive: z.boolean(),
})

/** Schema for a vendor. */
export const vendorReadSchema = vendorAttributesSchema.readonly()

export type Vendor = z.infer<typeof vendorReadSchema>

/** Sub-schema for vendor creation. */
export const vendorCreationEventSchema = vendorAttributesSchema
  .extend({
    description: vendorAttributesSchema.shape.description.default(descriptionSchema.parse('')),
    isActive: vendorAttributesSchema.shape.isActive.default(true),
    hlc: hlcSchema.optional(),
  })
  .readonly()

export type VendorCreationEvent = z.infer<typeof vendorCreationEventSchema>

/** Schema for vendor deletion. */
export const vendorDeletionEventSchema = z.object({
  /** The unique ID of the vendor. */
  id: vndrIdSchema,

  /** The ID of the origin (who/where) performing the deletion. */
  origId: origIdSchema,

  hlc: hlcSchema.optional(),
})

export type VendorDeletionEvent = z.infer<typeof vendorDeletionEventSchema>

/** Sub-schema for vendor updates. */
export const vendorPatchEventSchema = vendorAttributesSchema
  .extend({
    hlc: hlcSchema.optional(),
  })
  .partial({
    name: true,
    description: true,
    defaultAcctId: true,
    isActive: true,
  })
  .readonly()

export type VendorPatchEvent = z.infer<typeof vendorPatchEventSchema>
