import { expect, test } from 'bun:test'
import { prepare } from '@/engine/model/prepare.ts'
import { pathAtPercentile, pathRows, pathWithStory } from '@/engine/sim/monteCarlo.ts'
import { HouseholdFile } from '@/schema/model.ts'
import { parseHouseholdYaml } from '@/schema/yamlio.ts'

// FR-OUT-9: single paths at percentiles of after-tax estate, with a summary of what each path drew.
const base = await (async () => {
  const r = parseHouseholdYaml(await Bun.file(new URL('../../fixtures/full.yaml', import.meta.url)).text())
  if (!r.ok) throw new Error('fixture')
  return r.value
})()

test('pathAtPercentile ranks by terminal value; 50 is floor(n/2) as before', () => {
  const t = new Float64Array([50, 10, 40, 20, 30, 90, 70, 60, 80, 0])
  // Sorted: 0(9) 10(1) 20(3) 30(4) 40(2) 50(0) 60(7) 70(6) 80(8) 90(5)
  expect(pathAtPercentile(t, 50)).toBe(0)
  expect(pathAtPercentile(t, 10)).toBe(1)
  expect(pathAtPercentile(t, 90)).toBe(5)
  expect(pathAtPercentile(t, 100)).toBe(5)
  expect(pathAtPercentile(new Float64Array(), 50)).toBe(0)
})

test('the story matches the rows it describes', () => {
  const prep = prepare(base)
  const claim = prep.people[0].age.fraMonth
  const seed = prep.scenario.simulation.seed
  for (const path of [0, 7, 123]) {
    const { rows, story } = pathWithStory(prep, seed, path, claim)
    expect(rows).toEqual(pathRows(prep, seed, path, claim))
    // A person who dies is alive in the rows through the death year and not after it.
    for (const [i, d] of story.deaths.entries()) {
      if (!d) expect(rows.at(-1)!.alive[i] || rows.at(-1)!.year === prep.endYear).toBe(true)
      else expect(rows.some((r) => r.year > d.year && r.alive[i])).toBe(false)
    }
    const inh = rows.find((r) => (r.inheritances ?? 0) > 0)
    expect(story.inheritanceYear).toBe(inh?.year ?? null)
    expect(story.firstShortfallYear).toBe(rows.find((r) => r.shortfall > 0.5)?.year ?? null)
    expect(Math.abs(story.realReturn)).toBeLessThan(0.3)
  }
})

test('fixed mortality: death ages are the fixed ages; deterministic returns give the account real return', () => {
  const f = structuredClone(base)
  const s = f.scenarios[0]!
  s.assumptions.mortality = { ...s.assumptions.mortality, mode: 'fixed', deathAge: { primary: 85, spouse: 90 } }
  s.assumptions.returns.model = 'deterministic'
  s.inheritances = []
  s.home = undefined
  // One investment account, so the weighted return is that account's mean less its fee.
  s.accounts = [
    { type: 'traditional_ira', owner: 'primary', balance: 900_000, return: { mean: 0.06, sd: 0.1 } },
  ] as never
  s.strategy.rothConversions.enabled = false
  const prep = prepare(HouseholdFile.parse(f))
  const { story } = pathWithStory(prep, 1, 0, prep.people[0].age.fraMonth)
  expect(story.deaths.map((d) => d?.age)).toEqual([85, 90])
  const a = prep.accounts.find((x) => x.balance > 0)!
  const infl = s.assumptions.inflation.mean
  expect(story.realReturn).toBeCloseTo((1 + a.mean - a.fee) / (1 + infl) - 1, 3)
})
