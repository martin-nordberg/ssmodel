import { WorkerPool } from './pool.ts'

let pool: WorkerPool | null = null

/** The app-wide engine pool (Vite bundles the worker from this literal URL). */
export function getPool(): WorkerPool {
  // ?poolSize=N overrides the default (cores - 1); used by the e2e tests.
  const requested = Number(new URLSearchParams(globalThis.location?.search ?? '').get('poolSize'))
  pool ??= new WorkerPool(
    () => new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' }),
    requested > 0 ? requested : undefined,
  )
  return pool
}
