import { describe, expect, test } from 'bun:test'
import { yearColumns } from '@/app/views/results/yearTable.ts'
import { explainValue, formatNote } from '@/engine/explain/explain.ts'
import type { YearTrace } from '@/engine/explain/trace.ts'
import { prepare } from '@/engine/model/prepare.ts'
import { runDeterministic } from '@/engine/sim/deterministic.ts'
import type { HouseholdFile } from '@/schema/model.ts'
import { parseHouseholdYaml } from '@/schema/yamlio.ts'

// FR-UI-14: every explained year-table value is the total of its breakdown, and additive sections add up.
const base = await (async () => {
  const r = parseHouseholdYaml(await Bun.file(new URL('../../fixtures/full.yaml', import.meta.url)).text())
  if (!r.ok) throw new Error('fixture')
  return r.value
})()

function traced(year: number, edit: (f: HouseholdFile) => void = () => {}) {
  const f = structuredClone(base)
  f.scenarios[0]!.assumptions.mortality.mode = 'fixed'
  edit(f)
  const p = prepare(f)
  const trace: YearTrace = { year }
  const rows = runDeterministic(p, p.people[0].age.fraMonth, true, trace).rows!
  return { prep: p, row: rows.find((r) => r.year === year)!, data: trace.data! }
}

function checkAll(year: number, edit?: (f: HouseholdFile) => void) {
  const { prep, row, data } = traced(year, edit)
  expect(data.year).toBe(year)
  let explained = 0
  for (const col of yearColumns(prep.accounts)) {
    const e = explainValue(data, col.id)
    if (!e) continue
    explained++
    const shown = col.value(row)
    const value = typeof shown === 'number' ? shown : e.value
    expect([col.id, e.value]).toEqual([col.id, expect.closeTo(value, 0)])
    const first = e.sections[0]!
    expect([col.id, first.total.value]).toEqual([col.id, expect.closeTo(e.value, 0)])
    for (const s of e.sections) {
      if (!s.additive) continue
      const sum = s.lines.reduce((a, l) => a + l.value, 0)
      expect([col.id, s.title, sum]).toEqual([col.id, s.title, expect.closeTo(s.total.value, 0)])
    }
  }
  return explained
}

describe('explain a number', () => {
  test('conversion year (2027): every explained column adds up', () => {
    expect(checkAll(2027)).toBeGreaterThan(20)
  })
  test('a later year with RMDs, inheritances and the lake cabin', () => {
    checkAll(2036)
  })
  test('an itemizing year', () => {
    checkAll(2028, (f) => {
      const h = f.scenarios[0]!.home!
      h.costs.propertyTax = 20_000
      h.mortgage = { balance: 600_000, asOf: '2026-12', rate: 0.07, payoff: '2056-12' }
    })
  })
  test('federal tax breakdown: brackets add to the row value and the deduction is explained', () => {
    const { row, data } = traced(2027)
    const e = explainValue(data, 'fed')!
    expect(e.value).toBeCloseTo(row.federalTax, 2)
    expect(e.sections.map((s) => s.title)).toEqual([
      'Federal income tax',
      'Taxable income',
      'Income → AGI',
      'Deduction',
      'Itemized deductions',
    ])
    expect(e.sections[0]!.lines.some((l) => l.label === 'Ordinary at 22%')).toBe(true)
  })
  test('a withdrawal from taxable includes the shares sold for conversion tax', () => {
    const { prep, data } = traced(2027)
    const taxable = prep.accounts.findIndex((a) => a.kind === 'taxable')
    const e = explainValue(data, `w${taxable}`)!
    expect(e.sections[0]!.lines.map((l) => l.label)).toContain('Sold to pay Roth conversion tax')
    expect(e.sections[1]!.title).toMatch(/^Cash flow/)
  })
  test('Console detail-strip totals', () => {
    const { row, data } = traced(2036)
    const values: Record<string, number> = {
      ss: row.ss[0] + row.ss[1],
      spend: row.expenses + row.healthcare,
      wd: row.withdrawals.reduce((a, b) => a + b, 0) + row.rmd + row.inheritedDistributions,
      tax: row.totalTax,
    }
    for (const [id, v] of Object.entries(values)) {
      const e = explainValue(data, id)!
      expect([id, e.value]).toEqual([id, expect.closeTo(v, 0)])
      expect([id, e.sections[0]!.total.value]).toEqual([id, expect.closeTo(v, 0)])
    }
  })
  test("dollar amounts in notes are formatted by the caller (today's or nominal dollars)", () => {
    const { data } = traced(2031)
    const fed = explainValue(data, 'fed')!
    const line = fed.sections[0]!.lines.find((l) => l.label === 'Ordinary at 10%')!
    const nominal = formatNote(line.note!, (x) => String(Math.round(x)))
    const real = formatNote(line.note!, (x) => String(Math.round(x / data.price)))
    expect(nominal).toMatch(/^on \d+$/)
    expect(Number(real.slice(3))).toBeLessThan(Number(nominal.slice(3)))
  })
  test('no trace for an unknown column', () => {
    expect(explainValue(traced(2027).data, 'year')).toBeNull()
  })
})
