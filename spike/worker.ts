import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { decryptPayload, type FileCryptoMaterial, verifyPassword } from './crypto.ts'
import type { DecryptResult, ReplayResult, RequestMessage, ResponseMessage, RoundTripResult, Vfs } from './protocol.ts'
import { LedgerReplay } from './replay.ts'
import { type Balance, reduceTotals } from './totals.ts'

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

type Db = InstanceType<Sqlite3Static['oo1']['DB']>

/** Copies file bytes into an OPFS working copy (opfs-sahpool) and opens it, as the app will [FR-STO-2]. */
async function openWorkingCopy(bytes: Uint8Array, name: string): Promise<Db> {
  const util = await pool()
  await util.importDb(name, bytes)
  return new util.OpfsSAHPoolDb(name)
}

function readMeta(db: Db): Record<string, string> {
  const rows = db.selectObjects('SELECT key, value FROM _checquery_meta') as { key: string; value: string }[]
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export interface ActionRow {
  id: string
  action_type: string
  hlc: string
  iv: string
  encrypted_payload: string
}

/** Opens a .checquery file's bytes and decrypts every action in HLC order. */
async function decryptActions(
  bytes: Uint8Array,
  password: string,
  onAction: (row: ActionRow, plaintext: string) => void,
): Promise<Omit<DecryptResult, 'plaintexts'>> {
  let t = now()
  const db = await openWorkingCopy(bytes, '/working-copy.checquery')
  try {
    const meta = readMeta(db)
    const rows = db.selectObjects(
      'SELECT id, action_type, hlc, iv, encrypted_payload FROM actions ORDER BY hlc ASC',
    ) as unknown as ActionRow[]
    const openMs = now() - t
    // Files predating the "encrypted" flag were always encrypted (Checquery's openExistingFile).
    const encrypted = meta.encrypted !== 'false'
    let key: CryptoKey | null = null
    t = now()
    if (encrypted) {
      const material: FileCryptoMaterial = {
        kdfSalt: meta.kdf_salt as string,
        kdfParams: JSON.parse(meta.kdf_params as string),
        verifyIv: meta.verify_iv as string,
        verifyCiphertext: meta.verify_ciphertext as string,
      }
      key = await verifyPassword(password, material)
      if (!key) return { encrypted, passwordOk: false, actions: 0, timings: { openMs, keyMs: now() - t, decryptMs: 0 } }
    }
    const keyMs = now() - t
    t = now()
    for (const row of rows) {
      const plaintext = key ? await decryptPayload(key, row.iv, row.encrypted_payload) : row.encrypted_payload
      onAction(row, plaintext)
    }
    return { encrypted, passwordOk: true, actions: rows.length, timings: { openMs, keyMs, decryptMs: now() - t } }
  } finally {
    db.close()
  }
}

async function decryptFile(bytes: Uint8Array, password: string, keepPlaintexts: boolean): Promise<DecryptResult> {
  const plaintexts: Record<string, string> = {}
  const result = await decryptActions(bytes, password, (row, plaintext) => {
    if (keepPlaintexts) plaintexts[row.id] = plaintext
  })
  return keepPlaintexts ? { ...result, plaintexts } : result
}

/**
 * Opens a .checquery file as the app will: working copy in OPFS, password check, then every action decrypted
 * and replayed in HLC order into an in-memory ledger [NFR-ARCH-10]. Then runs the statement queries.
 */
async function replayFile(
  bytes: Uint8Array,
  password: string,
  dates: string[],
  years: string[],
): Promise<ReplayResult> {
  const sqlite3 = await sqlite3Promise
  const memory = new sqlite3.oo1.DB(':memory:')
  try {
    const ledger = new LedgerReplay(memory)
    let applyMs = 0
    memory.exec('BEGIN')
    const decrypted = await decryptActions(bytes, password, (row, plaintext) => {
      const t = now()
      ledger.apply(row.action_type, plaintext)
      applyMs += now() - t
    })
    memory.exec('COMMIT')
    const { openMs, keyMs, decryptMs } = decrypted.timings
    const timings = { openMs, keyMs, decryptMs: decryptMs - applyMs, applyMs, queryMs: 0 }
    if (!decrypted.passwordOk) return { passwordOk: false, actions: 0, counts: {}, timings }

    const t = now()
    const asOf: Record<string, Balance[]> = {}
    for (const date of dates) asOf[date] = ledger.balancesAsOf(date)
    const periods: Record<string, Balance[]> = {}
    for (const year of years) periods[year] = ledger.balancesForPeriod(`${year}-01-01`, `${year}-12-31`)
    const totals = reduceTotals(ledger.liveAccounts(), asOf, periods)
    timings.queryMs = now() - t
    return { passwordOk: true, actions: decrypted.actions, counts: ledger.counts, totals, timings }
  } finally {
    memory.close()
  }
}

const handlers = {
  version: async () => (await sqlite3Promise).version.libVersion,
  makeSyntheticDb,
  roundTrip,
  decryptFile,
  replayFile,
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
