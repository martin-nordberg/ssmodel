// Messages between the UI thread and engine workers [NFR-ARCH-2]. Cancellation terminates the worker, so there
// is no cancel message: long synchronous engine loops could not receive one anyway.

export type TaskKind = keyof TaskMap

/** Request/response payloads per task kind. Extended as engine entry points are added. */
export interface TaskMap {
  ping: { req: { value: number }; res: { value: number } }
  rngSample: { req: { seed: number; paths: number[]; count: number }; res: { draws: number[][] } }
}

export type ToWorker = { id: number; kind: TaskKind; payload: unknown }

export type FromWorker =
  | { id: number; type: 'progress'; done: number; total: number }
  | { id: number; type: 'result'; payload: unknown }
  | { id: number; type: 'error'; message: string }
