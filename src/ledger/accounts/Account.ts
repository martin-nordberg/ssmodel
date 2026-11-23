import { z } from 'zod'
import { type AcctCtgId, acctCtgIdSchema } from '@/ledger/accountCategories/AcctCtgId.ts'
import { acctCtgIdEquity, acctCtgRootId } from '@/ledger/accountCategories/AcctCtgRoot.ts'
import { type AcctId, acctIdSchema } from '@/ledger/accounts/AcctId.ts'
import type { AcctTypeStr } from '@/ledger/accounts/AcctType.ts'
import { acctTypeSchema } from '@/ledger/accounts/AcctType.ts'
import { acctIdNetWorth } from '@/ledger/accounts/NetWorthAccount.ts'
import { descriptionSchema } from '@/ledger/core/Description.ts'
import { hlcSchema } from '@/ledger/core/HybridLogicalClock.ts'
import { nameSchema } from '@/ledger/core/Name.ts'
import { origIdSchema } from '@/ledger/origins/OrigId.ts'

/**
 * Checks that Net Worth is the one and only EQUITY account, pinned directly under the Equity root category
 * -- and, in the other direction, that nothing else can claim Net Worth's predefined ID under a different
 * type. Only applies to the read and creation schemas -- acctType is immutable after creation (see
 * accountPatchEventSchema, which omits the field entirely), so there's nothing for this to check on a patch.
 */
const equityAccountIsNetWorth = (acct: { id: AcctId; parentCtgId: AcctCtgId; acctType?: AcctTypeStr }): boolean => {
  if (acct.acctType === undefined) return true
  if (acct.acctType === 'EQUITY') {
    return acct.id === acctIdNetWorth && acct.parentCtgId === acctCtgIdEquity
  }
  return acct.id !== acctIdNetWorth
}

const equityAccountIsNetWorthMessage =
  'Net Worth is the only EQUITY account, and only Net Worth may use its predefined ID.'

/**
 * Checks that every account other than Net Worth has at least one level of categorization beyond its
 * type's root category -- no account (besides Net Worth) may sit directly under a root. Only applies to
 * the read and creation schemas, same reasoning as equityAccountIsNetWorth above.
 */
const nonEquityAccountBeyondRoot = (acct: { parentCtgId: AcctCtgId; acctType?: AcctTypeStr }): boolean => {
  if (acct.acctType === undefined || acct.acctType === 'EQUITY') return true
  return acct.parentCtgId !== acctCtgRootId[acct.acctType]
}

const nonEquityAccountBeyondRootMessage =
  "Every account other than Net Worth must be categorized at least one level beneath its type's root category."

/** Base schema for a Checquery account's details. */
const accountAttributesSchema = z.strictObject({
  /** The unique ID of the account. */
  id: acctIdSchema,

  /** The ID of the origin (who/where) that created or most recently modified this account. */
  origId: origIdSchema,

  /** The ID of this account's parent category. Every account has one -- see AccountCategory.ts. */
  parentCtgId: acctCtgIdSchema,

  /** The account type of the account. */
  acctType: acctTypeSchema,

  /** The name of the account. */
  name: nameSchema,

  /* A short description of the account. */
  description: descriptionSchema,

  /**
   * Whether this account is of primary interest for reporting and editing. Primary accounts are more
   * prominent and more easily opened in the ser interface.
   */
  isPrimary: z.boolean(),
})

/** Schema for an account. */
export const accountReadSchema = accountAttributesSchema
  .refine(equityAccountIsNetWorth, equityAccountIsNetWorthMessage)
  .refine(nonEquityAccountBeyondRoot, nonEquityAccountBeyondRootMessage)
  .readonly()

export type Account = z.infer<typeof accountReadSchema>

/** Sub-schema for account creation. */
export const accountCreationEventSchema = accountAttributesSchema
  .extend({
    description: accountAttributesSchema.shape.description.default(descriptionSchema.parse('')),
    isPrimary: accountAttributesSchema.shape.isPrimary.default(false),
    hlc: hlcSchema.optional(),
  })
  .refine(equityAccountIsNetWorth, equityAccountIsNetWorthMessage)
  .refine(nonEquityAccountBeyondRoot, nonEquityAccountBeyondRootMessage)
  .readonly()

export type AccountCreationEvent = z.infer<typeof accountCreationEventSchema>

/** Schema for account deletion. */
export const accountDeletionEventSchema = z.object({
  /** The unique ID of the account. */
  id: acctIdSchema,

  /** The ID of the origin (who/where) performing the deletion. */
  origId: origIdSchema,

  hlc: hlcSchema.optional(),
})

export type AccountDeletionEvent = z.infer<typeof accountDeletionEventSchema>

/**
 * Sub-schema for account patches. acctType is omitted entirely (not just optional) -- an account's type
 * is fixed at creation and can never be changed afterward, so a patch payload that includes acctType at
 * all is rejected as an unrecognized field, regardless of its value.
 */
export const accountPatchEventSchema = accountAttributesSchema
  .omit({ acctType: true })
  .extend({
    hlc: hlcSchema.optional(),
  })
  .partial({
    parentCtgId: true,
    name: true,
    description: true,
    isPrimary: true,
  })
  .readonly()

export type AccountPatchEvent = z.infer<typeof accountPatchEventSchema>
