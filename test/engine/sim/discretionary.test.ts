import { expect, test } from 'bun:test'
import { prepare } from '@/engine/model/prepare.ts'
import { runDeterministic } from '@/engine/sim/deterministic.ts'
import type { HouseholdFile } from '@/schema/model.ts'
import { parseHouseholdYaml } from '@/schema/yamlio.ts'

// Discretionary and nondiscretionary expenses each follow their own scale; healthcare and home costs follow neither.
const base = await (async () => {
  const r = parseHouseholdYaml(await Bun.file(new URL('../../fixtures/full.yaml', import.meta.url)).text())
  if (!r.ok) throw new Error('fixture')
  return r.value
})()

function row2027(need: number, want: number) {
  const f: HouseholdFile = structuredClone(base)
  const s = f.scenarios[0]!
  s.assumptions.mortality.mode = 'fixed'
  s.expenses.discretionary = [
    { label: 'Travel', annual: 20_000, start: '2027-01', indexing: 'inflation', oneTime: false, perPerson: false },
  ]
  s.assumptions.expenseScale = need
  s.assumptions.discretionaryScale = want
  const p = prepare(f)
  return runDeterministic(p, p.people[0].age.fraMonth).rows![0]!
}

test('each scale moves only its own expenses', () => {
  const r = row2027(1, 1)
  // 2027 nondiscretionary items: Living 72,000 (the roof is 2028); housing is unscaled.
  expect(row2027(1, 0.5).expenses).toBeCloseTo(r.expenses - 10_000, 6)
  expect(row2027(0.9, 1).expenses).toBeCloseTo(r.expenses - 7_200, 6)
  expect(row2027(0.9, 0.5).healthcare).toBeCloseTo(r.healthcare, 6)
  expect(row2027(0.9, 0.5).housing).toBeCloseTo(r.housing!, 6)
})
