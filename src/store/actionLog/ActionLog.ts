import type {
  AccountCategoryCreationEvent,
  AccountCategoryDeletionEvent,
  AccountCategoryPatchEvent,
} from '@/ledger/accountCategories/AccountCategory.ts'
import type { AcctCtgId } from '@/ledger/accountCategories/AcctCtgId.ts'
import type { AccountCreationEvent, AccountDeletionEvent, AccountPatchEvent } from '@/ledger/accounts/Account.ts'
import type { AcctId } from '@/ledger/accounts/AcctId.ts'
import type { Action } from '@/ledger/actions/Action.ts'
import type { ActionType } from '@/ledger/actions/ActionType.ts'
import { genActnId } from '@/ledger/actions/ActnId.ts'
import type { AsrtId } from '@/ledger/balanceAssertions/AsrtId.ts'
import type {
  BalanceAssertionCreationEvent,
  BalanceAssertionDeletionEvent,
  BalanceAssertionPatchEvent,
} from '@/ledger/balanceAssertions/BalanceAssertion.ts'
import { advanceHLClock, getHLClock, type HLClock, mergeHLClock } from '@/ledger/core/HybridLogicalClock.ts'
import type { OrigId } from '@/ledger/origins/OrigId.ts'
import type { OriginCreationEvent } from '@/ledger/origins/Origin.ts'
import type { CmdSvcBundle } from '@/ledger/services/CmdSvcBundle.ts'
import type {
  TransactionCreationEvent,
  TransactionDeletionEvent,
  TransactionPatchEvent,
} from '@/ledger/transactions/Transaction.ts'
import type { TxnId } from '@/ledger/transactions/TxnId.ts'
import type { VendorCreationEvent, VendorDeletionEvent, VendorPatchEvent } from '@/ledger/vendors/Vendor.ts'
import type { VndrId } from '@/ledger/vendors/VndrId.ts'
import { AccountActionLogCmdSvc } from '@/store/actionLog/crudServices/AccountActionLogCmdSvc.ts'
import { AccountCategoryActionLogCmdSvc } from '@/store/actionLog/crudServices/AccountCategoryActionLogCmdSvc.ts'
import { BalanceAssertionActionLogCmdSvc } from '@/store/actionLog/crudServices/BalanceAssertionActionLogCmdSvc.ts'
import { OriginActionLogCmdSvc } from '@/store/actionLog/crudServices/OriginActionLogCmdSvc.ts'
import { TransactionActionLogCmdSvc } from '@/store/actionLog/crudServices/TransactionActionLogCmdSvc.ts'
import { VendorActionLogCmdSvc } from '@/store/actionLog/crudServices/VendorActionLogCmdSvc.ts'
import type { PayloadCodec } from '@/store/actionLog/encryption/PayloadCodec.ts'
import { runAllMigrations, runMigrations } from '@/store/actionLog/migrations/runMigrations.ts'
import type { DbDriver } from '@/store/driver/DbDriver.ts'

type ActionRow = {
  id: string
  action_type: string
  hlc: string
  iv: string
  encrypted_payload: string
}

/** Which lookup table (and column) each action type's own entity id is recorded in on append -- see
 * documentation/action-log-changes.md §2. Exhaustive over ActionType: every action type maps to exactly one
 * entity, so there is no "no lookup table" case. */
