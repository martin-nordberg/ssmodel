import { expect, test } from 'bun:test'
import { prepare } from '@/engine/model/prepare.ts'
import { runDeterministic } from '@/engine/sim/deterministic.ts'
import type { HouseholdFile } from '@/schema/model.ts'
import { parseHouseholdYaml } from '@/schema/yamlio.ts'

// An excluded income or expense row stays in the file but the model treats it as if it were not there.
const base = await (async () => {
  const r = parseHouseholdYaml(await Bun.file(new URL('../../fixtures/full.yaml', import.meta.url)).text())
  if (!r.ok) throw new Error('fixture')
  return r.value
})()

function rows(edit: (f: HouseholdFile) => void) {
  const f = structuredClone(base)
  const s = f.scenarios[0]!
  s.assumptions.mortality.mode = 'fixed'
  s.income.streams = [
    {
      label: 'Consulting',
      owner: 'joint',
      annual: 30_000,
      start: '2027-01',
      indexing: 'inflation',
      tax: 'ordinary',
      included: true,
    },
  ]
  edit(f)
  const p = prepare(f)
  return runDeterministic(p, p.people[0].age.fraMonth).rows!
}

test('rows in files without the field are included', () => {
  const s = base.scenarios[0]!
  expect(s.income.annuities.every((a) => a.included)).toBe(true)
  expect(s.expenses.items.every((e) => e.included)).toBe(true)
})

test('excluding a row matches deleting it', () => {
  // Each case: the array holding the row and the row's index.
  const cases: [string, (f: HouseholdFile) => { included: boolean }[], number][] = [
    ['annuity', (f) => f.scenarios[0]!.income.annuities, 0],
    ['stream', (f) => f.scenarios[0]!.income.streams, 0],
    ['expense', (f) => f.scenarios[0]!.expenses.items, 1],
  ]
  const all = rows(() => {})
  for (const [name, list, i] of cases) {
    const excluded = rows((f) => {
      list(f)[i]!.included = false
    })
    expect(excluded, name).toEqual(rows((f) => list(f).splice(i, 1)))
    expect(excluded, name).not.toEqual(all)
  }
})
