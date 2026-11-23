import { z } from 'zod'
import { acctIdSchema } from '@/ledger/accounts/AcctId.ts'
import { asrtIdSchema } from '@/ledger/balanceAssertions/AsrtId.ts'
import { hlcSchema } from '@/ledger/core/HybridLogicalClock.ts'
import { isoDateSchema } from '@/ledger/core/IsoDate.ts'
import { centsSchema } from '@/ledger/core/money.ts'
import { origIdSchema } from '@/ledger/origins/OrigId.ts'

/**
 * Base schema for a Checquery balance assertion's details. A balance assertion claims that, as of a given
 * date, the sum of every entry posted to the account whose transaction has cleared by that date equals a
 * stated balance -- pinning the ledger to an external source of truth (typically a bank statement). It
 * doesn't reference or create any transactions itself; it's checked by comparing that sum against the
 * asserted balance -- mismatches are flagged to the user as an orange "Out of Balance" row in the Register
 * (see buildRegisterRows.ts and balance-assertions-implementation-plan.md). Uniqueness of the (acctId,
 * assertionDate) pair is an application-level concern -- it needs the full set of assertions for an account
 * and isn't checkable from a single assertion, so it isn't enforced here; in practice it can't be violated
 * either, since the client only ever creates one via a per-date checkbox that disappears once an assertion
 * exists, and never lets that date be changed afterward.
 */
const balanceAssertionAttributesSchema = z.strictObject({
  /** The unique ID of the balance assertion. */
  id: asrtIdSchema,

  /** The ID of the origin (who/where) that created or most recently modified this assertion. */
  origId: origIdSchema,

  /** The account whose balance is being asserted. */
  acctId: acctIdSchema,

  /** The as-of date the asserted balance applies to. */
  assertionDate: isoDateSchema,

  /** The asserted balance as of assertionDate, in cents. */
  balance: centsSchema,
})

/** Schema for a balance assertion. */
export const balanceAssertionReadSchema = balanceAssertionAttributesSchema.readonly()

export type BalanceAssertion = z.infer<typeof balanceAssertionReadSchema>

/** Schema for balance assertion creation. */
export const balanceAssertionCreationEventSchema = balanceAssertionAttributesSchema
  .extend({
    hlc: hlcSchema.optional(),
  })
  .readonly()

export type BalanceAssertionCreationEvent = z.infer<typeof balanceAssertionCreationEventSchema>

/** Schema for balance assertion deletion. */
export const balanceAssertionDeletionEventSchema = z.object({
  /** The unique ID of the balance assertion. */
  id: asrtIdSchema,

  /** The ID of the origin (who/where) performing the deletion. */
  origId: origIdSchema,

  hlc: hlcSchema.optional(),
})

export type BalanceAssertionDeletionEvent = z.infer<typeof balanceAssertionDeletionEventSchema>

/** Sub-schema for balance assertion patches. */
export const balanceAssertionPatchEventSchema = balanceAssertionAttributesSchema
  .extend({
    hlc: hlcSchema.optional(),
  })
  .partial({
    acctId: true,
    assertionDate: true,
    balance: true,
  })
  .readonly()

export type BalanceAssertionPatchEvent = z.infer<typeof balanceAssertionPatchEventSchema>
