import type { z } from 'zod'
import {
  accountCategoryCreationEventSchema,
  accountCategoryDeletionEventSchema,
  accountCategoryPatchEventSchema,
} from '@/ledger/accountCategories/AccountCategory.ts'
import {
  accountCreationEventSchema,
  accountDeletionEventSchema,
  accountPatchEventSchema,
} from '@/ledger/accounts/Account.ts'
import {
  balanceAssertionCreationEventSchema,
  balanceAssertionDeletionEventSchema,
  balanceAssertionPatchEventSchema,
} from '@/ledger/balanceAssertions/BalanceAssertion.ts'
import type { OrigId } from '@/ledger/origins/OrigId.ts'
import type { SvcBundle } from '@/ledger/services/SvcBundle.ts'
import {
  transactionCreationEventSchema,
  transactionDeletionEventSchema,
  transactionPatchEventSchema,
} from '@/ledger/transactions/Transaction.ts'
import {
  vendorCreationEventSchema,
  vendorDeletionEventSchema,
  vendorPatchEventSchema,
} from '@/ledger/vendors/Vendor.ts'
import type { LedgerStore } from '@/store/ledger/LedgerStore.ts'

// One open ledger behind the store worker's protocol [NFR-ARCH-8]. Commands are validated with the domain's Zod
// schemas, stamped with the session's origin [FR-LED-4], and run one at a time; each committed command produces a
// change notification. Queries run immediately against the materialized store. No driver or worker code here, so
// it is tested under bun.

export type Entity = keyof SvcBundle

/** One committed change, sent to every listener after the command's action is in the log. */
export interface Change {
  entity: Entity
  op: 'create' | 'patch' | 'delete'
  id: string
}

/** The commands the UI may send, with the schema that validates each event. Origins are managed by the session. */
const commandSchemas = {
  'accounts.createAccount': accountCreationEventSchema,
  'accounts.patchAccount': accountPatchEventSchema,
  'accounts.deleteAccount': accountDeletionEventSchema,
  'accountCategories.createAccountCategory': accountCategoryCreationEventSchema,
  'accountCategories.patchAccountCategory': accountCategoryPatchEventSchema,
  'accountCategories.deleteAccountCategory': accountCategoryDeletionEventSchema,
  'vendors.createVendor': vendorCreationEventSchema,
  'vendors.patchVendor': vendorPatchEventSchema,
  'vendors.deleteVendor': vendorDeletionEventSchema,
  'transactions.createTransaction': transactionCreationEventSchema,
  'transactions.patchTransaction': transactionPatchEventSchema,
  'transactions.deleteTransaction': transactionDeletionEventSchema,
  'balanceAssertions.createBalanceAssertion': balanceAssertionCreationEventSchema,
  'balanceAssertions.patchBalanceAssertion': balanceAssertionPatchEventSchema,
  'balanceAssertions.deleteBalanceAssertion': balanceAssertionDeletionEventSchema,
} as const satisfies Record<string, z.ZodType>

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** Every command's input, keyed `entity.method`: the schema's input type without `origId` and `hlc`. */
export type CommandInputs = {
  [K in keyof typeof commandSchemas]: DistributiveOmit<z.input<(typeof commandSchemas)[K]>, 'origId' | 'hlc'>
}

const entities: readonly Entity[] = [
  'accounts',
  'accountCategories',
  'vendors',
  'transactions',
  'balanceAssertions',
  'origins',
]

/** A request the session refuses: an unknown method, a command sent as a query, or an event that fails its schema. */
export class InvalidRequestError extends Error {}

type Method = (...args: unknown[]) => Promise<unknown>

export class LedgerSession {
  readonly store: LedgerStore
  readonly origId: OrigId
  private readonly onChange: (change: Change) => void
  private writes: Promise<unknown> = Promise.resolve()

  constructor(store: LedgerStore, origId: OrigId, onChange: (change: Change) => void) {
    this.store = store
    this.origId = origId
    this.onChange = onChange
  }

  private method(entity: string, method: string): Method {
    if (!entities.includes(entity as Entity)) throw new InvalidRequestError(`Unknown entity: ${entity}`)
    const svc = this.store.svcs[entity as Entity] as unknown as Record<string, unknown>
    const fn = svc[method]
    if (typeof fn !== 'function' || method === 'constructor') {
      throw new InvalidRequestError(`Unknown method: ${entity}.${method}`)
    }
    return (fn as Method).bind(svc)
  }

  /** Runs a read-only service method. */
  query(entity: string, method: string, args: unknown[]): Promise<unknown> {
    if (/^(create|patch|delete)/.test(method)) {
      return Promise.reject(new InvalidRequestError(`${entity}.${method} is a command, not a query`))
    }
    try {
      return this.method(entity, method)(...args)
    } catch (err) {
      return Promise.reject(err)
    }
  }

  /** Validates, stamps and runs one command after any in-flight one finishes, then reports the change. */
  command(entity: string, method: string, input: unknown): Promise<unknown> {
    const run = async () => {
      const schema = (commandSchemas as Record<string, z.ZodType>)[`${entity}.${method}`]
      if (!schema) throw new InvalidRequestError(`Unknown command: ${entity}.${method}`)
      const parsed = schema.safeParse({ ...(input as object), origId: this.origId })
      if (!parsed.success) {
        throw new InvalidRequestError(`${entity}.${method}: ${parsed.error.issues.map((i) => i.message).join('; ')}`)
      }
      const result = await this.method(entity, method)(parsed.data)
      const op = method.startsWith('create') ? 'create' : method.startsWith('patch') ? 'patch' : 'delete'
      this.onChange({ entity: entity as Entity, op, id: (parsed.data as { id: string }).id })
      return result
    }
    const result = this.writes.then(run, run)
    this.writes = result.catch(() => undefined)
    return result
  }
}
