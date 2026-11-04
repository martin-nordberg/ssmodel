import { describe, expect, test } from 'bun:test'
import { SsaAge } from '@/engine/core/dates.ts'
import { type CandidateMetrics, candidateMetrics, percentiles } from '@/engine/recommend/metrics.ts'
import { breakEvenAge, explain, recommend } from '@/engine/recommend/recommend.ts'
import type { CandidateSamples } from '@/engine/sim/monteCarlo.ts'

const m = (claim: number, successProb: number, p50: number, bequestProb = 1): CandidateMetrics => ({
  claim,
  paths: 100,
  successProb,
  bequestProb,
  terminal: { p10: p50 / 2, p25: p50 * 0.8, p50, p75: p50 * 1.2, p90: p50 * 1.5, mean: p50 },
  minLiquid: { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, mean: 0 },
  lifetimeSs: 0,
  pvSs: 0,
  lifetimeTax: 0,
  irmaa: 0,
  shortfall: 0,
})
const o = { successFloor: 0.9, bequestFloor: 0.5, runnerUpTolerance: 0.02, bequestTarget: 0 }

describe('percentiles', () => {
  test('linear interpolation', () => {
    const p = percentiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(p.p50).toBe(6)
    expect(p.p10).toBe(2)
    expect(p.mean).toBe(6)
  })
})

describe('recommend', () => {
  test('maximizes the median among candidates meeting the floor', () => {
    const r = recommend([m(1, 0.95, 100), m(2, 0.92, 120), m(3, 0.85, 200)], o)!
    expect(r.best.claim).toBe(2)
    expect(r.floorsMet).toBe(true)
    expect(r.qualifying).toEqual([1, 2])
  })
  test('runner-up range within tolerance', () => {
    const r = recommend([m(1, 0.95, 100), m(2, 0.95, 119), m(3, 0.95, 120), m(4, 0.95, 117.7)], o)!
    expect(r.runnerUp).toEqual([2, 3, 4])
  })
  test('falls back to the highest success probability', () => {
    const r = recommend([m(1, 0.7, 100), m(2, 0.8, 50), m(3, 0.6, 300)], o)!
    expect(r.best.claim).toBe(2)
    expect(r.floorsMet).toBe(false)
  })
  test('bequest floor applies when a target is set', () => {
    const r = recommend([m(1, 0.95, 100, 0.6), m(2, 0.95, 150, 0.4)], { ...o, bequestTarget: 200000 })!
    expect(r.best.claim).toBe(1)
  })
})

test('candidateMetrics from samples', () => {
  const s: CandidateSamples = {
    claim: 7,
    terminal: Float64Array.from([1, 2, 3, 4]),
    minLiquid: Float64Array.from([0, 0, 1, 1]),
    lifetimeSs: Float64Array.from([10, 10, 10, 10]),
    pvSs: Float64Array.from([5, 5, 5, 5]),
    lifetimeTax: Float64Array.from([1, 1, 1, 1]),
    irmaa: Float64Array.from([0, 0, 0, 0]),
    shortfall: Float64Array.from([0, 0, 0, 4]),
    depleted: Uint8Array.from([0, 0, 0, 1]),
    bequestMet: Uint8Array.from([1, 1, 0, 0]),
    lastYear: Uint16Array.from([2050, 2050, 2050, 2050]),
  }
  const c = candidateMetrics(s)
  expect(c.successProb).toBe(0.75)
  expect(c.bequestProb).toBe(0.5)
  expect(c.terminal.p50).toBe(2.5)
  expect(c.shortfall).toBe(1)
})

