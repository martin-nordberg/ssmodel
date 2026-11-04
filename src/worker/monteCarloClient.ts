// Main-thread orchestration of Monte Carlo runs across the worker pool [FR-MC-1, NFR-SIM-1, FR-UI-9].
import { type CandidateSamples, concatSamples, type DetailShard } from '@/engine/sim/monteCarlo.ts'
import type { YearRow } from '@/engine/sim/path.ts'
import type { HouseholdFile } from '@/schema/model.ts'
import type { WorkerPool } from './pool.ts'

export type McOptions = {
  paths: number
  seed: number
  candidates: number[]
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

function shards(paths: number, n: number): [number, number][] {
  const size = Math.ceil(paths / n)
  const out: [number, number][] = []
  for (let s = 0; s < paths; s += size) out.push([s, Math.min(paths, s + size)])
  return out
}

export async function runMonteCarlo(
  pool: WorkerPool,
  file: HouseholdFile,
  scenarioId: string,
  o: McOptions,
): Promise<CandidateSamples[]> {
  const parts = shards(o.paths, pool.size * 2)
  const done = new Array<number>(parts.length).fill(0)
  const results = await Promise.all(
    parts.map(([pathStart, pathEnd], i) =>
      pool.run(
        'mcShard',
        { file, scenarioId, seed: o.seed, pathStart, pathEnd, candidates: o.candidates },
        {
          signal: o.signal,
          onProgress: (d) => {
            done[i] = d
            o.onProgress?.(done.reduce((a, b) => a + b, 0) / o.paths)
          },
        },
      ),
    ),
  )
  return concatSamples(results)
}

export type Detail = {
  years: number
  paths: number
  liquid: Float32Array
  byAccount: Float32Array
  terminal: Float64Array
  /** Index of the path with the median terminal wealth, and its full year rows. */
  medianPath: number
  medianRows: YearRow[]
}

export async function runDetail(
  pool: WorkerPool,
  file: HouseholdFile,
  scenarioId: string,
  claim: number,
  o: Omit<McOptions, 'candidates'>,
): Promise<Detail> {
  const parts = shards(o.paths, pool.size * 2)
  const results: DetailShard[] = await Promise.all(
    parts.map(([pathStart, pathEnd]) =>
      pool.run('mcDetail', { file, scenarioId, seed: o.seed, pathStart, pathEnd, claim }, { signal: o.signal }),
    ),
  )
  const years = results[0]?.years ?? 0
  const nAcc = results[0] && years > 0 ? results[0].byAccount.length / results[0].liquid.length : 0
  const liquid = new Float32Array(o.paths * years)
  const byAccount = new Float32Array(o.paths * years * nAcc)
  const terminal = new Float64Array(o.paths)
  let off = 0
  for (const r of results) {
    liquid.set(r.liquid, off * years)
    byAccount.set(r.byAccount, off * years * nAcc)
    terminal.set(r.terminal, off)
    off += r.terminal.length
  }
  const order = Array.from(terminal.keys()).sort((a, b) => terminal[a]! - terminal[b]!)
  const medianPath = order[Math.floor(order.length / 2)] ?? 0
  const medianRows = await pool.run(
    'pathRows',
    { file, scenarioId, seed: o.seed, path: medianPath, claim },
    { signal: o.signal },
  )
  return { years, paths: o.paths, liquid, byAccount, terminal, medianPath, medianRows }
}
