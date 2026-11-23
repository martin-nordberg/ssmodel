import { z } from 'zod'
import { actionTypeSchema } from '@/ledger/actions/ActionType.ts'
import { actnIdSchema } from '@/ledger/actions/ActnId.ts'
import { hlcSchema } from '@/ledger/core/HybridLogicalClock.ts'

/**
 * Schema for an action -- one row of the action log (see documentation/action-log.md). Unlike every other
 * entity, this has no separate creation-event schema: ActionLog mints an action's id and hlc together,
 * atomically, immediately before it exists at all, so there is never a partially-formed action for a second
 * schema to describe.
 */
export const actionReadSchema = z
  .strictObject({
    /** The unique ID of the action. */
    id: actnIdSchema,

    /** The kind of mutation this action recorded. */
    actionType: actionTypeSchema,

    /** The hybrid logical clock value assigned to this action. */
    hlc: hlcSchema,

    /** The decoded JSON payload -- an XxxCreationEvent/XxxPatchEvent/XxxDeletionEvent shape determined by
     * actionType, not independently validated here (see documentation/action-log-changes.md §4). */
    payload: z.unknown(),
  })
  .readonly()

export type Action = z.infer<typeof actionReadSchema>
