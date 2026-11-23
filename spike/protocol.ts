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

export interface Requests {
  version: { args: []; result: string }
  makeSyntheticDb: { args: [targetBytes: number]; result: Uint8Array }
  roundTrip: { args: [bytes: Uint8Array, vfs: Vfs]; result: RoundTripResult }
}

export type Op = keyof Requests

export interface RequestMessage<K extends Op = Op> {
  id: number
  op: K
  args: Requests[K]['args']
}

export type ResponseMessage = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string }
