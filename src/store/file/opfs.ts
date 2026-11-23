import type { SAHPoolUtil, Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { WasmSqliteDriver } from '@/store/driver/wasmSqlite.ts'

// Working copies in the origin-private file system [FR-STO-2]: on open, the user's file is copied into OPFS and
// SQLite opens the copy, so every committed change is durable at once; autosave later writes the whole database back
// to the user's file. Uses SQLite's opfs-sahpool VFS (chosen in P0: no cross-origin isolation headers needed, and the
// fastest).
//
// Each file gets its own pool (directory and VFS), named by its file_id. A pool's access handles are exclusive to one
// tab, so two tabs can write two different files, and a working copy left by a crash is found on reopen. A pool is
// paused (handles released) whenever its file isn't open, and never removed, since SQLite can't re-register a removed
// VFS without a reload. Worker only.

/** The working copy is held by another tab (FR-STO-4). */
export class WorkingCopyLockedError extends Error {}

const dbPath = '/working.plens'

function poolName(fileId: string): string {
  if (!/^[a-z0-9]+$/.test(fileId)) throw new Error(`Invalid file id: ${fileId}`)
  return `plens-wc-${fileId}`
}

export class WorkingCopies {
  private readonly sqlite3: Sqlite3Static
  private readonly pools = new Map<string, SAHPoolUtil>()
  private readonly open = new Set<string>()

  constructor(sqlite3: Sqlite3Static) {
    this.sqlite3 = sqlite3
  }

  private async acquire(fileId: string): Promise<SAHPoolUtil> {
    try {
      let pool = this.pools.get(fileId)
      if (!pool) {
        const name = poolName(fileId)
        pool = await this.sqlite3.installOpfsSAHPoolVfs({ name, directory: `.${name}`, initialCapacity: 4 })
        this.pools.set(fileId, pool)
      } else if (pool.isPaused()) {
        await pool.unpauseVfs()
      }
      return pool
    } catch (err) {
      // Another tab holds the pool's access handles.
      throw new WorkingCopyLockedError(`The working copy is in use in another tab (${(err as Error).message})`)
    }
  }

  private release(fileId: string): void {
    const pool = this.pools.get(fileId)
    if (pool && !pool.isPaused() && !this.open.has(fileId)) pool.pauseVfs()
  }

  /** True if a working copy exists for the file (cheap when there is none: no pool is installed). */
  async exists(fileId: string): Promise<boolean> {
    if (!this.pools.has(fileId)) {
      const root = await navigator.storage.getDirectory()
      try {
        await root.getDirectoryHandle(`.${poolName(fileId)}`)
      } catch {
        return false
      }
    }
    const pool = await this.acquire(fileId)
    try {
      return pool.getFileNames().includes(dbPath)
    } finally {
      this.release(fileId)
    }
  }

  /** Replaces the working copy with the given file bytes. */
  async importBytes(fileId: string, bytes: Uint8Array): Promise<void> {
    const pool = await this.acquire(fileId)
    try {
      await pool.importDb(dbPath, bytes)
    } finally {
      this.release(fileId)
    }
  }

  /** Opens (creating if needed) the working copy; keep it open until closeCopy. */
  async openCopy(fileId: string): Promise<WasmSqliteDriver> {
    const pool = await this.acquire(fileId)
    this.open.add(fileId)
    try {
      const db = new pool.OpfsSAHPoolDb(dbPath)
      db.exec('PRAGMA journal_mode = DELETE')
      return new WasmSqliteDriver(this.sqlite3, db)
    } catch (err) {
      this.open.delete(fileId)
      this.release(fileId)
      throw err
    }
  }

  /** Closes the working copy, deleting it unless `keep`, and releases the pool for other tabs. */
  closeCopy(fileId: string, db: WasmSqliteDriver, keep: boolean): void {
    db.close()
    this.open.delete(fileId)
    if (!keep) this.pools.get(fileId)?.unlink(dbPath)
    this.release(fileId)
  }

  /** Reads a value from a working copy that isn't open, then releases it. */
  async peek<T>(fileId: string, read: (db: WasmSqliteDriver) => T): Promise<T> {
    const db = await this.openCopy(fileId)
    try {
      return read(db)
    } finally {
      this.closeCopy(fileId, db, true)
    }
  }
}
