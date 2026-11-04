import { WorkerPool } from './pool.ts'

let pool: WorkerPool | null = null

/** The app-wide engine pool (Vite bundles the worker from this literal URL). */
export function getPool(): WorkerPool {
  pool ??= new WorkerPool(() => new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' }))
  return pool
}