describe('break-even and explanation', () => {
  const age = new SsaAge('1966-05-02') // FRA 67, eligible at 62y0m
  test('70 vs 62 breaks even around age 80', () => {
    const be = breakEvenAge(age, 2000, age.attainMonth(62 * 12), age.attainMonth(70 * 12))!
    // 0.70*(m-0) = 1.24*(m-96) -> m = 220.4 months after 62 -> about 80y5m
    expect(Math.floor(be / 12)).toBe(80)
  })
  test('explanation mentions the best date and the survivor effect', () => {
    const fra = age.fraMonth
    const late = age.attainMonth(70 * 12)
    const r = recommend([m(fra, 0.95, 1_000_000), m(late, 0.96, 1_100_000)], o)!
    const lines = explain(
      r,
      [m(fra, 0.95, 1_000_000), m(late, 0.96, 1_100_000)],
      age,
      { fra },
      (x) => `$${Math.round(x / 1000)}k`,
    )
    expect(lines[0]).toContain('70y0m')
    expect(lines[0]).toContain('+$100k vs. claiming at full retirement age')
    expect(lines[1]).toContain('24% higher')
  })
})

import { coarseCandidates, refineCandidates } from '@/engine/recommend/grid.ts'

describe('coarse→fine grid', () => {
  const all = Array.from({ length: 33 }, (_, i) => 1000 + 3 * i)
  test('yearly points plus FRA and the last', () => {
    const c = coarseCandidates(all, 1060)
    expect(c[0]).toBe(1000)
    expect(c).toContain(1012)
    expect(c).toContain(1060)
    expect(c.at(-1)).toBe(1096)
    expect(c.length).toBe(9)
  })
  test('refinement fills the quarters within a year of the best', () => {
    const c = coarseCandidates(all, 1060)
    expect(refineCandidates(all, new Set(c), 1048)).toEqual([1039, 1042, 1045, 1051, 1054, 1057])
  })
  test('short lists are evaluated in full', () => expect(coarseCandidates(all.slice(0, 10), 1009)).toHaveLength(10))
})

import { accountMedians, fanSummary } from '@/engine/recommend/fan.ts'

test('fan summary percentiles per year, ignoring ended paths', () => {
  const paths = 20
  const years = 3
  const liquid = new Float32Array(paths * years)
  for (let p = 0; p < paths; p++) {
    liquid[p * years] = p
    liquid[p * years + 1] = p * 2
    liquid[p * years + 2] = p < 15 ? Number.NaN : 1
  }
  const f = fanSummary(liquid, paths, years, 2027)
  expect(f.length).toBe(2) // year 3 has only 5 live paths (< 10)
  expect(f[0]!.p50).toBe(9.5)
  expect(f[1]!.p90).toBeCloseTo(34.2, 6)
  const m = accountMedians(Float32Array.from([1, 10, 3, 30]), 2, 1, 2, 2027, 5)
  expect(m[0]).toEqual({ year: 2027, values: [2, 20] })
})

import { inheritanceNote } from '@/engine/recommend/recommend.ts'

test('inheritance note says whether the date changes', () => {
  const age = new SsaAge('1966-05-02')
  const a = recommend([m(age.fraMonth, 0.95, 100)], o)!
  const b = recommend([m(age.fraMonth + 12, 0.95, 100)], o)!
  expect(inheritanceNote(a, a, age)).toContain('the same')
  expect(inheritanceNote(a, b, age)).toContain('would be 68y0m')
})

import { sensitivityVariants } from '@/engine/recommend/sensitivity.ts'
import { Scenario } from '@/schema/model.ts'

test('sensitivity variants cover longevity, returns, trust fund and inheritances', () => {
  const s = Scenario.parse({
    id: 'x',
    name: 'x',
    inheritances: [{ label: 'm', heir: 'primary', decedentBirthDate: '1940-01-01' }],
  })
  const v = sensitivityVariants(s)
  expect(new Set(v.map((x) => x.factor))).toEqual(new Set(['Longevity', 'Returns', 'Trust fund', 'Inheritances']))
  const l75 = v.find((x) => x.label === 'Both live to 75')!.apply(s)
  expect(l75.assumptions.mortality).toMatchObject({ mode: 'fixed', deathAge: { primary: 75, spouse: 75 } })
  expect(v.find((x) => x.label === '+2% a year')!.apply(s).assumptions.returns.realReturnShift).toBeCloseTo(0.02, 10)
  expect(sensitivityVariants(Scenario.parse({ id: 'y', name: 'y' })).some((x) => x.factor === 'Inheritances')).toBe(
    false,
  )
})
