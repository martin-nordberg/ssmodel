// Performance harness (open with ?harness=mc): runs the full fixture's Monte Carlo in the browser pool and
// reports timing. Used to measure NFR-SIM-1 in Chromium.
import { useEffect, useState } from 'react'
import { prepare } from '@/engine/model/prepare.ts'
import { parseHouseholdYaml } from '@/schema/yamlio.ts'
import { getPool } from '@/worker/browserPool.ts'
import { runMonteCarlo } from '@/worker/monteCarloClient.ts'
import { WorkerPool } from '@/worker/pool.ts'
import fixture from '../../test/fixtures/full.yaml?raw'

export function McHarness() {
  const [out, setOut] = useState('running')
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const paths = Number(params.get('paths') ?? 5000)
    const r = parseHouseholdYaml(fixture)
    if (!r.ok) return setOut('fixture error')
    const prep = prepare(r.value)
    const workers = params.get('workers')
    const pool = workers
      ? new WorkerPool(
          () => new Worker(new URL('../worker/engine.worker.ts', import.meta.url), { type: 'module' }),
          Number(workers),
        )
      : getPool()
    void (async () => {
      await Promise.all(Array.from({ length: pool.size }, () => pool.run('ping', { value: 1 })))
      const t0 = performance.now()
      await runMonteCarlo(pool, r.value, 'base', { paths, seed: 1, candidates: prep.candidates })
      const s = (performance.now() - t0) / 1000
      setOut(
        JSON.stringify({
          workers: pool.size,
          candidates: prep.candidates.length,
          paths,
          seconds: Number(s.toFixed(2)),
        }),
      )
    })()
  }, [])
  return <pre data-testid="mc-result">{out}</pre>
}