const lookupTableFor: Record<ActionType, { table: string; column: string }> = {
  'create-account': { table: 'account_actions', column: 'acct_id' },
  'update-account': { table: 'account_actions', column: 'acct_id' },
  'delete-account': { table: 'account_actions', column: 'acct_id' },
  'create-account-category': { table: 'account_category_actions', column: 'acct_ctg_id' },
  'update-account-category': { table: 'account_category_actions', column: 'acct_ctg_id' },
  'delete-account-category': { table: 'account_category_actions', column: 'acct_ctg_id' },
  'create-vendor': { table: 'vendor_actions', column: 'vndr_id' },
  'update-vendor': { table: 'vendor_actions', column: 'vndr_id' },
  'delete-vendor': { table: 'vendor_actions', column: 'vndr_id' },
  'create-transaction': { table: 'transaction_actions', column: 'txn_id' },
  'update-transaction': { table: 'transaction_actions', column: 'txn_id' },
  'delete-transaction': { table: 'transaction_actions', column: 'txn_id' },
  'create-balance-assertion': { table: 'balance_assertion_actions', column: 'asrt_id' },
  'update-balance-assertion': { table: 'balance_assertion_actions', column: 'asrt_id' },
  'delete-balance-assertion': { table: 'balance_assertion_actions', column: 'asrt_id' },
  'create-origin': { table: 'origin_actions', column: 'orig_id' },
}

// From Checquery's ActionLog (NFR-ARCH-10), on DbDriver and an asynchronous PayloadCodec: reads are async iterators
// because decryption is async (Web Crypto), and an append writes its two rows in one transaction.

/**
 * The append-only action log behind a .checquery file (see documentation/action-log.md). Knows nothing about
 * files, paths, or passwords -- it wraps whatever Database and PayloadCodec it's given, so it works identically
 * against a real file, a :memory: database (tests, see inMemory.ts), or a scratch database built for compaction.
 * Nothing here is module-level singleton state; constructing more than one ActionLog at once (e.g. a source and
 * destination for compaction) is fully supported.
 *
 * Whether the log is encrypted at all is entirely the codec's concern (see PayloadCodec.ts) -- ActionLog itself
 * only ever calls encode/decode, never a crypto function directly.
 */
export class ActionLog {
  private masterHlc: HLClock
  readonly cmdSvcs: CmdSvcBundle

  private readonly db: DbDriver
  private readonly codec: PayloadCodec
  private readonly nodeId: string

  /**
   * Runs every pending migration, including payload migrations that need the codec (such as 0004, amounts to
   * cents), then wraps the database. How the app opens a log; the constructor alone runs only schema migrations.
   */
  static async open(db: DbDriver, codec: PayloadCodec, nodeId: string): Promise<ActionLog> {
    await runAllMigrations(db, codec)
    return new ActionLog(db, codec, nodeId)
  }

  constructor(db: DbDriver, codec: PayloadCodec, nodeId: string) {
    this.db = db
    this.codec = codec
    this.nodeId = nodeId
    // Idempotent safety net: guarantees the actions table exists regardless of whether the caller already
    // migrated (as db.ts must, to read kdf_salt before it can derive a key at all).
    runMigrations(db)
    this.masterHlc = this.loadMasterHlc()
    this.cmdSvcs = {
      accounts: new AccountActionLogCmdSvc(this),
      accountCategories: new AccountCategoryActionLogCmdSvc(this),
      vendors: new VendorActionLogCmdSvc(this),
      transactions: new TransactionActionLogCmdSvc(this),
      balanceAssertions: new BalanceAssertionActionLogCmdSvc(this),
      origins: new OriginActionLogCmdSvc(this),
    }
  }

  private loadMasterHlc(): HLClock {
    const row = this.db.get<{ maxHlc: string | null }>(`SELECT MAX(hlc) as maxHlc FROM actions`)
    return row?.maxHlc != null ? (row.maxHlc as HLClock) : getHLClock(this.nodeId)
  }

