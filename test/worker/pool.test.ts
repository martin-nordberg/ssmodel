import { afterEach, expect, test } from 'bun:test'
import { WorkerPool } from '@/worker/pool.ts'

const workerUrl = new URL('../../src/worker/engine.worker.ts', import.meta.url)
let pool: WorkerPool | null = null
afterEach(() => pool?.terminate())

async function sample(size: number, shards: number[][]) {
  pool = new WorkerPool(() => new Worker(workerUrl), size)
  const p = pool
  const parts = await Promise.all(shards.map((paths) => p.run('rngSample', { seed: 99, paths, count: 5 })))
  p.terminate()
  return parts.flatMap((r) => r.draws)
}

test('draws do not depend on worker count or sharding', async () => {
  const paths = Array.from({ length: 12 }, (_, i) => i)
  const one = await sample(1, [paths])
  const four = await sample(4, [paths.slice(0, 3), paths.slice(3, 6), paths.slice(6, 9), paths.slice(9)])
  expect(four).toEqual(one)
})

test('progress is reported and abort rejects', async () => {
  pool = new WorkerPool(() => new Worker(workerUrl), 1)
  const progress: number[] = []
  await pool.run('rngSample', { seed: 1, paths: [0, 1, 2], count: 1 }, { onProgress: (d) => progress.push(d) })
  expect(progress.at(-1)).toBe(3)

  const ac = new AbortController()
  const big = pool.run(
    'rngSample',
    { seed: 1, paths: Array.from({ length: 2000 }, (_, i) => i), count: 2000 },
    {
      signal: ac.signal,
    },
  )
  ac.abort()
  await expect(big).rejects.toThrow(/abort/i)
  // The pool still works after an abort.
  expect(await pool.run('ping', { value: 5 })).toEqual({ value: 5 })
})
