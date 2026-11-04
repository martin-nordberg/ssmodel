// T2.3: real-engine Monte Carlo timing [NFR-SIM-1]. Usage: bun bench/monteCarlo.bench.ts [paths]
import { prepare } from '../src/engine/model/prepare.ts'
import { runShard } from '../src/engine/sim/monteCarlo.ts'
import { parseHouseholdYaml } from '../src/schema/yamlio.ts'

const paths = Number(process.argv[2] ?? 500)
const r = parseHouseholdYaml(await Bun.file(new URL('../test/fixtures/full.yaml', import.meta.url)).text())
if (!r.ok) throw new Error('fixture')
const prep = prepare(r.value)
const t0 = performance.now()
runShard(prep, { seed: 1, pathStart: 0, pathEnd: paths, candidates: prep.candidates })
const ms = performance.now() - t0
const perPathCandidate = ms / (paths * prep.candidates.length)
console.log(
  JSON.stringify({
    candidates: prep.candidates.length,
    paths,
    ms: Math.round(ms),
    msPerPathCandidate: perPathCandidate.toFixed(3),
    projected33x5000_7workers_s: ((perPathCandidate * 33 * 5000) / 7 / 1000).toFixed(1),
  }),
)
