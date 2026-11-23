import { createId } from '@paralleldrive/cuid2'
import { z } from 'zod'

/** Schema for a balance assertion ID. */
export const asrtIdLength = 28
export const asrtIdPrefix = 'asrt'
export const asrtIdSchema = z
  .cuid2({ message: `Balance assertion ID must be a string in CUID2 format with prefix '${asrtIdPrefix}'.` })
  .trim()
  .length(asrtIdLength)
  .startsWith(asrtIdPrefix)
  .brand('AsrtId')
export type AsrtId = z.infer<typeof asrtIdSchema>

/** Generates a new ID for a balance assertion. */
export const genAsrtId: () => AsrtId = () => asrtIdSchema.parse(asrtIdPrefix + createId())
