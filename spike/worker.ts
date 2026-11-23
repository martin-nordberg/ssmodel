import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import type { RequestMessage, ResponseMessage, RoundTripResult, Vfs } from './protocol.ts'

// The spike's SQLite worker [NFR-ARCH-8]: loads the official SQLite WASM build and runs the measurements.

const sqlite3Promise: Promise<Sqlite3Static> = sqlite3InitModule()
let poolPromise: ReturnType<Sqlite3Static['installOpfsSAHPoolVfs']> | undefined

async function pool() {
  const sqlite3 = await sqlite3Promise
  poolPromise ??= sqlite3.installOpfsSAHPoolVfs({ name: 'spike-sahpool', clearOnInit: true })
  return poolPromise
}

const now = () => performance.now()

/** An in-memory database of roughly `targetBytes`, exported as file bytes: a stand-in for a user's file. */
async function makeSyntheticDb(targetBytes: number): Promise<Uint8Array> {
  const sqlite3 = await sqlite3Promise
  const db = new sqlite3.oo1.DB(':memory:')
  try {
    db.exec('CREATE TABLE actions (id INTEGER PRIMARY KEY, hlc TEXT NOT NULL, payload TEXT NOT NULL)')
    db.exec('CREATE INDEX actions_hlc_idx ON actions (hlc)')
    const rows = Math.ceil(targetBytes / 900)
    db.transaction(() => {
      for (let i = 0; i < rows; i++) {
        db.exec({
          sql: 'INSERT INTO actions (hlc, payload) VALUES (?, ?)',
          bind: [i.toString(16).padStart(16, '0'), 'x'.repeat(600 + (i % 200))],
        })
      }
    })
    return sqlite3.capi.sqlite3_js_db_export(db)
  } finally {
    db.close()
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/**
 * Copies file bytes into OPFS through one VFS, opens and queries the copy, exports it, writes the export to a
 * FileSystemFileHandle (here in OPFS; the app's would be the user's file) and reads it back [FR-STO-2].
 */
async function roundTrip(input: Uint8Array, vfs: Vfs): Promise<RoundTripResult> {
  const sqlite3 = await sqlite3Promise
  const name = `/roundtrip-${vfs}.sqlite3`
  const util = vfs === 'sahpool' ? await pool() : undefined
  if (vfs === 'opfs' && !sqlite3.oo1.OpfsDb) throw new Error('opfs VFS unavailable (needs cross-origin isolation)')

  const open = () => (util ? new util.OpfsSAHPoolDb(name) : new sqlite3.oo1.OpfsDb(name, 'w'))
  const exportBytes = (db: InstanceType<typeof sqlite3.oo1.DB>) =>
    util ? util.exportFile(name) : sqlite3.capi.sqlite3_js_db_export(db)

  let t = now()
  if (util) await util.importDb(name, input)
  else await sqlite3.oo1.OpfsDb.importDb(name, input)
  const importMs = now() - t

  t = now()
  let db = open()
  const tables = Number(db.selectValue("SELECT count(*) FROM sqlite_master WHERE type = 'table'"))
  db.selectValue('PRAGMA quick_check')
  const openAndQueryMs = now() - t

  t = now()
  const exported = exportBytes(db)
  const exportMs = now() - t
  db.close()
  const identical = sameBytes(exported, input)

  const dir = await navigator.storage.getDirectory()
  const handle = await dir.getFileHandle(`user-file-${vfs}.sqlite3`, { create: true })
  t = now()
  const writable = await handle.createWritable()
  await writable.write(exported as Uint8Array<ArrayBuffer>)
  await writable.close()
  const writeHandleMs = now() - t
  t = now()
  const readBack = new Uint8Array(await (await handle.getFile()).arrayBuffer())
  const readBackMs = now() - t
  const handleRoundTrip = sameBytes(readBack, exported)

  db = open()
  db.exec("CREATE TABLE IF NOT EXISTS spike_scratch (v TEXT); INSERT INTO spike_scratch VALUES ('kept')")
  const afterWrite = exportBytes(db)
  db.close()
  const check = new sqlite3.oo1.DB(':memory:')
  const p = sqlite3.wasm.allocFromTypedArray(afterWrite)
  const rc = sqlite3.capi.sqlite3_deserialize(
    check,
    'main',
    p,
    afterWrite.length,
    afterWrite.length,
    sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE,
  )
  check.checkRc(rc)
  const writeSurvives = check.selectValue('SELECT v FROM spike_scratch') === 'kept'
  check.close()

  return {
    vfs,
    bytes: input.length,
    tables,
    identical,
    handleRoundTrip,
    writeSurvives,
    timings: { importMs, openAndQueryMs, exportMs, writeHandleMs, readBackMs },
  }
}

const handlers = {
  version: async () => (await sqlite3Promise).version.libVersion,
  makeSyntheticDb,
  roundTrip,
} as const

self.onmessage = async (event: MessageEvent<RequestMessage>) => {
  const { id, op, args } = event.data
  let response: ResponseMessage
  try {
    const handler = handlers[op] as (...a: unknown[]) => Promise<unknown>
    response = { id, ok: true, result: await handler(...args) }
  } catch (err) {
    response = { id, ok: false, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) }
  }
  self.postMessage(response)
}
