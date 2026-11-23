import { z } from 'zod'
import { type AcctCtgId, acctCtgIdSchema } from '@/ledger/accountCategories/AcctCtgId.ts'
import { acctTypeForRootCtgId, isRootAcctCtgId } from '@/ledger/accountCategories/AcctCtgRoot.ts'
import type { AcctTypeStr } from '@/ledger/accounts/AcctType.ts'
import { acctTypeSchema } from '@/ledger/accounts/AcctType.ts'
import { descriptionSchema } from '@/ledger/core/Description.ts'
import { hlcSchema } from '@/ledger/core/HybridLogicalClock.ts'
import { nameSchema } from '@/ledger/core/Name.ts'
import { origIdSchema } from '@/ledger/origins/OrigId.ts'

/**
 * Checks that a category isn't its own parent. This is checkable purely from a delta, so it applies to
 * the patch schema too -- everything else about hierarchy (parent's acctType must match, no cycles through
 * other categories) needs the full category set and is enforced in application code.
 */
const noSelfParentCtg = (ctg: { id: AcctCtgId; parentCtgId?: AcctCtgId }): boolean =>
  ctg.parentCtgId === undefined || ctg.parentCtgId !== ctg.id

const noSelfParentCtgMessage = 'An account category cannot be its own parent.'

/**
 * Checks that a category has no parent if and only if it is one of the five predefined root categories.
 * This describes a *complete* category state, so it only applies to the read and creation schemas -- a
 * patch that simply doesn't mention parentCtgId isn't claiming anything about root-ness one way or the
 * other, so applying this to accountCategoryPatchEventSchema would wrongly reject any patch to a non-root
 * category that doesn't happen to touch parentCtgId (the common case).
 */
const rootIffNoParentCtg = (ctg: { id: AcctCtgId; parentCtgId?: AcctCtgId }): boolean =>
  (ctg.parentCtgId === undefined) === isRootAcctCtgId(ctg.id)

const rootIffNoParentCtgMessage =
  'An account category has no parent if and only if it is one of the five predefined root categories.'

/**
 * Checks that if a category's id is a predefined root, its acctType matches the type that root represents
 * (e.g. the Assets root's acctType must be ASSET, never LIABILITY). Only applies to the read and creation
 * schemas -- acctType is immutable after creation (see accountCategoryPatchEventSchema, which omits the
 * field entirely), so there's nothing for this to check on a patch.
 */
const rootAcctTypeMatchesCtg = (ctg: { id: AcctCtgId; acctType?: AcctTypeStr }): boolean => {
  if (ctg.acctType === undefined) return true
  const expectedType = acctTypeForRootCtgId(ctg.id)
  return expectedType === undefined || expectedType === ctg.acctType
}

const rootAcctTypeMatchesCtgMessage = "A predefined root category's acctType must match the type it represents."

/** Base schema for a Checquery account category's details. */
const accountCategoryAttributesSchema = z.strictObject({
  /** The unique ID of the account category. */
  id: acctCtgIdSchema,

  /** The ID of the origin (who/where) that created or most recently modified this category. */
  origId: origIdSchema,

  /**
   * The ID of this category's parent in the category hierarchy. Absent for the five predefined root
   * categories (see AcctCtgRoot.ts); required (by application logic, not this schema) for all others.
   */
  parentCtgId: acctCtgIdSchema.optional(),

  /** The account type of the category. */
  acctType: acctTypeSchema,

  /** The name of the category. */
  name: nameSchema,

  /* A short description of the category. */
  description: descriptionSchema,
})

/** Schema for an account category. */
export const accountCategoryReadSchema = accountCategoryAttributesSchema
  .refine(noSelfParentCtg, noSelfParentCtgMessage)
  .refine(rootIffNoParentCtg, rootIffNoParentCtgMessage)
  .refine(rootAcctTypeMatchesCtg, rootAcctTypeMatchesCtgMessage)
  .readonly()

export type AccountCategory = z.infer<typeof accountCategoryReadSchema>

/** Sub-schema for account category creation. */
export const accountCategoryCreationEventSchema = accountCategoryAttributesSchema
  .extend({
    description: accountCategoryAttributesSchema.shape.description.default(descriptionSchema.parse('')),
    hlc: hlcSchema.optional(),
  })
  .refine(noSelfParentCtg, noSelfParentCtgMessage)
  .refine(rootIffNoParentCtg, rootIffNoParentCtgMessage)
  .refine(rootAcctTypeMatchesCtg, rootAcctTypeMatchesCtgMessage)
  .readonly()

export type AccountCategoryCreationEvent = z.infer<typeof accountCategoryCreationEventSchema>

/** Schema for account category deletion. */
export const accountCategoryDeletionEventSchema = z.object({
  /** The unique ID of the account category. */
  id: acctCtgIdSchema,

  /** The ID of the origin (who/where) performing the deletion. */
  origId: origIdSchema,

  hlc: hlcSchema.optional(),
})

export type AccountCategoryDeletionEvent = z.infer<typeof accountCategoryDeletionEventSchema>

/**
 * Sub-schema for account category patches. acctType is omitted entirely (not just optional) -- a
 * category's type is fixed at creation and can never be changed afterward, so a patch payload that includes
 * acctType at all is rejected as an unrecognized field, regardless of its value.
 */
export const accountCategoryPatchEventSchema = accountCategoryAttributesSchema
  .omit({ acctType: true })
  .extend({
    hlc: hlcSchema.optional(),
  })
  .partial({
    parentCtgId: true,
    name: true,
    description: true,
  })
  .refine(noSelfParentCtg, noSelfParentCtgMessage)
  .readonly()

export type AccountCategoryPatchEvent = z.infer<typeof accountCategoryPatchEventSchema>