  /**
   * Durably appends an action. Mints a fresh ActnId for the row (nothing external ever supplies one -- see
   * documentation/action-log-changes.md §1) and records it in the entity's own lookup table alongside its own
   * id (`event.id`, present on every *CreationEvent/*PatchEvent/*DeletionEvent across all five entities).
   *
   * If the event already carries an hlc (e.g. it was copied in from another log, see action-log.md §7.2), that
   * value is used as-is and merged into the master clock; otherwise a fresh one is generated, advancing the
   * master, and stamped onto the returned event. Never returns without either succeeding or throwing -- there
   * is no "declined" case for a pure append log.
   */
  async appendAction<E extends { id: string; hlc?: HLClock }>(actionType: ActionType, event: E): Promise<E> {
    let resolvedEvent: E
    let rowHlc: HLClock
    if (event.hlc !== undefined) {
      rowHlc = event.hlc
      this.masterHlc = mergeHLClock(this.masterHlc, event.hlc)
      resolvedEvent = event
    } else {
      const newHlc = advanceHLClock(this.masterHlc)
      this.masterHlc = newHlc
      rowHlc = newHlc
      resolvedEvent = { ...event, hlc: newHlc }
    }

    const actnId = genActnId()
    const { iv, payload: encryptedPayload } = await this.codec.encode(JSON.stringify(resolvedEvent))
    const { table, column } = lookupTableFor[actionType]
    // The action row and its lookup row land together or not at all.
    this.db.transaction(() => {
      this.db.run(`INSERT INTO actions (id, action_type, hlc, iv, encrypted_payload) VALUES (?, ?, ?, ?, ?)`, [
        actnId,
        actionType,
        rowHlc,
        iv,
        encryptedPayload,
      ])
      this.db.run(`INSERT INTO ${table} (actn_id, ${column}) VALUES (?, ?)`, [actnId, resolvedEvent.id])
    })

    return resolvedEvent
  }

  /** Decrypts and decodes one actions row into an Action, throwing (naming the row) on a bad auth tag or
   * corrupt JSON -- shared by readActions and every readActionsForXxx query below. */
  private async decodeRow(row: ActionRow): Promise<Action> {
    let plaintext: string
    try {
      plaintext = await this.codec.decode(row.iv, row.encrypted_payload)
    } catch (err) {
      throw new Error(`Action ${row.id} (hlc ${row.hlc}) failed to decrypt: ${(err as Error).message}`)
    }

    let payload: unknown
    try {
      payload = JSON.parse(plaintext)
    } catch (err) {
      throw new Error(`Action ${row.id} (hlc ${row.hlc}) has a corrupt JSON payload: ${(err as Error).message}`)
    }

    return { id: row.id, actionType: row.action_type, hlc: row.hlc, payload } as Action
  }

  /** Total number of rows in the actions table -- a lightweight count, unlike readActions() which decrypts
   * every row. */
  countActions(): number {
    return this.db.get<{ n: number }>(`SELECT COUNT(*) as n FROM actions`)?.n ?? 0
  }

  /**
   * Decrypted, oldest-first read of this log's actions, optionally starting strictly after a given hlc. The
   * building block for replayInto below, and for cross-log copying (compaction/sync, action-log.md §7). Halts
   * (throws, naming the offending row) on a decrypt failure or corrupt JSON -- never silently skips a row.
   */
  async *readActions(afterHlc?: HLClock): AsyncIterableIterator<Action> {
    const rows =
      afterHlc !== undefined
        ? this.db.all<ActionRow>(
            `SELECT id, action_type, hlc, iv, encrypted_payload FROM actions WHERE hlc > ? ORDER BY hlc ASC`,
            [afterHlc],
          )
        : this.db.all<ActionRow>(`SELECT id, action_type, hlc, iv, encrypted_payload FROM actions ORDER BY hlc ASC`)

    for (const row of rows) {
      yield await this.decodeRow(row)
    }
  }

  private async *readActionsForEntity(table: string, column: string, entityId: string): AsyncIterableIterator<Action> {
    const rows = this.db.all<ActionRow>(
      `SELECT a.id, a.action_type, a.hlc, a.iv, a.encrypted_payload
             FROM actions a JOIN ${table} la ON la.actn_id = a.id
             WHERE la.${column} = ?
             ORDER BY a.hlc ASC`,
      [entityId],
    )

    for (const row of rows) {
      yield await this.decodeRow(row)
    }
  }

