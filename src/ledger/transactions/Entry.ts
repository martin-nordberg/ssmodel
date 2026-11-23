import { z } from 'zod'
import { acctIdSchema } from '@/ledger/accounts/AcctId.ts'
import { type Cents, centsSchema } from '@/ledger/core/money.ts'

/** Base schema for a Checquery entry's details. */
export const entryAttributesSchema = z.strictObject({
  /** The account posted to. */
  acctId: acctIdSchema,

  /** The credit amount of the entry, in cents. */
  credit: centsSchema,

  /** The debit amount of the entry, in cents. */
  debit: centsSchema,
})

/** True if exactly one of credit/debit is zero. */
const creditXorDebit = (entry: { credit: Cents; debit: Cents }): boolean => (entry.credit === 0) !== (entry.debit === 0)

const creditXorDebitMessage = 'An entry must have a debit or a credit, but not both.'

/** Schema for an entry as query output. */
export const entryReadSchema = entryAttributesSchema.refine(creditXorDebit, { error: creditXorDebitMessage }).readonly()

export type Entry = z.infer<typeof entryReadSchema>

/** Sub-schema for entry creation. */
export const entryWriteSchema = entryAttributesSchema
  .extend({
    credit: entryAttributesSchema.shape.credit.default(0),
    debit: entryAttributesSchema.shape.debit.default(0),
  })
  .refine(creditXorDebit, { error: creditXorDebitMessage })
  .readonly()

export type EntryToWrite = z.infer<typeof entryWriteSchema>

/** Sub-schema for entry patches. A patch that doesn't touch credit/debit at all is fine (e.g. re-pointing
 * acctId only); but since the credit-xor-debit invariant can't be checked against just one new value
 * without knowing the other's current stored value, a patch that changes either must supply both. */
const creditXorDebitPatch = (entry: { credit?: Cents; debit?: Cents }): boolean => {
  if (entry.credit === undefined && entry.debit === undefined) {
    return true
  }
  if (entry.credit === undefined || entry.debit === undefined) {
    return false
  }
  return creditXorDebit({ credit: entry.credit, debit: entry.debit })
}

export const entryPatchSchema = z
  .strictObject({
    ...entryAttributesSchema.partial({
      acctId: true,
      credit: true,
      debit: true,
    }).shape,
  })
  .refine(creditXorDebitPatch, {
    error: 'A patch that changes the debit or credit must supply both, and satisfy the debit-xor-credit rule.',
  })
  .readonly()

export type EntryPatch = z.infer<typeof entryPatchSchema>
