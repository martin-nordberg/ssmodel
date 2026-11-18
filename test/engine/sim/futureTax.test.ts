import { expect, test } from 'bun:test'
import { prepare } from '@/engine/model/prepare.ts'
import { runDeterministic } from '@/engine/sim/deterministic.ts'
import type { HouseholdFile } from '@/schema/model.ts'
import { parseHouseholdYaml } from '@/schema/yamlio.ts'

// FR-TAX-7: user assumptions for higher future federal tax (a rate add-on from a start year, and brackets indexed
// below inflation). Defaults are current law (requirements 3.7).
const base = await (async () => {
  const r = parseHouseholdYaml(await Bun.file(new URL('../../fixtures/full.yaml', import.meta.url)).text())
  if (!r.ok) throw new Error('fixture')
  return r.value
})()

function run(edit: (f: HouseholdFile) => void) {
  const f = structuredClone(base)
  const s = f.scenarios[0]!
  s.assumptions.mortality.mode = 'fixed'
  // Fixed withdrawal order and no conversions, so higher rates show up as higher tax rather than a new plan.
  s.strategy.withdrawal = 'conventional'
  s.strategy.rothConversions.enabled = false
  edit(f)
  const p = prepare(f)
  return runDeterministic(p, p.people[0].age.fraMonth)
}

test('defaults are current law', () => {
  const s = structuredClone(base).scenarios[0]!.assumptions.futureTax
  expect(s).toEqual({ rateIncrease: 0, fromYear: 2030, indexingGap: 0 })
})

test('a rate increase raises federal tax from its start year and not before', () => {
  const cur = run(() => {})
  const up = run((f) => {
    f.scenarios[0]!.assumptions.futureTax = { rateIncrease: 0.05, fromYear: 2032, indexingGap: 0 }
  })
  const byYear = (r: typeof cur, y: number) => r.rows!.find((x) => x.year === y)!
  expect(byYear(up, 2031).federalTax).toBeCloseTo(byYear(cur, 2031).federalTax, 6)
  const later = up.rows!.filter((r) => r.year >= 2032 && r.taxableIncome > 0)
  expect(later.length).toBeGreaterThan(0)
  for (const r of later) expect(r.federalTax).toBeGreaterThan(byYear(cur, r.year).federalTax)
  expect(up.summary.lifetimeTaxReal).toBeGreaterThan(cur.summary.lifetimeTaxReal)
})

test('Roth conversions still stop at the top of the named bracket when rates are raised', () => {
  const conv = (rateIncrease: number) =>
    run((f) => {
      const s = f.scenarios[0]!
      s.strategy.rothConversions = { ...s.strategy.rothConversions, enabled: true, upToBracket: 0.22 }
      s.assumptions.futureTax = { rateIncrease, fromYear: 2027, indexingGap: 0 }
    }).rows!
  // Same bracket boundary, so conversions leave taxable income at about the same level. Matching the shifted 25%
  // rate against "22%" would find no bracket, an unlimited top, and convert the whole IRA in the first year.
  const a = conv(0)
  const b = conv(0.03)
  const maxTi = (rows: typeof a) => Math.max(...rows.filter((r) => r.year <= 2035).map((r) => r.taxableIncome))
  expect(Math.abs(maxTi(b) - maxTi(a))).toBeLessThan(0.1 * maxTi(a))
})

test('an indexing gap raises federal tax more each year (bracket creep)', () => {
  const cur = run(() => {})
  const creep = run((f) => {
    f.scenarios[0]!.assumptions.futureTax.indexingGap = 0.01
  })
  // The base year (2027) is already past the 2026 table, so the gap bites from the first year and grows.
  const extra = creep.rows!.map((r, i) => r.federalTax - cur.rows![i]!.federalTax)
  expect(extra[0]!).toBeGreaterThanOrEqual(0)
  expect(extra[10]!).toBeGreaterThan(extra[0]!)
  expect(creep.summary.lifetimeTaxReal).toBeGreaterThan(cur.summary.lifetimeTaxReal)
})
