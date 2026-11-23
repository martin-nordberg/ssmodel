import { createId } from '@paralleldrive/cuid2'
import { z } from 'zod'

/** Schema for an origin ID. */
export const origIdLength = 28
export const origIdPrefix = 'orig'
export const origIdSchema = z
  .cuid2({ message: `Origin ID must be a string in CUID2 format with prefix '${origIdPrefix}'.` })
  .trim()
  .length(origIdLength)
  .startsWith(origIdPrefix)
  .brand('OrigId')
export type OrigId = z.infer<typeof origIdSchema>

/** Generates a new ID for an origin. */
export const genOrigId: () => OrigId = () => origIdSchema.parse(origIdPrefix + createId())
