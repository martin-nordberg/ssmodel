// Monte Carlo golden summaries [NFR-TEST-2]: fixed seed, fixed paths. Regenerate deliberately with UPDATE_GOLDEN=1.
import { expect, test } from 'bun:test'
import { prepare } from '@/engine/model/prepare.ts'
import { candidateMetrics } from '@/engine/recommend/metrics.ts'
import { recommend } from '@/engine/recommend/recommend.ts'
import { runShard } from '@/engine/sim/monteCarlo.ts'
import { parseHouseholdYaml } from '@/schema/yamlio.ts'

const round = (x: unknown): unknown =>
  typeof x === 'number'
    ? Math.round(x * 100) / 100
    : Array.isArray(x)
      ? x.map(round)
      : x && typeof x === 'object'
        ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, round(v)]))
        : x

test('golden: full fixture, 200 paths, seed 20270101', async () => {
  const r = parseHouseholdYaml(await Bun.file(new URL('../../fixtures/full.yaml', import.meta.url)).text())
  if (!r.ok) throw new Error('fixture')
  const prep = prepare(r.value)
  const samples = runShard(prep, { seed: 20270101, pathStart: 0, pathEnd: 200, candidates: prep.candidates })
  const metrics = samples.map(candidateMetrics)
  const rec = recommend(metrics, { ...prep.scenario.objective, bequestTarget: prep.scenario.expenses.bequestTarget })
  const json = `${JSON.stringify(round({ recommendation: rec?.best.claim, runnerUp: rec?.runnerUp, metrics }), null, 1)}\n`
  const file = Bun.file(new URL('../../fixtures/golden/full-mc-200.json', import.meta.url))
  if (process.env.UPDATE_GOLDEN || !(await file.exists())) await Bun.write(file, json)
  else expect(json).toBe(await file.text())
})