  /** This account's own create/patch/delete actions, oldest first -- not actions from other entity types that
   * merely reference this account (a transaction's entries, say); see documentation/action-log-changes.md §4. */
  readActionsForAccount(acctId: AcctId): AsyncIterableIterator<Action> {
    return this.readActionsForEntity('account_actions', 'acct_id', acctId)
  }

  readActionsForAccountCategory(acctCtgId: AcctCtgId): AsyncIterableIterator<Action> {
    return this.readActionsForEntity('account_category_actions', 'acct_ctg_id', acctCtgId)
  }

  readActionsForVendor(vndrId: VndrId): AsyncIterableIterator<Action> {
    return this.readActionsForEntity('vendor_actions', 'vndr_id', vndrId)
  }

  readActionsForTransaction(txnId: TxnId): AsyncIterableIterator<Action> {
    return this.readActionsForEntity('transaction_actions', 'txn_id', txnId)
  }

  readActionsForBalanceAssertion(asrtId: AsrtId): AsyncIterableIterator<Action> {
    return this.readActionsForEntity('balance_assertion_actions', 'asrt_id', asrtId)
  }

  readActionsForOrigin(origId: OrigId): AsyncIterableIterator<Action> {
    return this.readActionsForEntity('origin_actions', 'orig_id', origId)
  }

  /** Replays this log's actions into a separate consumer's IXxxCmdSvc bundle (action-log.md §10). `target`
   * must never be this same ActionLog (or any ActionLog) -- see readActions for cross-log copying instead. */
  async replayInto(target: CmdSvcBundle, afterHlc?: HLClock): Promise<void> {
    for await (const action of this.readActions(afterHlc)) {
      await dispatchAction(target, action)
    }
  }
}

async function dispatchAction(target: CmdSvcBundle, action: Action): Promise<void> {
  switch (action.actionType) {
    case 'create-account':
      await target.accounts.createAccount(action.payload as AccountCreationEvent)
      return
    case 'update-account':
      await target.accounts.patchAccount(action.payload as AccountPatchEvent)
      return
    case 'delete-account':
      await target.accounts.deleteAccount(action.payload as AccountDeletionEvent)
      return
    case 'create-account-category':
      await target.accountCategories.createAccountCategory(action.payload as AccountCategoryCreationEvent)
      return
    case 'update-account-category':
      await target.accountCategories.patchAccountCategory(action.payload as AccountCategoryPatchEvent)
      return
    case 'delete-account-category':
      await target.accountCategories.deleteAccountCategory(action.payload as AccountCategoryDeletionEvent)
      return
    case 'create-vendor':
      await target.vendors.createVendor(action.payload as VendorCreationEvent)
      return
    case 'update-vendor':
      await target.vendors.patchVendor(action.payload as VendorPatchEvent)
      return
    case 'delete-vendor':
      await target.vendors.deleteVendor(action.payload as VendorDeletionEvent)
      return
    case 'create-transaction':
      await target.transactions.createTransaction(action.payload as TransactionCreationEvent)
      return
    case 'update-transaction':
      await target.transactions.patchTransaction(action.payload as TransactionPatchEvent)
      return
    case 'delete-transaction':
      await target.transactions.deleteTransaction(action.payload as TransactionDeletionEvent)
      return
    case 'create-balance-assertion':
      await target.balanceAssertions.createBalanceAssertion(action.payload as BalanceAssertionCreationEvent)
      return
    case 'update-balance-assertion':
      await target.balanceAssertions.patchBalanceAssertion(action.payload as BalanceAssertionPatchEvent)
      return
    case 'delete-balance-assertion':
      await target.balanceAssertions.deleteBalanceAssertion(action.payload as BalanceAssertionDeletionEvent)
      return
    case 'create-origin':
      await target.origins.createOrigin(action.payload as OriginCreationEvent)
      return
    default: {
      const exhaustiveCheck: never = action.actionType
      throw new Error(`Unhandled action type: ${exhaustiveCheck}`)
    }
  }
}
