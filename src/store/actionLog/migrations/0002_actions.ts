import type { DbDriver } from '@/store/driver/DbDriver.ts'

/**
 * The action_type CHECK constraint's allowed values, frozen exactly as they were the day this migration
 * shipped. Deliberately NOT derived from the live ActionType.ts/ACTION_TYPES -- a migration's up() must
 * produce the exact same DDL forever, no matter what the domain layer looks like later, or schema_version
 * stops reliably describing what's actually on disk (see _checquery_meta.schema_version in action-log.md §5/
 * §6.2). Deriving this dynamically was a latent bug: removing vendor categories from ActionType.ts (see
 * tasks/done/remove-vendor-categories-implementation-plan.md) would otherwise have silently narrowed what
 * "schema_version 2" produces for any file created after that change, without the version number ever
 * moving -- two files both honestly reporting schema_version 2 with two different actual CHECK constraints.
 * The three vendor-category values stay listed here permanently, inert, even though nothing in the
 * application ever produces them anymore -- a real forward migration (bumping schema_version) would be
 * needed to actually drop them, and isn't warranted just to tidy up an allow-list.
 */
const actionTypesAtV2 = [
  'create-account',
  'update-account',
  'delete-account',
  'create-account-category',
  'update-account-category',
  'delete-account-category',
  'create-vendor',
  'update-vendor',
  'delete-vendor',
  'create-vendor-category',
  'update-vendor-category',
  'delete-vendor-category',
  'create-transaction',
  'update-transaction',
  'delete-transaction',
  'create-balance-assertion',
  'update-balance-assertion',
  'delete-balance-assertion',
  'create-origin',
] as const

export function up(db: DbDriver): void {
  const actionTypeList = actionTypesAtV2.map((t) => `'${t}'`).join(', ')
  db.exec(`
        CREATE TABLE actions (
            id                TEXT PRIMARY KEY,
            action_type       TEXT NOT NULL CHECK (action_type IN (${actionTypeList})),
            hlc               TEXT NOT NULL,
            iv                TEXT NOT NULL,
            encrypted_payload TEXT NOT NULL
        )
    `)
  db.exec(`CREATE UNIQUE INDEX actions_hlc_idx ON actions (hlc)`)

  // Lookup tables: one per entity, mapping an action back to the single entity it directly acted on (not
  // populated by any other entity's actions -- see documentation/action-log-changes.md §2/§4).
  db.exec(`
        CREATE TABLE account_actions (
            actn_id TEXT PRIMARY KEY REFERENCES actions (id),
            acct_id TEXT NOT NULL
        )
    `)
  db.exec(`CREATE INDEX account_actions_acct_id_idx ON account_actions (acct_id)`)

  db.exec(`
        CREATE TABLE account_category_actions (
            actn_id     TEXT PRIMARY KEY REFERENCES actions (id),
            acct_ctg_id TEXT NOT NULL
        )
    `)
  db.exec(`CREATE INDEX account_category_actions_acct_ctg_id_idx ON account_category_actions (acct_ctg_id)`)

  db.exec(`
        CREATE TABLE vendor_actions (
            actn_id TEXT PRIMARY KEY REFERENCES actions (id),
            vndr_id TEXT NOT NULL
        )
    `)
  db.exec(`CREATE INDEX vendor_actions_vndr_id_idx ON vendor_actions (vndr_id)`)

  db.exec(`
        CREATE TABLE vendor_category_actions (
            actn_id     TEXT PRIMARY KEY REFERENCES actions (id),
            vndr_ctg_id TEXT NOT NULL
        )
    `)
  db.exec(`CREATE INDEX vendor_category_actions_vndr_ctg_id_idx ON vendor_category_actions (vndr_ctg_id)`)

  db.exec(`
        CREATE TABLE transaction_actions (
            actn_id TEXT PRIMARY KEY REFERENCES actions (id),
            txn_id  TEXT NOT NULL
        )
    `)
  db.exec(`CREATE INDEX transaction_actions_txn_id_idx ON transaction_actions (txn_id)`)

  db.exec(`
        CREATE TABLE balance_assertion_actions (
            actn_id TEXT PRIMARY KEY REFERENCES actions (id),
            asrt_id TEXT NOT NULL
        )
    `)
  db.exec(`CREATE INDEX balance_assertion_actions_asrt_id_idx ON balance_assertion_actions (asrt_id)`)

  db.exec(`
        CREATE TABLE origin_actions (
            actn_id TEXT PRIMARY KEY REFERENCES actions (id),
            orig_id TEXT NOT NULL
        )
    `)
  db.exec(`CREATE INDEX origin_actions_orig_id_idx ON origin_actions (orig_id)`)
}
