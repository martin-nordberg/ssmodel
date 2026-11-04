import { afterEach, expect, test } from 'bun:test'
import { prepare } from '@/engine/model/prepare.ts'
import { runShard } from '@/engine/sim/monteCarlo.ts'
import { parseHouseholdYaml } from '@/schema/yamlio.ts'
import { runDetail, runMonteCarlo } from '@/worker/monteCarloClient.ts'
import { WorkerPool } from '@/worker/pool.ts'

const workerUrl = new URL('../../src/worker/engine.worker.ts', import.meta.url)
const parsed = parseHouseholdYaml(await Bun.file(new URL('../fixtures/full.yaml', import.meta.url)).text())
if (!parsed.ok) throw new Error('fixture')
const file = parsed.value
const prep = prepare(file)
const candidates = [prep.candidates[0]!, prep.people[0].age.fraMonth, prep.candidates.at(-1)!]
const pools: WorkerPool[] = []
afterEach(() => {
  for (const p of pools.splice(0)) p.terminate()
})

test('Monte Carlo results do not depend on worker count [FR-MC-4]', async () => {
  const one = new WorkerPool(() => new Worker(workerUrl), 1)
  const three = new WorkerPool(() => new Worker(workerUrl), 3)
  pools.push(one, three)
  const progress: number[] = []
  const a = await runMonteCarlo(one, file, 'base', {
    paths: 60,
    seed: 5,
    candidates,
    onProgress: (f) => progress.push(f),
  })
  const b = await runMonteCarlo(three, file, 'base', { paths: 60, seed: 5, candidates })
  expect(b.map((c) => Array.from(c.terminal))).toEqual(a.map((c) => Array.from(c.terminal)))
  expect(b.map((c) => Array.from(c.depleted))).toEqual(a.map((c) => Array.from(c.depleted)))
  expect(progress.at(-1)).toBeCloseTo(1, 6)
  // Same as running in-process.
  const local = runShard(prep, { seed: 5, pathStart: 0, pathEnd: 60, candidates })
  expect(Array.from(local[1]!.terminal)).toEqual(Array.from(a[1]!.terminal))
})

test('paths differ, deaths are stochastic, and claiming later raises lifetime SS on average', async () => {
  const s = runShard(prep, { seed: 9, pathStart: 0, pathEnd: 200, candidates })
  const mean = (x: Float64Array) => x.reduce((p, v) => p + v, 0) / x.length
  expect(new Set(Array.from(s[0]!.terminal)).size).toBeGreaterThan(150)
  expect(new Set(Array.from(s[0]!.lastYear)).size).toBeGreaterThan(5)
  expect(mean(s[2]!.pvSs)).toBeGreaterThan(mean(s[0]!.pvSs) * 0.9)
})

test('detail run returns per-year balances and the median path rows', async () => {
  const pool = new WorkerPool(() => new Worker(workerUrl), 2)
  pools.push(pool)
  const d = await runDetail(pool, file, 'base', prep.people[0].age.fraMonth, { paths: 40, seed: 3 })
  expect(d.liquid.length).toBe(40 * d.years)
  expect(d.medianRows.length).toBeGreaterThan(5)
  expect(d.medianRows[0]!.year).toBe(2027)
  const sorted = Array.from(d.terminal).sort((x, y) => x - y)
  expect(d.terminal[d.medianPath]).toBe(sorted[20]!)
})

test('cancellation rejects', async () => {
  const pool = new WorkerPool(() => new Worker(workerUrl), 2)
  pools.push(pool)
  const ac = new AbortController()
  const run = runMonteCarlo(pool, file, 'base', {
    paths: 2000,
    seed: 1,
    candidates: prep.candidates,
    signal: ac.signal,
  })
  setTimeout(() => ac.abort(), 50)
  await expect(run).rejects.toThrow(/abort/i)
})

import { runRecommendation } from '@/worker/monteCarloClient.ts'

test('recommendation run: refined grid finds the same best date as the full grid', async () => {
  const pool = new WorkerPool(() => new Worker(workerUrl), 3)
  pools.push(pool)
  const objective = { successFloor: 0.9, bequestFloor: 0.5, runnerUpTolerance: 0.02, bequestTarget: 0 }
  const fra = prep.people[0].age.fraMonth
  const full = await runRecommendation(pool, file, 'base', {
    paths: 120,
    seed: 4,
    candidates: prep.candidates,
    fra,
    objective,
    refine: false,
  })
  const fine = await runRecommendation(pool, file, 'base', {
    paths: 120,
    seed: 4,
    candidates: prep.candidates,
    fra,
    objective,
    refine: true,
  })
  expect(full.metrics.length).toBe(prep.candidates.length)
  expect(fine.metrics.length).toBeLessThan(prep.candidates.length)
  expect(fine.recommendation?.best.claim).toBe(full.recommendation?.best.claim)
  // Shared candidates have identical metrics (common random numbers).
  const fraFull = full.metrics.find((m) => m.claim === fra)!
  const fraFine = fine.metrics.find((m) => m.claim === fra)!
  expect(fraFine.terminal.p50).toBe(fraFull.terminal.p50)
})
