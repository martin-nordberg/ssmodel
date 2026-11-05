import { expect, test } from 'bun:test'
import { prepare } from '@/engine/model/prepare.ts'
import { runDeterministic } from '@/engine/sim/deterministic.ts'
import { collectWarnings } from '@/engine/warnings/warnings.ts'
import type { HouseholdFile } from '@/schema/model.ts'
import { parseHouseholdYaml } from '@/schema/yamlio.ts'

// FR-TAX-6: the path itemizes when property tax, mortgage interest, SC tax and medical costs beat the standard
// deduction, and the deduction lowers federal tax.
const base = await (async () => {
  const r = parseHouseholdYaml(await Bun.file(new URL('../../fixtures/full.yaml', import.meta.url)).text())
  if (!r.ok) throw new Error('fixture')
  return r.value
})()

function run(edit: (f: HouseholdFile) => void) {
  const f = structuredClone(base)
  const s = f.scenarios[0]!
  s.assumptions.mortality.mode = 'fixed'
  s.strategy.rothConversions.enabled = false
  s.home!.sale.mode = 'none'
  edit(f)
  const p = prepare(f)
  return runDeterministic(p, p.people[0].age.fraMonth).rows!
}

test('the full fixture takes the standard deduction', () => {
  expect(run(() => {}).every((r) => !r.itemizing)).toBe(true)
})

test('a large property tax and mortgage make it itemize; more property tax raises the deduction', () => {
  const big = (propertyTax: number) =>
    run((f) => {
      const h = f.scenarios[0]!.home!
      h.costs.propertyTax = propertyTax
      h.mortgage = { balance: 600_000, asOf: '2026-12', rate: 0.07, payoff: '2056-12' }
    })
  const rows = big(20_000)
  const r = rows[1]!
  expect(r.itemizing).toBe(true)
  // Interest alone is about $41,700 in 2028; SALT adds property tax plus SC tax (under the $40,804 cap).
  expect(r.deduction).toBeGreaterThan(41_000 + 20_000)
  const more = big(25_000)[1]!
  expect(more.deduction).toBeGreaterThan(r.deduction + 4_000)
})

test('expense items marked medical count above 7.5% of AGI', () => {
  const rows = run((f) => {
    f.scenarios[0]!.expenses.items.push({
      label: 'Long-term care',
      annual: 90_000,
      start: '2028-01',
      indexing: 'inflation',
      oneTime: false,
      perPerson: false,
      deductible: 'medical',
    })
  })
  const r = rows.find((x) => x.year === 2028)!
  expect(r.itemizing).toBe(true)
  expect(r.deduction).toBeGreaterThan(90_000 - 0.075 * r.agi)
  const p = prepare(structuredClone(base))
  const notes = collectWarnings(p, rows, null, undefined).map((w) => w.text)
  expect(notes.some((t) => /^Itemizes deductions in \d+ year\(s\), first in 2028/.test(t))).toBe(true)
})

test('the withdrawal solver still balances cash flow across the standard/itemized switch', () => {
  // Medical costs near the switch point: some years itemize, some do not.
  for (const annual of [20_000, 28_000, 36_000]) {
    const rows = run((f) => {
      f.scenarios[0]!.expenses.items.push({
        label: 'Medical',
        annual,
        start: '2027-01',
        indexing: 'medical',
        oneTime: false,
        perPerson: false,
        deductible: 'medical',
      })
    })
    for (const row of rows) {
      const inflows = row.ss[0] + row.ss[1] + row.earnings + row.otherIncome + row.required.reduce((a, b) => a + b, 0)
      const drawn = row.withdrawals.reduce((a, b) => a + b, 0)
      const out = row.expenses + row.healthcare + row.surplus - row.shortfall
      expect(Math.abs(inflows + drawn - row.totalTax - out)).toBeLessThan(3)
    }
  }
})
