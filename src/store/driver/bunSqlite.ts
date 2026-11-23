import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { type DbDriver, type RunResult, type SqlValue, savepointTransaction } from './DbDriver.ts'

// bun:sqlite behind DbDriver, for unit tests and Bun scripts [NFR-ARCH-9]. Never imported by the app bundle.

export class BunSqliteDriver implements DbDriver {
  private readonly db: Database
  private readonly depth = { n: 0 }

  constructor(db: Database) {
    this.db = db
  }

  run(sql: string, params: readonly SqlValue[] = []): RunResult {
    const { changes } = this.db.query(sql).run(...(params as SQLQueryBindings[]))
    return { changes }
  }

  all<T = Record<string, SqlValue>>(sql: string, params: readonly SqlValue[] = []): T[] {
    return this.db.query(sql).all(...(params as SQLQueryBindings[])) as T[]
  }

  get<T = Record<string, SqlValue>>(sql: string, params: readonly SqlValue[] = []): T | null {
    return (this.db.query(sql).get(...(params as SQLQueryBindings[])) as T | null) ?? null
  }

  exec(sql: string): void {
    this.db.run(sql)
  }

  transaction<T>(fn: () => T): T {
    return savepointTransaction(this, this.depth, fn)
  }

  exportBytes(): Uint8Array {
    return new Uint8Array(this.db.serialize())
  }

  close(): void {
    this.db.close()
  }
}

/** Opens a database file, or a fresh in-memory database by default. */
export function openBunDriver(filename = ':memory:'): BunSqliteDriver {
  return new BunSqliteDriver(new Database(filename, { create: true }))
}

/** Opens a writable in-memory copy of database file bytes. */
export function openBunDriverFromBytes(bytes: Uint8Array): BunSqliteDriver {
  return new BunSqliteDriver(Database.deserialize(bytes))
}
