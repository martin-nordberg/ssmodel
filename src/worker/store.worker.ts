/// <reference lib="webworker" />
import type { DbDriver } from '@/store/driver/DbDriver.ts'
import { loadSqlite, openWasmMemory } from '@/store/driver/wasmSqlite.ts'
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

// The store worker [NFR-ARCH-8]: owns SQLite WASM, the open file's database and its in-memory materialized store.
// Requests are answered in order of arrival; commands are additionally serialized by the session.

declare const self: DedicatedWorkerGlobalScope

interface Open {
  file: DbDriver
  memory: DbDriver
  session: LedgerSession
  fileId: string
}

let current: Open | null = null
let seq = 0

function post(message: StoreMessage, transfer: Transferable[] = []): void {
  self.postMessage(message, transfer)
}

function onChange(change: Change): void {
  post({ kind: 'change', seq: ++seq, changes: [change] })
}

function closeCurrent(): void {
  if (!current) return
  current.memory.close()
  current.file.close()
  current = null
  post({ kind: 'session', state: 'closed' })
}

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
  closeCurrent()
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

type Handlers = { [K in Op]: (req: StoreRequest<K>) => Promise<StoreOps[K]['res']> }

const handlers: Handlers = {
  async version() {
    return (await loadSqlite()).version.libVersion
  },
  async create({ password, deviceName }) {
    const file = openWasmMemory(await loadSqlite())
    return start(file, (memory) => createLedgerFile(file, memory, { password, deviceName }))
  },
  async inspect({ bytes }) {
    const db = openWasmMemory(await loadSqlite(), bytes)
    try {
      return inspectLedgerFile(db)
    } finally {
      db.close()
    }
  },
  async open({ bytes, password, deviceName, allowMigration }) {
    const file = openWasmMemory(await loadSqlite(), bytes)
    return start(file, (memory) => openLedgerFile(file, memory, { password, deviceName, allowMigration }))
  },
  async export() {
    return requireOpen().file.exportBytes()
  },
  async close() {
    closeCurrent()
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
