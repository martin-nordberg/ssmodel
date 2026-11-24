import { z } from 'zod'
import { type DescriptionStr, descriptionSchema } from '@/ledger/core/Description.ts'
import { hlcSchema } from '@/ledger/core/HybridLogicalClock.ts'
import { type IsoDate, isoDateSchema } from '@/ledger/core/IsoDate.ts'
import { origIdSchema } from '@/ledger/origins/OrigId.ts'
import { entriesReadSchema, entriesWriteSchema } from '@/ledger/transactions/Entries.ts'
import { txnIdSchema } from '@/ledger/transactions/TxnId.ts'
import { type VndrId, vndrIdSchema } from '@/ledger/vendors/VndrId.ts'

/** Base schema for a Checquery transaction's details. */
const transactionAttributesSchema = z.strictObject({
  /** The transaction sequence number. */
  id: txnIdSchema,

  /** The ID of the origin (who/where) that created or most recently modified this transaction. */
  origId: origIdSchema,

  /**
   * The date money changed hands (e.g. at the store), used for reporting purposes. Has no default of
   * its own, but if left unset while clearedDate is provided when a transaction is saved, it takes
   * clearedDate's value.
   */
  postDate: isoDateSchema,

  /**
   * The date the transaction reached the bank, entered by hand or (in the future) imported from a
   * bank CSV. Unrelated to any BalanceAssertion's date -- an assertion instead sums every entry whose
   * transaction has cleared by the assertion's own date. Never defaulted from postDate; if the user
   * doesn't enter it, it simply stays unset.
   */
  clearedDate: isoDateSchema.optional(),

  /* The check number or similar code. */
  code: z.string(),

  /** The ID of the vendor (payee or payor). */
  vndrId: vndrIdSchema.optional(),

  /** A description of the transaction. */
  description: descriptionSchema,

  /** Whether this transaction has been flagged for the user to look at again. */
  needsReview: z.boolean(),
})

/** Validates that a transaction has either a vendor or a description (or both). */
function hasVendorOrDescription(txn: { vndrId?: VndrId | undefined; description?: DescriptionStr | undefined }) {
  if (txn.vndrId !== undefined) {
    return true
  }
  return txn.description !== undefined && txn.description.trim() !== ''
}

const hasVendorOrDescriptionMessage = 'A transaction must have a vendor or a description (or both).'

/** Validates that, whenever both dates are present in the same payload, postDate is on or before clearedDate.
 * Only ever sees what's actually in this payload -- a patch that touches just one of the two dates can't be
 * fully checked here (the other value lives in whatever's already stored), but the client always submits
 * both together on save (see useTransactionRowForm.ts), so this covers the real save path. Historical actions
 * from before this constraint existed are fixed up at materialization time instead, not rejected here -- see
 * TransactionMaterializedStoreSvc's createTransaction/patchTransaction. */
function postDateOnOrBeforeClearedDate(txn: { postDate?: IsoDate; clearedDate?: IsoDate | null }) {
  if (txn.postDate === undefined || txn.clearedDate === undefined || txn.clearedDate === null) {
    return true
  }
  return txn.postDate <= txn.clearedDate // ISO "YYYY-MM-DD" strings compare lexically
}

const postDateOnOrBeforeClearedDateMessage = 'Posted date must be on or before cleared date.'

/** The date used for register/log display, sorting, and balance-assertion cutoffs: clearedDate when present,
 * otherwise postDate. Deliberately a plain function, not a schema field -- it's fully derived from the other
 * two fields and has no storage of its own (see tasks/done/balance-assertions-implementation-plan.md §1a). */
export function transactionDate(txn: { postDate: IsoDate; clearedDate?: IsoDate }): IsoDate {
  return txn.clearedDate ?? txn.postDate
}

/** Sub-schema for transaction before it has entries added. */
export const transactionBeforeEntriesSchema = transactionAttributesSchema.readonly()

export type TransactionBeforeEntries = z.infer<typeof transactionBeforeEntriesSchema>

/** Schema for a transaction. */
export const transactionReadSchema = transactionAttributesSchema
  .extend({
    /** The two or more entries in the transaction. */
    entries: entriesReadSchema,
  })
  .refine(hasVendorOrDescription, { error: hasVendorOrDescriptionMessage })
  .readonly()

export type Transaction = z.infer<typeof transactionReadSchema>

/** Schema for transaction creation. */
export const transactionCreationEventSchema = transactionAttributesSchema
  .extend({
    code: transactionAttributesSchema.shape.code.default(''),
    description: transactionAttributesSchema.shape.description.default(descriptionSchema.parse('')),
    needsReview: transactionAttributesSchema.shape.needsReview.default(false),
    hlc: hlcSchema.optional(),

    /** The two or more entries in the transaction. */
    entries: entriesWriteSchema,
  })
  .refine(hasVendorOrDescription, { error: hasVendorOrDescriptionMessage })
  .refine(postDateOnOrBeforeClearedDate, { error: postDateOnOrBeforeClearedDateMessage })
  .readonly()

export type TransactionCreationEvent = z.infer<typeof transactionCreationEventSchema>

/** Schema for transaction deletion. */
export const transactionDeletionEventSchema = z.object({
  /** The unique ID of the transaction. */
  id: txnIdSchema,

  /** The ID of the origin (who/where) performing the deletion. */
  origId: origIdSchema,

  hlc: hlcSchema.optional(),
})

export type TransactionDeletionEvent = z.infer<typeof transactionDeletionEventSchema>

/** Schema for transaction patches. */
export const transactionPatchEventSchema = transactionAttributesSchema
  .extend({
    hlc: hlcSchema.optional(),
    /** The two or more entries in the transaction. */
    entries: entriesWriteSchema,
    /** A new cleared date, or null to clear it (ProvisionLens; Checquery patches never clear it). */
    clearedDate: isoDateSchema.nullable(),
    /** A new vendor, or null for none (ProvisionLens). */
    vndrId: vndrIdSchema.nullable(),
  })
  .partial({
    code: true,
    postDate: true,
    clearedDate: true,
    description: true,
    entries: true,
    vndrId: true,
    needsReview: true,
  })
  .refine(postDateOnOrBeforeClearedDate, { error: postDateOnOrBeforeClearedDateMessage })
  .readonly()

export type TransactionPatchEvent = z.infer<typeof transactionPatchEventSchema>
