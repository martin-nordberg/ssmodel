import { useEffect, useState } from 'react'
import type {
  Change,
  CommandInput,
  CommandMethod,
  Entity,
  MethodArgs,
  MethodResult,
  Op,
  QueryMethod,
  StoreErrorCode,
  StoreMessage,
  StoreNotification,
  StoreOps,
} from '@/worker/storeProtocol.ts'

// The UI's side of the store worker protocol [NFR-ARCH-8]: typed requests, errors as StoreError, and change
// notifications for React (useStoreQuery re-runs its query when the entity it reads changes).

export class StoreError extends Error {
  readonly code: StoreErrorCode

  constructor(code: StoreErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

type Listener = (notification: StoreNotification) => void

/** Anything that can carry the protocol: a Worker, or a stand-in in tests. */
export interface StorePort {
  postMessage(message: unknown): void
  onmessage: ((event: MessageEvent) => void) | null
  terminate?(): void
}

export class StoreClient {
  private readonly port: StorePort
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private readonly listeners = new Set<Listener>()
  private nextId = 1

  constructor(port: StorePort) {
    this.port = port
    port.onmessage = (event: MessageEvent<StoreMessage>) => this.receive(event.data)
  }

  private receive(message: StoreMessage): void {
    if (message.kind === 'result') {
      const p = this.pending.get(message.id)
      if (!p) return
      this.pending.delete(message.id)
      if (message.ok) p.resolve(message.result)
      else p.reject(new StoreError(message.error.code, message.error.message))
      return
    }
    for (const listener of this.listeners) listener(message)
  }

  request<K extends Op>(op: K, req: StoreOps[K]['req']): Promise<StoreOps[K]['res']> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.port.postMessage({ ...req, id, op })
    })
  }

  /** Runs a read-only ledger service method in the worker. */
  query<E extends Entity, M extends QueryMethod<E>>(
    entity: E,
    method: M,
    ...args: MethodArgs<E, M>
  ): Promise<MethodResult<E, M>> {
    return this.request('query', { entity, method, args }) as Promise<MethodResult<E, M>>
  }

  /** Sends one change (create, patch or delete); the worker adds the session's origin. */
  command<E extends Entity, M extends CommandMethod<E>>(
    entity: E,
    method: M,
    input: CommandInput<E, M>,
  ): Promise<MethodResult<E, M>> {
    return this.request('command', { entity, method, input }) as Promise<MethodResult<E, M>>
  }

  /** Listens for change and session notifications; returns the unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  terminate(): void {
    this.port.terminate?.()
    for (const p of this.pending.values()) p.reject(new StoreError('internal', 'The store worker was stopped.'))
    this.pending.clear()
  }
}

let appClient: StoreClient | null = null

/** The app-wide store worker client (Vite bundles the worker from this literal URL). */
export function getStoreClient(): StoreClient {
  appClient ??= new StoreClient(new Worker(new URL('../worker/store.worker.ts', import.meta.url), { type: 'module' }))
  return appClient
}

/** True when a notification should refresh a query that reads `entity`. */
function affects(notification: StoreNotification, entity: Entity): boolean {
  if (notification.kind === 'session') return true
  // Balances and registers read transactions and accounts together, so a change to either refreshes both.
  const related: Record<Entity, Entity[]> = {
    accounts: ['accounts', 'accountCategories', 'transactions'],
    accountCategories: ['accountCategories', 'accounts'],
    vendors: ['vendors', 'transactions'],
    transactions: ['transactions', 'accounts', 'vendors'],
    balanceAssertions: ['balanceAssertions', 'transactions'],
    origins: ['origins'],
  }
  return notification.changes.some((c: Change) => related[entity].includes(c.entity))
}

export interface QueryState<T> {
  data: T | undefined
  error: StoreError | undefined
  loading: boolean
}

/** Runs a ledger query and re-runs it whenever a change could affect it. `args` are compared by value. */
export function useStoreQuery<E extends Entity, M extends QueryMethod<E>>(
  client: StoreClient,
  entity: E,
  method: M,
  ...args: MethodArgs<E, M>
): QueryState<MethodResult<E, M>> {
  const [state, setState] = useState<QueryState<MethodResult<E, M>>>({
    data: undefined,
    error: undefined,
    loading: true,
  })
  const key = JSON.stringify(args)
  useEffect(() => {
    let live = true
    const run = () => {
      client.query(entity, method, ...(JSON.parse(key) as MethodArgs<E, M>)).then(
        (data) => live && setState({ data, error: undefined, loading: false }),
        (error: StoreError) => live && setState((s) => ({ data: s.data, error, loading: false })),
      )
    }
    run()
    const unsubscribe = client.subscribe((n) => {
      if (affects(n, entity)) run()
    })
    return () => {
      live = false
      unsubscribe()
    }
  }, [client, entity, method, key])
  return state
}
