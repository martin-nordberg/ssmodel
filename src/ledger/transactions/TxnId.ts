import { createId } from '@paralleldrive/cuid2'
import { z } from 'zod'

/** Schema for a transaction ID. */
export const txnIdLength = 28
export const txnIdPrefix = 'trxn'
export const txnIdSchema = z
  .cuid2({ message: `Transaction ID must be a string in CUID2 format with prefix '${txnIdPrefix}'.` })
  .trim()
  .length(txnIdLength)
  .startsWith(txnIdPrefix)
  .brand('TxnId')
export type TxnId = z.infer<typeof txnIdSchema>

/** Generates a new ID for a transaction. */
export const genTxnId: () => TxnId = () => txnIdSchema.parse(txnIdPrefix + createId())
