/// <reference lib="webworker" />
import { createId } from '@paralleldrive/cuid2'
import { AesGcmCodec } from '@/store/actionLog/encryption/AesGcmCodec.ts'
import { hasRecoveryKey } from '@/store/actionLog/encryption/keys.ts'
import type { PayloadCodec } from '@/store/actionLog/encryption/PayloadCodec.ts'
import { readContentVersion } from '@/store/actionLog/meta.ts'
import type { DbDriver } from '@/store/driver/DbDriver.ts'
import { loadSqlite, openWasmMemory, type WasmSqliteDriver } from '@/store/driver/wasmSqlite.ts'
import { WorkingCopies, WorkingCopyLockedError } from '@/store/file/opfs.ts'
import {
  changeFilePassword,
  EncryptionSettingsError,
  newRecoveryKey,
  turnEncryptionOff,
  turnEncryptionOn,
} from '@/store/ledger/encryptionSettings.ts'
import {
  createLedgerFile,
  inspectLedgerFile,
  LedgerFileError,
  type OpenedLedger,
  openLedgerFile,
  writeOpenBy,
} from '@/store/ledger/ledgerFile.ts'
import { InvalidRequestError, LedgerSession, ReadOnlyError } from '@/store/ledger/session.ts'
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
// materialized store. A file open for editing elsewhere is opened read-only, as an in-memory snapshot that the tab
// replaces as the writer saves changes (FR-STO-4). Requests are answered in order of arrival; commands are also
// serialized by the session.

declare const self: DedicatedWorkerGlobalScope

interface Open {
  fileId: string
  /** The working copy, or for a read-only session an in-memory snapshot. */
  file: DbDriver
  memory: DbDriver
  session: LedgerSession
  codec: PayloadCodec
  readOnly: boolean
}

let current: Open | null = null
let seq = 0
let copies: WorkingCopies | undefined

async function workingCopies(): Promise<WorkingCopies> {
  copies ??= new WorkingCopies(await loadSqlite())
  return copies
}

class StoreFailure extends Error {
  readonly code: StoreErrorCode

