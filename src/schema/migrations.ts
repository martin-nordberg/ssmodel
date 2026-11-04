import { CURRENT_SCHEMA_VERSION } from './model.ts'

type Raw = Record<string, unknown>

/**
 * Migrations keyed by the version they upgrade *from*. Each takes a raw (unvalidated) object of version n and
 * returns version n + 1 [FR-FILE-3]. Empty until schema version 2 exists.
 */
export const migrations: Record<number, (raw: Raw) => Raw> = {}

export function migrate(raw: Raw, fromVersion: number): Raw {
  let current = raw
  for (let v = fromVersion; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = migrations[v]
    if (!step) throw new Error(`no migration from schema version ${v}`)
    current = { ...step(current), schemaVersion: v + 1 }
  }
  return current
}
