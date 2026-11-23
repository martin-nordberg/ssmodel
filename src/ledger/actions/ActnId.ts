import { createId } from '@paralleldrive/cuid2'
import { z } from 'zod'

/** Schema for an action ID. */
export const actnIdLength = 28
export const actnIdPrefix = 'actn'
export const actnIdSchema = z
  .cuid2({ message: `Action ID must be a string in CUID2 format with prefix '${actnIdPrefix}'.` })
  .trim()
  .length(actnIdLength)
  .startsWith(actnIdPrefix)
  .brand('ActnId')
export type ActnId = z.infer<typeof actnIdSchema>

/** Generates a new ID for an action. */
export const genActnId: () => ActnId = () => actnIdSchema.parse(actnIdPrefix + createId())
