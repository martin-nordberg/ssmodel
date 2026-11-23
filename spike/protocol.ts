import type { Totals } from './totals.ts'

// Messages between the spike page and its SQLite worker.

export type Vfs = 'opfs' | 'sahpool'

export interface RoundTripTimings {
  importMs: number
  openAndQueryMs: number
  exportMs: number
  writeHandleMs: number
  readBackMs: number
}

export interface RoundTripResult {
  vfs: Vfs
  bytes: number
  tables: number
  /** Export of the untouched database equals the input bytes. */
  identical: boolean
  /** Bytes written to a FileSystemFileHandle read back equal to the export. */
  handleRoundTrip: boolean
  /** A row written through the VFS survives export and re-import. */
  writeSurvives: boolean
  timings: RoundTripTimings
}

export interface DecryptResult {
  encrypted: boolean
  /** False when the password was rejected; nothing else is filled in then. */
  passwordOk: boolean
  actions: number
  /** Action id → decrypted JSON, only when requested (synthetic fixtures). */
  plaintexts?: Record<string, string>
  timings: { openMs: number; keyMs: number; decryptMs: number }
}

export interface ReplayResult {
  passwordOk: boolean
  actions: number
  /** Actions replayed, by type. */
  counts: Record<string, number>
  totals?: Totals
  timings: { openMs: number; keyMs: number; decryptMs: number; applyMs: number; queryMs: number }
}

export interface Requests {
  version: { args: []; result: string }
  makeSyntheticDb: { args: [targetBytes: number]; result: Uint8Array }
  roundTrip: { args: [bytes: Uint8Array, vfs: Vfs]; result: RoundTripResult }
  replayFile: { args: [bytes: Uint8Array, password: string, dates: string[], years: string[]]; result: ReplayResult }
  decryptFile: { args: [bytes: Uint8Array, password: string, keepPlaintexts: boolean]; result: DecryptResult }
}

export type Op = keyof Requests

export interface RequestMessage<K extends Op = Op> {
  id: number
  op: K
  args: Requests[K]['args']
}

export type ResponseMessage = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string }
