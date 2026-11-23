// The small synchronous database interface the store is written against [NFR-ARCH-9]. Two implementations:
// bun:sqlite for unit tests (bunSqlite.ts) and the official SQLite WASM build for the store worker
// (wasmSqlite.ts). Both are synchronous: the worker owns its database, so nothing needs to await a query.

/** A value SQLite can bind or return. */
export type SqlValue = string | number | bigint | Uint8Array | null

export interface RunResult {
  /** Rows changed by the statement (INSERT, UPDATE, DELETE). */
  changes: number
}

export interface DbDriver {
  /** Runs one statement and reports how many rows it changed. */
  run(sql: string, params?: readonly SqlValue[]): RunResult
  /** Every row of a query, as objects keyed by column name. */
  all<T = Record<string, SqlValue>>(sql: string, params?: readonly SqlValue[]): T[]
  /** The first row of a query, or null when there is none. */
  get<T = Record<string, SqlValue>>(sql: string, params?: readonly SqlValue[]): T | null
  /** Runs one or more statements with no parameters (DDL, PRAGMA). */
  exec(sql: string): void
  /**
   * Runs `fn` atomically: commits when it returns, rolls back when it throws. Nests (inner calls are savepoints).
   * `fn` must be synchronous.
   */
  transaction<T>(fn: () => T): T
  /** The whole database as file bytes, as written to the user's file. */
  exportBytes(): Uint8Array
  close(): void
}

/**
 * The shared savepoint-based transaction both drivers use, so nesting behaves identically: an inner failure that
 * the caller catches rolls back only the inner work.
 */
export function savepointTransaction<T>(driver: Pick<DbDriver, 'exec'>, depth: { n: number }, fn: () => T): T {
  const name = `sp${depth.n++}`
  driver.exec(`SAVEPOINT ${name}`)
  try {
    const result = fn()
    if (result instanceof Promise) throw new Error('DbDriver.transaction: the callback must be synchronous')
    driver.exec(`RELEASE ${name}`)
    return result
  } catch (err) {
    driver.exec(`ROLLBACK TO ${name}`)
    driver.exec(`RELEASE ${name}`)
    throw err
  } finally {
    depth.n--
  }
}

/**
 * Like DbDriver.transaction, but `fn` may await between statements. Only safe when nothing else writes to the database
 * meanwhile: the store runs these through the session's write queue (LedgerSession.exclusive).
 */
export async function exclusiveAsyncTransaction<T>(driver: Pick<DbDriver, 'exec'>, fn: () => Promise<T>): Promise<T> {
  driver.exec('SAVEPOINT exclusive_async')
  try {
    const result = await fn()
    driver.exec('RELEASE exclusive_async')
    return result
  } catch (err) {
    driver.exec('ROLLBACK TO exclusive_async')
    driver.exec('RELEASE exclusive_async')
    throw err
  }
}
