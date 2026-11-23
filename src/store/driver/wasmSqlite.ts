import sqlite3InitModule, { type Database, type PreparedStatement, type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { type DbDriver, type RunResult, type SqlValue, savepointTransaction } from './DbDriver.ts'

// The official SQLite WASM build behind DbDriver, for the store worker [NFR-ARCH-9]. Prepared statements are
// cached per SQL string (as bun:sqlite's query() does), since replay runs the same few statements thousands of times.

let sqlite3Promise: Promise<Sqlite3Static> | undefined

/** Loads SQLite WASM once per worker. */
export function loadSqlite(): Promise<Sqlite3Static> {
  sqlite3Promise ??= sqlite3InitModule()
  return sqlite3Promise
}

export class WasmSqliteDriver implements DbDriver {
  readonly db: Database
  private readonly sqlite3: Sqlite3Static
  private readonly statements = new Map<string, PreparedStatement>()
  private readonly depth = { n: 0 }

  constructor(sqlite3: Sqlite3Static, db: Database) {
    this.sqlite3 = sqlite3
    this.db = db
  }

  private statement(sql: string, params: readonly SqlValue[]): PreparedStatement {
    let stmt = this.statements.get(sql)
    if (!stmt) {
      stmt = this.db.prepare(sql)
      this.statements.set(sql, stmt)
    }
    if (params.length > 0) stmt.bind(params as SqlValue[])
    return stmt
  }

  run(sql: string, params: readonly SqlValue[] = []): RunResult {
    const stmt = this.statement(sql, params)
    try {
      while (stmt.step()) {
        // Drain any rows (e.g. INSERT … RETURNING); run() reports changes only.
      }
    } finally {
      stmt.reset(true)
    }
    return { changes: this.db.changes() }
  }

  all<T = Record<string, SqlValue>>(sql: string, params: readonly SqlValue[] = []): T[] {
    const stmt = this.statement(sql, params)
    try {
      const rows: T[] = []
      while (stmt.step()) rows.push(stmt.get({}) as T)
      return rows
    } finally {
      stmt.reset(true)
    }
  }

  get<T = Record<string, SqlValue>>(sql: string, params: readonly SqlValue[] = []): T | null {
    const stmt = this.statement(sql, params)
    try {
      return stmt.step() ? (stmt.get({}) as T) : null
    } finally {
      stmt.reset(true)
    }
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  transaction<T>(fn: () => T): T {
    return savepointTransaction(this, this.depth, fn)
  }

  exportBytes(): Uint8Array {
    return this.sqlite3.capi.sqlite3_js_db_export(this.db)
  }

  close(): void {
    for (const stmt of this.statements.values()) stmt.finalize()
    this.statements.clear()
    this.db.close()
  }
}

/** A fresh in-memory database, or a writable in-memory copy of database file bytes. */
export function openWasmMemory(sqlite3: Sqlite3Static, bytes?: Uint8Array): WasmSqliteDriver {
  const db = new sqlite3.oo1.DB(':memory:')
  if (bytes) {
    const p = sqlite3.wasm.allocFromTypedArray(bytes)
    const { capi } = sqlite3
    const rc = capi.sqlite3_deserialize(
      db,
      'main',
      p,
      bytes.length,
      bytes.length,
      capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_RESIZEABLE,
    )
    db.checkRc(rc)
  }
  return new WasmSqliteDriver(sqlite3, db)
}
