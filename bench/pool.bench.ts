// T2.3: full Monte Carlo through the worker pool [NFR-SIM-1]. Usage: bun bench/pool.bench.ts [paths] [workers]
import { prepare } from '../src/engine/model/prepare.ts'
import { parseHouseholdYaml } from '../src/schema/yamlio.ts'
import { runMonteCarlo } from '../src/worker/monteCarloClient.ts'
import { WorkerPool } from '../src/worker/pool.ts'

const paths = Number(process.argv[2] ?? 5000)
const workers = Number(process.argv[3] ?? 7)
const r = parseHouseholdYaml(await Bun.file(new URL('../test/fixtures/full.yaml', import.meta.url)).text())
if (!r.ok) throw new Error('fixture')
const prep = prepare(r.value)
const pool = new WorkerPool(() => new Worker(new URL('../src/worker/engine.worker.ts', import.meta.url)), workers)
await pool.run('ping', { value: 1 })
const t0 = performance.now()
await runMonteCarlo(pool, r.value, 'base', { paths, seed: 1, candidates: prep.candidates })
const s = (performance.now() - t0) / 1000
pool.terminate()
console.log(
  JSON.stringify({
    candidates: prep.candidates.length,
    paths,
    workers,
    seconds: s.toFixed(2),
    projected33: ((s * 33) / prep.candidates.length).toFixed(2),
  }),
)