  constructor(code: StoreErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

function post(message: StoreMessage, transfer: Transferable[] = []): void {
  self.postMessage(message, transfer)
}

function onChange(change: Change): void {
  post({ kind: 'change', seq: ++seq, changes: [change] })
}

async function closeCurrent(keepWorkingCopy: boolean): Promise<void> {
  if (!current) return
  const { fileId, file, memory, readOnly } = current
  current = null
  memory.close()
  if (readOnly) file.close()
  else (await workingCopies()).closeCopy(fileId, file as WasmSqliteDriver, keepWorkingCopy)
  post({ kind: 'session', state: 'closed' })
}

/** Opens a ledger on `file` (a working copy or a snapshot) with a fresh materialized store. */
async function start(
  file: DbDriver,
  readOnly: boolean,
  open: (memory: DbDriver) => Promise<OpenedLedger>,
  onFailure: () => void,
): Promise<OpenResult> {
  const memory = openWasmMemory(await loadSqlite())
  let opened: OpenedLedger
  try {
    opened = await open(memory)
  } catch (err) {
    memory.close()
    onFailure()
    throw err
  }
  const session = new LedgerSession(opened.store, opened.origId, onChange)
  current = { fileId: opened.fileId, file, memory, session, codec: opened.codec, readOnly }
  post({ kind: 'session', state: 'open', fileId: opened.fileId })
  return {
    fileId: opened.fileId,
    origId: opened.origId,
    encrypted: opened.encrypted,
    readOnly,
    recoveryWords: opened.recoveryWords,
  }
}

function requireOpen(): Open {
  if (!current) throw new StoreFailure('no-file-open', 'No file is open.')
  return current
}

function requireWriter(): Open {
  const open = requireOpen()
  if (open.readOnly) throw new StoreFailure('read-only', 'This file is open for editing in another tab or window.')
  return open
}

/** Inspects file bytes in a temporary in-memory database. */
async function inspectBytes(bytes: Uint8Array) {
  const db = openWasmMemory(await loadSqlite(), bytes)
  try {
    return { info: inspectLedgerFile(db), contentVersion: readContentVersion(db) }
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
    const wcs = await workingCopies()
    const fileId = createId()
    const file = await wcs.openCopy(fileId)
    return start(
      file,
      false,
      (memory) => createLedgerFile(file, memory, { password, deviceName, fileId }),
      () => wcs.closeCopy(fileId, file, false),
    )
  },

  async inspect({ bytes }) {
    const { info, contentVersion } = await inspectBytes(bytes)
    return { ...info, contentVersion }
  },

  async workingCopyVersion({ fileId }) {
    if (current?.fileId === fileId) return current.readOnly ? null : readContentVersion(current.file)
    const wcs = await workingCopies()
    try {
      return (await wcs.exists(fileId)) ? await wcs.peek(fileId, readContentVersion) : null
    } catch (err) {
      if (err instanceof WorkingCopyLockedError) throw err
      return null // an unreadable leftover: opening from the file replaces it
    }
  },

  async open({ bytes, password, recoveryWords, deviceName, allowMigration, source }) {
    const { info } = await inspectBytes(bytes)
    // The main thread closes (and saves) a file before opening another; an implicit close keeps its working copy.
    if (current) await closeCurrent(true)
    const wcs = await workingCopies()
    if (source === 'file' || !(await wcs.exists(info.fileId))) await wcs.importBytes(info.fileId, bytes)
    const file = await wcs.openCopy(info.fileId)
    return start(
      file,
      false,
      (memory) => openLedgerFile(file, memory, { password, recoveryWords, deviceName, allowMigration }),
      () => wcs.closeCopy(info.fileId, file, true),
    )
  },

  async openReadOnly({ bytes, password, recoveryWords }) {
    if (current) await closeCurrent(true)
    const file = openWasmMemory(await loadSqlite(), bytes)
    return start(
      file,
      true,
      (memory) =>
        openLedgerFile(file, memory, {
          password,
          recoveryWords,
          deviceName: '',
          allowMigration: false,
          readOnly: true,
        }),
      () => file.close(),
    )
  },

  async reload({ bytes }) {
    const open = requireOpen()
    if (!open.readOnly) throw new StoreFailure('invalid-request', 'Only a read-only session reloads a snapshot.')
    const { fileId, codec } = open
    const file = openWasmMemory(await loadSqlite(), bytes)
    if (inspectLedgerFile(file).fileId !== fileId) {
      file.close()
      throw new StoreFailure('invalid-request', 'The snapshot is of a different file.')
    }
    await closeCurrent(true)
    await start(
      file,
      true,
      (memory) =>
        openLedgerFile(file, memory, {
          password: undefined,
          codec,
          deviceName: '',
          allowMigration: false,
          readOnly: true,
        }),
      () => file.close(),
    )
    return null
  },

  async setOpenBy({ openBy }) {
    writeOpenBy(requireWriter().file, openBy)
    return null
  },

  async encryptionInfo() {
    const { file, codec } = requireOpen()
    return { encrypted: codec instanceof AesGcmCodec, hasRecoveryKey: hasRecoveryKey(file) }
  },

  async changePassword({ newPassword }) {
    const open = requireWriter()
    await open.session.exclusive(() => changeFilePassword(open.file, open.codec, newPassword))
    return null
  },

  async newRecoveryKey() {
    const open = requireWriter()
    return { words: await open.session.exclusive(() => newRecoveryKey(open.file, open.codec)) }
  },

  async setEncryption({ password }) {
    const open = requireWriter()
    if (password === undefined) {
      open.codec = await open.session.exclusive(() => turnEncryptionOff(open.file, open.session.store, open.codec))
      return { recoveryWords: null }
    }
    const result = await open.session.exclusive(() =>
      turnEncryptionOn(open.file, open.session.store, open.codec, password),
    )
    open.codec = result.codec
    return { recoveryWords: result.words }
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
  if (err instanceof InvalidRequestError || err instanceof EncryptionSettingsError) {
    return { code: 'invalid-request', message: err.message }
  }
  if (err instanceof ReadOnlyError) return { code: 'read-only', message: err.message }
  if (err instanceof WorkingCopyLockedError) return { code: 'file-locked', message: err.message }
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
