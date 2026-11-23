import type { SAHPoolUtil, Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { WasmSqliteDriver } from '@/store/driver/wasmSqlite.ts'

// Working copies in the origin-private file system [FR-STO-2]: on open, the user's file is copied into OPFS and
// SQLite opens the copy, so every committed change is durable at once; autosave later writes the whole database back
// to the user's file. Uses SQLite's opfs-sahpool VFS (chosen in P0: no cross-origin isolation headers needed, and the
// fastest). One working copy per file, named by the file's file_id, so a copy left by a crash is found on reopen.
// Worker only.

const vfsName = 'plens-working-copies'

export class WorkingCopies {
  private readonly sqlite3: Sqlite3Static
  private readonly pool: SAHPoolUtil

  private constructor(sqlite3: Sqlite3Static, pool: SAHPoolUtil) {
    this.sqlite3 = sqlite3
    this.pool = pool
  }

  /** Installs the VFS. Fails if another tab of the app already holds it (one connection per origin, P1.8). */
  static async install(sqlite3: Sqlite3Static): Promise<WorkingCopies> {
    const pool = await sqlite3.installOpfsSAHPoolVfs({ name: vfsName, directory: `.${vfsName}`, initialCapacity: 6 })
    return new WorkingCopies(sqlite3, pool)
  }

  private static path(fileId: string): string {
    if (!/^[a-z0-9]+$/.test(fileId)) throw new Error(`Invalid file id: ${fileId}`)
    return `/wc-${fileId}.plens`
  }

  /** The file ids that have a working copy. */
  list(): string[] {
    return this.pool
      .getFileNames()
      .map((name) => /^\/wc-([a-z0-9]+)\.plens$/.exec(name)?.[1])
      .filter((id): id is string => id !== undefined)
  }

  has(fileId: string): boolean {
    return this.pool.getFileNames().includes(WorkingCopies.path(fileId))
  }

  /** Replaces the working copy with the given file bytes. */
  async importBytes(fileId: string, bytes: Uint8Array): Promise<void> {
    await this.pool.reserveMinimumCapacity(this.pool.getFileCount() + 4)
    await this.pool.importDb(WorkingCopies.path(fileId), bytes)
  }

  /** Opens (creating if needed) the working copy. */
  async open(fileId: string): Promise<WasmSqliteDriver> {
    await this.pool.reserveMinimumCapacity(this.pool.getFileCount() + 4)
    const db = new this.pool.OpfsSAHPoolDb(WorkingCopies.path(fileId))
    db.exec('PRAGMA journal_mode = DELETE')
    return new WasmSqliteDriver(this.sqlite3, db)
  }

  /** Deletes a working copy (it must be closed). */
  remove(fileId: string): void {
    this.pool.unlink(WorkingCopies.path(fileId))
  }
}
