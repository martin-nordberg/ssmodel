import { createId } from '@paralleldrive/cuid2'
import { z } from 'zod'

/** Schema for an account ID. */
export const acctIdLength = 28
export const acctIdPrefix = 'acct'
export const acctIdSchema = z
  .cuid2({ message: `Account ID must be a string in CUID2 format with prefix '${acctIdPrefix}'.` })
  .trim()
  .length(acctIdLength)
  .startsWith(acctIdPrefix)
  .brand('AcctId')
export type AcctId = z.infer<typeof acctIdSchema>

/** Generates a new ID for an account. */
export const genAcctId: () => AcctId = () => acctIdSchema.parse(acctIdPrefix + createId())
