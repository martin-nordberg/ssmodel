import { z } from 'zod'
import { hlcSchema } from '@/ledger/core/HybridLogicalClock.ts'
import { ipAddressSchema } from '@/ledger/core/IpAddress.ts'
import { nameSchema } from '@/ledger/core/Name.ts'
import { origIdSchema } from '@/ledger/origins/OrigId.ts'

/**
 * Base schema for an origin's details. An origin records who made a change. In ProvisionLens that is a device/user
 * name from the app's settings [FR-LED-4]; origins from Checquery files also carry the IP address of the person's
 * session, which is kept as written. Origins are immutable once created -- there is no patch or deletion event,
 * since amending or removing the record of who made a change would defeat its purpose as an audit trail.
 */
const originAttributesSchema = z.strictObject({
  /** The unique ID of the origin. */
  id: origIdSchema,

  /** The device/user name (or, in Checquery files, the person's name) the origin represents. */
  name: nameSchema,

  /** The IP address of a Checquery session. Absent from origins ProvisionLens creates. */
  ipAddress: ipAddressSchema.optional(),
})

/** Schema for an origin. */
export const originReadSchema = originAttributesSchema.readonly()

export type Origin = z.infer<typeof originReadSchema>

/** Schema for origin creation. */
export const originCreationEventSchema = originAttributesSchema
  .extend({
    hlc: hlcSchema.optional(),
  })
  .readonly()

export type OriginCreationEvent = z.infer<typeof originCreationEventSchema>
