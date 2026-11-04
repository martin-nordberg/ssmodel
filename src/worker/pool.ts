import type { FromWorker, TaskKind, TaskMap, ToWorker } from './protocol.ts'

export type RunOptions = { onProgress?: (done: number, total: number) => void; signal?: AbortSignal }

type Pending = {
  id: number
  kind: TaskKind
  payload: unknown
  opts: RunOptions
  resolve(v: unknown): void
  reject(e: unknown): void
}

type Slot = { worker: Worker; task: Pending | null }

/** Fixed-size pool of engine workers [NFR-ARCH-2]. Aborting a running task terminates and replaces its worker. */
export class WorkerPool {
  private slots: Slot[] = []
  private queue: Pending[] = []
  private nextId = 1

  private readonly factory: () => Worker
  readonly size: number

  constructor(factory: () => Worker, size: number = defaultPoolSize()) {
    this.factory = factory
    this.size = size
    for (let i = 0; i < size; i++) this.slots.push(this.spawn())
  }

  run<K extends TaskKind>(kind: K, payload: TaskMap[K]['req'], opts: RunOptions = {}): Promise<TaskMap[K]['res']> {
    return new Promise((resolve, reject) => {
      if (opts.signal?.aborted) return reject(abortError())
      const task: Pending = {
        id: this.nextId++,
        kind,
        payload,
        opts,
        resolve: resolve as (v: unknown) => void,
        reject,
      }
      opts.signal?.addEventListener('abort', () => this.abort(task), { once: true })
      this.queue.push(task)
      this.pump()
    })
  }

  terminate(): void {
    for (const s of this.slots) {
      s.worker.terminate()
      s.task?.reject(abortError())
    }
    for (const t of this.queue) t.reject(abortError())
    this.slots = []
    this.queue = []
  }

  private spawn(): Slot {
    const slot: Slot = { worker: this.factory(), task: null }
    slot.worker.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(slot, e.data)
    slot.worker.onerror = (e) => {
      e.preventDefault?.()
      const task = slot.task
      slot.task = null
      task?.reject(new Error(e.message || 'worker error'))
      this.pump()
    }
    return slot
  }

  private onMessage(slot: Slot, msg: FromWorker) {
    const task = slot.task
    if (!task || task.id !== msg.id) return
    if (msg.type === 'progress') {
      task.opts.onProgress?.(msg.done, msg.total)
      return
    }
    slot.task = null
    if (msg.type === 'result') task.resolve(msg.payload)
    else task.reject(new Error(msg.message))
    this.pump()
  }

  private pump() {
    for (const slot of this.slots) {
      if (slot.task) continue
      const task = this.queue.shift()
      if (!task) return
      slot.task = task
      const msg: ToWorker = { id: task.id, kind: task.kind, payload: task.payload }
      slot.worker.postMessage(msg)
    }
  }

  private abort(task: Pending) {
    const qi = this.queue.indexOf(task)
    if (qi >= 0) {
      this.queue.splice(qi, 1)
      task.reject(abortError())
      return
    }
    const si = this.slots.findIndex((s) => s.task === task)
    if (si < 0) return
    this.slots[si]!.worker.terminate()
    this.slots[si] = this.spawn()
    task.reject(abortError())
    this.pump()
  }
}

export function defaultPoolSize(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4
  return Math.max(1, cores - 1)
}

function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError')
}
