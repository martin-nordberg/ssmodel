import type { DbDriver } from '@/store/driver/DbDriver.ts'

// The file's key/value metadata table. It keeps Checquery's name, so files written by Checquery open unchanged.

/** True if the _checquery_meta table exists. */
export function metaTableExists(db: DbDriver): boolean {
  return db.get(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_checquery_meta'`) !== null
}

/** A value from _checquery_meta, or null if the table or key is absent. */
export function getMetaValue(db: DbDriver, key: string): string | null {
  if (!metaTableExists(db)) return null
  return db.get<{ value: string }>(`SELECT value FROM _checquery_meta WHERE key = ?`, [key])?.value ?? null
}

/** Every key/value pair, ordered by key. */
export function getAllMetaEntries(db: DbDriver): Array<{ key: string; value: string }> {
  return db.all<{ key: string; value: string }>(`SELECT key, value FROM _checquery_meta ORDER BY key`)
}

/** Inserts or updates a value. */
export function setMetaValue(db: DbDriver, key: string, value: string): void {
  db.run(
    `INSERT INTO _checquery_meta (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [key, value],
  )
}
