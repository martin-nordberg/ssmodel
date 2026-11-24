import type { SvcBundle } from '@/ledger/services/SvcBundle.ts'
import type { LedgerFileInfo, OpenBy } from '@/store/ledger/ledgerFile.ts'
import type { Change, CommandInputs, Entity } from '@/store/ledger/session.ts'

export type { Change, Entity }

// The typed message protocol between the UI and the store worker [NFR-ARCH-8]. React code never touches SQLite: it
// sends requests and receives results, errors and change notifications. Queries and commands name a ledger service
// method (the entity's IXxxSvc); their argument and result types come from those interfaces.

type AsyncMethod = (...args: never[]) => Promise<unknown>
type MethodName<E extends Entity> = {
  [M in keyof SvcBundle[E]]: SvcBundle[E][M] extends AsyncMethod ? M : never
}[keyof SvcBundle[E]] &
  string

/** Methods that change data: create, patch and delete. Each is one change-log action. */
export type CommandMethod<E extends Entity> = {
  [K in keyof CommandInputs]: K extends `${E}.${infer M}` ? M : never
}[keyof CommandInputs]
/** Methods that only read. */
export type QueryMethod<E extends Entity> = Exclude<
  MethodName<E>,
  `create${string}` | `patch${string}` | `delete${string}`
>

type Fn<E extends Entity, M extends string> = M extends keyof SvcBundle[E] ? SvcBundle[E][M] : never
export type MethodArgs<E extends Entity, M extends string> = Fn<E, M> extends (...args: infer A) => unknown ? A : never
export type MethodResult<E extends Entity, M extends string> =
  Fn<E, M> extends (...args: never[]) => Promise<infer R> ? R : never

/** A command's input: the event without `origId` and `hlc` (the worker stamps the session's origin). */
export type CommandInput<E extends Entity, M extends CommandMethod<E>> = CommandInputs[`${E}.${M}` &
  keyof CommandInputs]

export interface OpenResult {
  fileId: string
  /** Null when read-only. */
  origId: string | null
  encrypted: boolean
  readOnly: boolean
  /** A new file's recovery key, shown once [FR-STO-5]; null when opening an existing file. */
  recoveryWords: string[] | null
}

/** The open file's encryption state, for the file settings. */
export interface EncryptionInfo {
  encrypted: boolean
  hasRecoveryKey: boolean
}

/** What `inspect` learns from a file's bytes before its password. */
export interface InspectResult extends LedgerFileInfo {
  /** The file's change counter (FR-STO-3). */
  contentVersion: number
}

/** Every request the worker accepts, with its result type. */
export interface StoreOps {
  version: { req: Record<string, never>; res: string }
  /** A new, empty file, in a new working copy. Write it to the user's file with `export`. */
  create: { req: { password: string | undefined; deviceName: string }; res: OpenResult }
  inspect: { req: { bytes: Uint8Array }; res: InspectResult }
  /**
   * The change counter of the file's working copy in this browser (null if there's none). Ask while holding the
   * file's Web Lock: a working copy still locked then belongs to a tab that just closed or crashed, so this waits a
   * few seconds for its handles to be released [FR-STO-3].
   */
  workingCopyVersion: { req: { fileId: string }; res: number | null }
  /**
   * Opens a file: `source: 'file'` copies the bytes into the working copy first; `'working-copy'` keeps the working
   * copy (recovering changes the file lacks).
   */
  open: {
    req: {
      bytes: Uint8Array
      password: string | undefined
      /** The recovery key's words, instead of the password. */
      recoveryWords?: string
      deviceName: string
      allowMigration: boolean
      source: 'file' | 'working-copy'
    }
    res: OpenResult
  }
  /**
   * Opens a snapshot read-only, in memory, without touching OPFS: the file is open for editing in another tab
   * (FR-STO-4). Commands are refused.
   */
  openReadOnly: { req: { bytes: Uint8Array; password: string | undefined; recoveryWords?: string }; res: OpenResult }
  /**
   * Converts a Checquery file (its bytes; the original is never touched) into a new file in a new working copy, and
   * opens it [FR-MIG-1]. Write it to the user's new .plens file with `export`.
   */
  convertChecquery: { req: { bytes: Uint8Array; password: string; deviceName: string }; res: OpenResult }
  /** Replaces a read-only session's snapshot with a newer one (no password needed again). */
  reload: { req: { bytes: Uint8Array }; res: null }
  /** Records (or clears) which device has the file open for editing. Not a change. */
  setOpenBy: { req: { openBy: OpenBy | null }; res: null }
  encryptionInfo: { req: Record<string, never>; res: EncryptionInfo }
  /** Rewraps the file key with a new password; the recovery key keeps working. */
  changePassword: { req: { newPassword: string }; res: null }
  /** Replaces the recovery key (the old one stops working); returns the new words to show once. */
  newRecoveryKey: { req: Record<string, never>; res: { words: string[] } }
  /** Turns encryption on (with a password; returns the new recovery key) or off (`password` undefined). */
  setEncryption: { req: { password: string | undefined }; res: { recoveryWords: string[] | null } }
  /** The whole open database, to write to the user's file. */
  export: { req: Record<string, never>; res: Uint8Array }
  /** Closes the open file. The working copy is deleted unless `keepWorkingCopy` (e.g. the last save failed). */
  close: { req: { keepWorkingCopy: boolean }; res: null }
  query: { req: { entity: Entity; method: string; args: unknown[] }; res: unknown }
  command: { req: { entity: Entity; method: string; input: unknown }; res: unknown }
}

export type Op = keyof StoreOps

export type StoreRequest<K extends Op = Op> = { id: number; op: K } & StoreOps[K]['req']

/** Why a request failed. `internal` is a bug or an unexpected condition; the rest are expected and shown to users. */
export type StoreErrorCode =
  | 'not-a-ledger-file'
  | 'wrong-password'
  | 'wrong-recovery-key'
  | 'password-required'
  | 'unsupported-version'
  | 'migration-required'
  | 'no-file-open'
  | 'file-locked'
  | 'read-only'
  | 'invalid-request'
  | 'internal'

export type StoreResponse =
  | { kind: 'result'; id: number; ok: true; result: unknown }
  | { kind: 'result'; id: number; ok: false; error: { code: StoreErrorCode; message: string } }

export type StoreNotification =
  | { kind: 'change'; seq: number; changes: Change[] }
  | { kind: 'session'; state: 'open'; fileId: string }
  | { kind: 'session'; state: 'closed' }

export type StoreMessage = StoreResponse | StoreNotification
