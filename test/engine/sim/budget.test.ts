import { expect, test } from 'bun:test'
import { prepare } from '@/engine/model/prepare.ts'
import { runDeterministic } from '@/engine/sim/deterministic.ts'
import { parseHouseholdYaml } from '@/schema/yamlio.ts'

// NFR-UI-2: the deterministic preview (prepare + one path) should take well under 50 ms.
test('deterministic preview within the drag budget', async () => {
  const r = parseHouseholdYaml(await Bun.file(new URL('../../fixtures/full.yaml', import.meta.url)).text())
  if (!r.ok) throw new Error('fixture')
  for (let i = 0; i < 20; i++) runDeterministic(prepare(r.value), prepare(r.value).candidates[3]!)
  const t0 = performance.now()
  const n = 20
  for (let i = 0; i < n; i++) {
    const p = prepare(r.value)
    runDeterministic(p, p.candidates[3]!)
  }
  expect((performance.now() - t0) / n).toBeLessThan(50)
})
