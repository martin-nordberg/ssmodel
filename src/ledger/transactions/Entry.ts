import { z } from 'zod'
import { acctIdSchema } from '@/ledger/accounts/AcctId.ts'
import { type CurrencyAmt, currencyAmtSchema, toCents } from '@/ledger/core/CurrencyAmt.ts'

/** Base schema for a Checquery entry's details. */
export const entryAttributesSchema = z.strictObject({
  /** The account posted to. */
  acctId: acctIdSchema,

  /** The credit amount of the entry. */
  credit: currencyAmtSchema,

  /** The debit amount of the entry.  */
  debit: currencyAmtSchema,
})

/** True if exactly one of credit/debit is zero, comparing by value so equivalent formats (e.g. "($0.00)") match. */
const creditXorDebit = (entry: { credit: CurrencyAmt; debit: CurrencyAmt }): boolean => {
  const crIsZero = toCents(entry.credit) === 0
  const drIsZero = toCents(entry.debit) === 0
  return crIsZero !== drIsZero
}

const creditXorDebitMessage = 'An entry must have a debit or a credit, but not both.'

/** Schema for an entry as query output. */
export const entryReadSchema = entryAttributesSchema.refine(creditXorDebit, { error: creditXorDebitMessage }).readonly()

export type Entry = z.infer<typeof entryReadSchema>

/** Sub-schema for entry creation. */
export const entryWriteSchema = entryAttributesSchema
  .extend({
    credit: entryAttributesSchema.shape.credit.default(currencyAmtSchema.parse('$0.00')),
    debit: entryAttributesSchema.shape.debit.default(currencyAmtSchema.parse('$0.00')),
  })
  .refine(creditXorDebit, { error: creditXorDebitMessage })
  .readonly()

export type EntryToWrite = z.infer<typeof entryWriteSchema>

/** Sub-schema for entry patches. A patch that doesn't touch credit/debit at all is fine (e.g. re-pointing
 * acctId only); but since the credit-xor-debit invariant can't be checked against just one new value
 * without knowing the other's current stored value, a patch that changes either must supply both. */
const creditXorDebitPatch = (entry: { credit?: CurrencyAmt; debit?: CurrencyAmt }): boolean => {
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
