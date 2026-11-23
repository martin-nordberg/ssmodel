import { createId } from '@paralleldrive/cuid2'
import { z } from 'zod'

/** Schema for a vendor ID. */
export const vndrIdLength = 28
export const vndrIdPrefix = 'vndr'
export const vndrIdSchema = z
  .cuid2({ message: `Vendor ID must be a string in CUID2 format with prefix '${vndrIdPrefix}'.` })
  .trim()
  .length(vndrIdLength)
  .startsWith(vndrIdPrefix)
  .brand('VndrId')
export type VndrId = z.infer<typeof vndrIdSchema>

/** Generates a new ID for a vendor. */
export const genVndrId: () => VndrId = () => vndrIdSchema.parse(vndrIdPrefix + createId())
