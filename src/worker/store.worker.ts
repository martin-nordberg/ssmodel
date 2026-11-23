/// <reference lib="webworker" />
import { createId } from '@paralleldrive/cuid2'
import { readContentVersion } from '@/store/actionLog/meta.ts'
import type { DbDriver } from '@/store/driver/DbDriver.ts'
import { loadSqlite, openWasmMemory } from '@/store/driver/wasmSqlite.ts'
import { WorkingCopies } from '@/store/file/opfs.ts'
import {
  createLedgerFile,
  inspectLedgerFile,
  LedgerFileError,
  type OpenedLedger,
  openLedgerFile,
} from '@/store/ledger/ledgerFile.ts'
import { InvalidRequestError, LedgerSession } from '@/store/ledger/session.ts'
import type {
  Change,
  Op,
  OpenResult,
  StoreErrorCode,
  StoreMessage,
  StoreOps,
  StoreRequest,
} from '@/worker/storeProtocol.ts'

// The store worker [NFR-ARCH-8]: owns SQLite WASM, the open file's working copy in OPFS [FR-STO-2] and its in-memory
// materialized store. Requests are answered in order of arrival; commands are additionally serialized by the session.

declare const self: DedicatedWorkerGlobalScope

interface Open {
  file: DbDriver
  memory: DbDriver
  session: LedgerSession
  fileId: string
}

let current: Open | null = null
let seq = 0
let workingCopiesPromise: Promise<WorkingCopies> | undefined

function workingCopies(): Promise<WorkingCopies> {
  workingCopiesPromise ??= loadSqlite().then((sqlite3) => WorkingCopies.install(sqlite3))
  return workingCopiesPromise
}

function post(message: StoreMessage, transfer: Transferable[] = []): void {
  self.postMessage(message, transfer)
}

function onChange(change: Change): void {
  post({ kind: 'change', seq: ++seq, changes: [change] })
}

async function closeCurrent(keepWorkingCopy: boolean): Promise<void> {
  if (!current) return
  const { fileId } = current
  current.memory.close()
  current.file.close()
  current = null
  if (!keepWorkingCopy) (await workingCopies()).remove(fileId)
  post({ kind: 'session', state: 'closed' })
}

/** Opens a ledger on the working copy `file`; the previous file (if another) is closed only once this succeeds. */
async function start(file: DbDriver, open: (memory: DbDriver) => Promise<OpenedLedger>): Promise<OpenResult> {
  const sqlite3 = await loadSqlite()
  const memory = openWasmMemory(sqlite3)
  let opened: OpenedLedger
  try {
    opened = await open(memory)
  } catch (err) {
    memory.close()
    file.close()
    throw err
  }
  current = { file, memory, session: new LedgerSession(opened.store, opened.origId, onChange), fileId: opened.fileId }
  post({ kind: 'session', state: 'open', fileId: opened.fileId })
  return { fileId: opened.fileId, origId: opened.origId, encrypted: opened.encrypted }
}

function requireOpen(): Open {
  if (!current) throw new StoreFailure('no-file-open', 'No file is open.')
  return current
}

class StoreFailure extends Error {
  readonly code: StoreErrorCode

  constructor(code: StoreErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

/** The file id from file bytes (closing the temporary database). */
function inspectBytes(db: DbDriver): string {
  try {
    return inspectLedgerFile(db).fileId
  } finally {
    db.close()
  }
}

type Handlers = { [K in Op]: (req: StoreRequest<K>) => Promise<StoreOps[K]['res']> }

const handlers: Handlers = {
  async version() {
    return (await loadSqlite()).version.libVersion
  },
  async create({ password, deviceName }) {
    if (current) await closeCurrent(true)
    const fileId = createId()
    const file = await (await workingCopies()).open(fileId)
    try {
      return await start(file, (memory) => createLedgerFile(file, memory, { password, deviceName, fileId }))
    } catch (err) {
      ;(await workingCopies()).remove(fileId)
      throw err
    }
  },
  async inspect({ bytes }) {
    const db = openWasmMemory(await loadSqlite(), bytes)
    let info: ReturnType<typeof inspectLedgerFile>
    let contentVersion: number
    try {
      info = inspectLedgerFile(db)
      contentVersion = readContentVersion(db)
    } finally {
      db.close()
    }
    let workingVersion: number | null = null
    if (current?.fileId === info.fileId) {
      workingVersion = readContentVersion(current.file)
    } else if ((await workingCopies()).has(info.fileId)) {
      const wc = await (await workingCopies()).open(info.fileId)
      try {
        workingVersion = readContentVersion(wc)
      } catch {
        workingVersion = null // an unreadable leftover: ignore it, opening from the file replaces it
      } finally {
        wc.close()
      }
    }
    const newerWorkingCopy =
      workingVersion !== null && workingVersion > contentVersion ? { contentVersion: workingVersion } : null
    return { ...info, contentVersion, newerWorkingCopy }
  },
  async open({ bytes, password, deviceName, allowMigration, source }) {
    const wcs = await workingCopies()
    const fileId = inspectBytes(openWasmMemory(await loadSqlite(), bytes))
    // The main thread closes (and saves) a file before opening another; an implicit close keeps its working copy.
    if (current) await closeCurrent(true)
    if (source === 'file' || !wcs.has(fileId)) await wcs.importBytes(fileId, bytes)
    const file = await wcs.open(fileId)
    return start(file, (memory) => openLedgerFile(file, memory, { password, deviceName, allowMigration }))
  },
  async export() {
    return requireOpen().file.exportBytes()
  },
  async close({ keepWorkingCopy }) {
    await closeCurrent(keepWorkingCopy)
    return null
  },
  query({ entity, method, args }) {
    return requireOpen().session.query(entity, method, args)
  },
  command({ entity, method, input }) {
    return requireOpen().session.command(entity, method, input)
  },
}

function errorOf(err: unknown): { code: StoreErrorCode; message: string } {
  if (err instanceof StoreFailure || err instanceof LedgerFileError) return { code: err.code, message: err.message }
  if (err instanceof InvalidRequestError) return { code: 'invalid-request', message: err.message }
  return { code: 'internal', message: err instanceof Error ? err.message : String(err) }
}

self.onmessage = async (event: MessageEvent<StoreRequest>) => {
  const req = event.data
  try {
    const handler = handlers[req.op] as (r: StoreRequest) => Promise<unknown>
    if (!handler) throw new StoreFailure('invalid-request', `Unknown request: ${String(req.op)}`)
    const result = await handler(req)
    post({ kind: 'result', id: req.id, ok: true, result }, result instanceof Uint8Array ? [result.buffer] : [])
  } catch (err) {
    post({ kind: 'result', id: req.id, ok: false, error: errorOf(err) })
  }
}
