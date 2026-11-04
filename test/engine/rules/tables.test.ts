import { describe, expect, test } from 'bun:test'
import { federalRules, lifeTable, medicareRules, rmdRules, scRules, ssaRules } from '@/engine/rules/tables.ts'

const awi = (y: number) => ssaRules.awi(y)!

describe('SSA tables are internally consistent', () => {
  // Bend points are 180 and 1085 scaled by AWI[t-2]/AWI[1977], rounded to the dollar.
  // Published values: https://www.ssa.gov/oact/cola/bendpoints.html
  const published: Record<number, [number, number]> = {
    1979: [180, 1085],
    2000: [531, 3202],
    2010: [761, 4586],
    2020: [960, 5785],
    2021: [996, 6002],
    2022: [1024, 6172],
    2023: [1115, 6721],
    2024: [1174, 7078],
    2025: [1226, 7391],
    2026: [1286, 7749],
    2027: [1340, 8077],
  }
  for (const [year, [b1, b2]] of Object.entries(published)) {
    test(`bend points ${year}`, () => {
      const ratio = awi(Number(year) - 2) / awi(1977)
      expect(Math.round(180 * ratio)).toBe(b1)
      expect(Math.round(1085 * ratio)).toBe(b2)
    })
  }

  // After 1994 the taxable maximum is 60,600 x AWI[t-2]/AWI[1992], rounded to a multiple of $300, never decreasing,
  // and frozen in years with no COLA (2010, 2011, 2016).
  test('taxable maximum follows the AWI formula 1995-2027', () => {
    const noCola = new Set([2010, 2011, 2016])
    let prev = ssaRules.taxableMax(1994)!
    for (let y = 1995; y <= 2027; y++) {
      const formula = Math.round((60600 * awi(y - 2)) / awi(1992) / 300) * 300
      const computed = noCola.has(y) ? prev : Math.max(prev, formula)
      expect([y, ssaRules.taxableMax(y)]).toEqual([y, computed])
      prev = computed
    }
  })

  test('COLAs and earnings test', () => {
    expect(ssaRules.cola(2027)).toBe(0.036)
    expect(ssaRules.cola(2026)).toBe(0.028)
    expect(ssaRules.earningsTest(2027).value).toEqual({ underFra: 25560, fraYear: 67920 })
    const p = ssaRules.earningsTest(2029, 1.05)
    expect(p.projected).toBe(true)
    expect(p.value.underFra).toBeCloseTo(25560 * 1.05)
  })

  test('FRA by birth year', () => {
    expect(ssaRules.fraMonths(1954)).toBe(66 * 12)
    expect(ssaRules.fraMonths(1957)).toBe(66 * 12 + 6)
    expect(ssaRules.fraMonths(1961)).toBe(67 * 12)
  })
})

describe('federal tax tables', () => {
  test('2026 values from Rev. Proc. 2025-32', () => {
    const p = federalRules.params(2026).value
    expect(p.brackets.mfj[1]).toEqual([24800, 0.12])
    expect(p.standardDeduction).toEqual({ mfj: 32200, single: 16100 })
    expect(p.ltcg.mfj).toEqual([98900, 613700])
  })
  test('later years are projected', () => {
    const p = federalRules.params(2028, 1.1)
    expect(p.projected).toBe(true)
    expect(p.tableYear).toBe(2026)
    expect(p.value.standardDeduction.mfj).toBeCloseTo(35420)
  })
})

describe('other tables', () => {
  test('RMD ages and divisors (Pub 590-B)', () => {
    expect(rmdRules.rmdAge(1955)).toBe(73)
    expect(rmdRules.rmdAge(1961)).toBe(75)
    expect(rmdRules.uniformDivisor(73)).toBe(26.5)
    expect(rmdRules.uniformDivisor(75)).toBe(24.6)
    expect(rmdRules.singleLife(55)).toBe(31.6) // Pub 590-B worked example
    expect(rmdRules.singleLife(60)).toBe(27.1)
  })
  test('Medicare 2026', () => {
    const m = medicareRules.params(2026).value
    expect(m.partBStandardMonthly).toBe(202.9)
    expect(m.thresholds.mfj[0]).toBe(218000)
    expect(m.partBMonthlyTotal.length).toBe(m.thresholds.mfj.length + 1)
  })
  test('SC rate schedule is continuous at the bracket', () => {
    const r = scRules.params(2026).value.rates
    expect(r.lowRate * r.bracket).toBeCloseTo(r.highRate * r.bracket - r.highSubtract, 0)
    const p = scRules.params(2030, 1.2).value.rates
    expect(p.lowRate * p.bracket).toBeCloseTo(p.highRate * p.bracket - p.highSubtract, 0)
  })
  test('life table: e65 is plausible', () => {
    for (const [sex, lo, hi] of [
      ['male', 17, 18.5],
      ['female', 19.5, 21],
    ] as const) {
      const l = lifeTable.lx(sex)
      let sum = 0
      for (let a = 66; a < l.length; a++) sum += l[a]!
      const e65 = sum / l[65]! + 0.5
      expect(e65).toBeGreaterThan(lo)
      expect(e65).toBeLessThan(hi)
    }
  })
})
