import { z } from 'zod'
import { hlcSchema } from '@/ledger/core/HybridLogicalClock.ts'
import { ipAddressSchema } from '@/ledger/core/IpAddress.ts'
import { nameSchema } from '@/ledger/core/Name.ts'
import { origIdSchema } from '@/ledger/origins/OrigId.ts'

/**
 * Base schema for a Checquery origin's details. An origin records who (a person's name) and where (an IP
 * address) a mutation came from. Origins are immutable once created -- there is no patch or deletion event,
 * since amending or removing the record of who made a change would defeat its purpose as an audit trail.
 */
const originAttributesSchema = z.strictObject({
  /** The unique ID of the origin. */
  id: origIdSchema,

  /** The name of the person the origin represents. */
  name: nameSchema,

  /** The IP address the origin represents. */
  ipAddress: ipAddressSchema,
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
