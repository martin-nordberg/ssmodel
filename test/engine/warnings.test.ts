import { expect, test } from 'bun:test'
import { prepare } from '@/engine/model/prepare.ts'
import { runDeterministic } from '@/engine/sim/deterministic.ts'
import { collectWarnings } from '@/engine/warnings/warnings.ts'
import { parseHouseholdYaml } from '@/schema/yamlio.ts'

test('warnings: projected tables, forced inherited lump sum, statement mismatch', async () => {
  const r = parseHouseholdYaml(await Bun.file(new URL('../fixtures/full.yaml', import.meta.url)).text())
  if (!r.ok) throw new Error('fixture')
  const f = structuredClone(r.value)
  for (const a of f.scenarios[0]!.accounts) if (a.type === 'inherited_ira') a.schedule = 'back_loaded'
  f.scenarios[0]!.strategy.withdrawal = 'proportional'
  f.household.people.primary.ss.fraEstimateMonthly = 2000
  const p = prepare(f)
  const rows = runDeterministic(p, p.people[0].age.fraMonth).rows!
  const w = collectWarnings(p, rows, null, undefined).map((x) => x.text)
  expect(w.some((t) => t.startsWith('IRS tax brackets: published through 2026'))).toBe(true)
  expect(w.some((t) => t.includes('differs from the SSA statement'))).toBe(true)
  expect(w.some((t) => t.includes('10-year deadline'))).toBe(true)
})
