import type { SvcBundle } from '@/ledger/services/SvcBundle.ts'
import type { LedgerFileInfo } from '@/store/ledger/ledgerFile.ts'
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
  origId: string
  encrypted: boolean
}

/** Every request the worker accepts, with its result type. */
export interface StoreOps {
  version: { req: Record<string, never>; res: string }
  create: { req: { password: string | undefined; deviceName: string }; res: OpenResult }
  inspect: { req: { bytes: Uint8Array }; res: LedgerFileInfo }
  open: {
    req: { bytes: Uint8Array; password: string | undefined; deviceName: string; allowMigration: boolean }
    res: OpenResult
  }
  export: { req: Record<string, never>; res: Uint8Array }
  close: { req: Record<string, never>; res: null }
  query: { req: { entity: Entity; method: string; args: unknown[] }; res: unknown }
  command: { req: { entity: Entity; method: string; input: unknown }; res: unknown }
}

export type Op = keyof StoreOps

export type StoreRequest<K extends Op = Op> = { id: number; op: K } & StoreOps[K]['req']

/** Why a request failed. `internal` is a bug or an unexpected condition; the rest are expected and shown to users. */
export type StoreErrorCode =
  | 'not-a-ledger-file'
  | 'wrong-password'
  | 'password-required'
  | 'unsupported-version'
  | 'migration-required'
  | 'no-file-open'
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
