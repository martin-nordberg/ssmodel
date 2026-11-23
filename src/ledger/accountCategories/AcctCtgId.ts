import { createId } from '@paralleldrive/cuid2'
import { z } from 'zod'

/** Schema for an account category ID. */
export const acctCtgIdLength = 28
export const acctCtgIdPrefix = 'actg'
export const acctCtgIdSchema = z
  .cuid2({ message: `Account category ID must be a string in CUID2 format with prefix '${acctCtgIdPrefix}'.` })
  .trim()
  .length(acctCtgIdLength)
  .startsWith(acctCtgIdPrefix)
  .brand('AcctCtgId')
export type AcctCtgId = z.infer<typeof acctCtgIdSchema>

/** Generates a new ID for an account category. */
export const genAcctCtgId: () => AcctCtgId = () => acctCtgIdSchema.parse(acctCtgIdPrefix + createId())
