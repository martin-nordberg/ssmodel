import type { PayloadCodec } from '@/store/actionLog/encryption/PayloadCodec.ts'
import { getMetaValue, metaTableExists, setMetaValue } from '@/store/actionLog/meta.ts'
import { up as up0001 } from '@/store/actionLog/migrations/0001_meta.ts'
import { up as up0002 } from '@/store/actionLog/migrations/0002_actions.ts'
import { up as up0003 } from '@/store/actionLog/migrations/0003_drop_vendor_category_actions.ts'
import { up as up0004 } from '@/store/actionLog/migrations/0004_cents.ts'
import type { DbDriver } from '@/store/driver/DbDriver.ts'

// The change log's migrations [FR-STO-7]: Checquery's schema migrations (1–3) and ProvisionLens's own. A schema
// migration changes tables and runs before the password is known. A payload migration rewrites action payloads,
// so it needs the file's codec (the key) and is asynchronous. Each migration's behavior is frozen forever.

type Migration =
  | { version: number; kind: 'schema'; up: (db: DbDriver) => void }
  | {
      version: number
      kind: 'payload'
      up: (db: DbDriver, codec: PayloadCodec, inTransaction: (apply: () => void) => void) => Promise<void>
    }

const migrations: Migration[] = [
  { version: 1, kind: 'schema', up: up0001 },
  { version: 2, kind: 'schema', up: up0002 },
  { version: 3, kind: 'schema', up: up0003 },
  { version: 4, kind: 'payload', up: up0004 },
]

/** The highest schema_version this build can migrate to. A file with a higher version is from a newer build. */
export const latestKnownVersion: number = migrations[migrations.length - 1]!.version

/** The database's schema_version, or 0 when the meta table or key is missing. */
export function readSchemaVersion(db: DbDriver): number {
  if (!metaTableExists(db)) return 0
  const value = getMetaValue(db, 'schema_version')
  return value === null ? 0 : parseInt(value, 10)
}

/** True when the database needs migrations this build can run. */
export function hasPendingMigrations(db: DbDriver): boolean {
  return readSchemaVersion(db) < latestKnownVersion
}

function applySchema(db: DbDriver, migration: Migration & { kind: 'schema' }): void {
  db.transaction(() => {
    migration.up(db)
    setMetaValue(db, 'schema_version', migration.version.toString())
  })
}

/**
 * Runs the pending schema migrations, in order, each in its own transaction, recording the version after each. It
 * stops at the first pending payload migration (which needs the key; see runAllMigrations). Idempotent. If one
 * throws, the database stays at the last version that applied.
 */
export function runMigrations(db: DbDriver): void {
  for (const migration of migrations) {
    if (migration.version <= readSchemaVersion(db)) continue
    if (migration.kind === 'payload') return
    applySchema(db, migration)
  }
}

/** Runs every pending migration, schema and payload, in order. */
export async function runAllMigrations(db: DbDriver, codec: PayloadCodec): Promise<void> {
  for (const migration of migrations) {
    if (migration.version <= readSchemaVersion(db)) continue
    if (migration.kind === 'schema') {
      applySchema(db, migration)
    } else {
      await migration.up(db, codec, (apply) =>
        db.transaction(() => {
          apply()
          setMetaValue(db, 'schema_version', migration.version.toString())
        }),
      )
    }
  }
}
