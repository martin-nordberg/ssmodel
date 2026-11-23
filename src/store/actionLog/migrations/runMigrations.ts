import { getMetaValue, metaTableExists, setMetaValue } from '@/store/actionLog/meta.ts'
import { up as up0001 } from '@/store/actionLog/migrations/0001_meta.ts'
import { up as up0002 } from '@/store/actionLog/migrations/0002_actions.ts'
import { up as up0003 } from '@/store/actionLog/migrations/0003_drop_vendor_category_actions.ts'
import type { DbDriver } from '@/store/driver/DbDriver.ts'

// The change log's schema migrations [FR-STO-7], from Checquery. Each migration's DDL is frozen forever.

type Migration = { version: number; up: (db: DbDriver) => void }

const migrations: Migration[] = [
  { version: 1, up: up0001 },
  { version: 2, up: up0002 },
  { version: 3, up: up0003 },
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

/**
 * Runs every migration above the database's schema_version, in order, each in its own transaction, recording the
 * version after each. Idempotent. If one throws, the database stays at the last version that applied.
 */
export function runMigrations(db: DbDriver): void {
  const currentVersion = readSchemaVersion(db)
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      db.transaction(() => {
        migration.up(db)
        setMetaValue(db, 'schema_version', migration.version.toString())
      })
    }
  }
}
