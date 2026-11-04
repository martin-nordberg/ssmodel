import { describe, expect, test } from 'bun:test'
import { ssaRules } from '@/engine/rules/tables.ts'
import {
  bendPoints,
  colaWithFallback,
  PiaCalculator,
  piaFromAime,
  projectedAwi,
  statementCrossCheck,
  taxableMax,
  truncDime,
} from '@/engine/ss/pia.ts'

const awi = projectedAwi(0.04)
const cola = colaWithFallback(() => 0.025)

// Earnings equal to the AWI every year 1983-2022 for someone born 1961-05-14 (eligible 2023, indexed to 2021).
const awiEarner = {
  birthDate: '1961-05-14',
  record: Array.from({ length: 40 }, (_, i) => ({ year: 1983 + i, amount: ssaRules.awi(1983 + i)! })),
  projected: [],
}

describe('PIA formula pieces', () => {
  test('truncDime', () => {
    expect(truncDime(2336.7576)).toBe(2336.7)
    expect(truncDime(900)).toBe(900)
  })
  test('bend points from AWI match published values', () => {
    expect(bendPoints(2023, awi)).toEqual([1115, 6721])
    expect(bendPoints(2027, awi)).toEqual([1340, 8077])
  })
  test('piaFromAime (90/32/15 with 2023 bend points)', () => {
    expect(piaFromAime(1000, [1115, 6721])).toBe(900)
    // 0.9*1115 + 0.32*(6721-1115) + 0.15*(10000-6721) = 1003.5 + 1793.92 + 491.85
    expect(piaFromAime(10000, [1115, 6721])).toBe(3289.2)
  })
  test('projected taxable maximum grows from the 2027 value', () => {
    expect(taxableMax(2027, awi)).toBe(192300)
    expect(taxableMax(2028, awi)).toBeGreaterThan(192300)
    expect(taxableMax(2028, awi) % 300).toBe(0)
  })
})

describe('PiaCalculator', () => {
  const calc = new PiaCalculator(awiEarner, awi)

  test('eligibility and indexing years', () => {
    expect(calc.eligibilityYear).toBe(2023)
    expect(calc.indexingYear).toBe(2021)
  })

  test('hand-computed AIME and PIA', () => {
    // Top 35: 2022 at face (63,795.13) + 34 years worth AWI(2021) = 60,575.07 each.
    // (63,795.13 + 34 * 60,575.07) / 420 = 5,055.59 -> 5,055
    expect(calc.aime(2022)).toBe(5055)
    // 0.9*1115 + 0.32*(5055-1115) = 1003.5 + 1260.8
    expect(calc.basePia(2022)).toBe(2264.3)
  })

  test('COLAs from December of the eligibility year, truncated each step', () => {
    // 2264.3 *1.032 = 2336.7 ; *1.025 = 2395.1 ; *1.028 = 2462.1 ; *1.036 = 2550.7
    expect(calc.piaInYear(2024, cola)).toBe(2336.7)
    expect(calc.piaInYear(2026, cola)).toBe(2462.1)
    expect(calc.piaInYear(2027, cola)).toBe(2550.7)
  })

  test('fewer than 35 years: missing years count as zero', () => {
    const short = new PiaCalculator({ ...awiEarner, record: awiEarner.record.slice(-10) }, awi)
    // 2022 at face + 9 years of 60,575.07 (2013-2021), divided by 420.
    expect(short.aime(2022)).toBe(Math.floor((63795.13 + 9 * 60575.07) / 420))
  })

  test('later earnings that replace a low year raise the PIA the next year', () => {
    const working = new PiaCalculator(
      { ...awiEarner, projected: [{ year: 2026, wages: 150000, selfEmployment: 0 }] },
      awi,
    )
    expect(working.piaInYear(2026, cola)).toBe(calc.piaInYear(2026, cola))
    expect(working.piaInYear(2027, cola)).toBeGreaterThan(calc.piaInYear(2027, cola))
  })

  test('self-employment counts at 92.35%', () => {
    const se = new PiaCalculator(
      { ...awiEarner, record: [], projected: [{ year: 2022, wages: 0, selfEmployment: 100000 }] },
      awi,
    )
    expect(se.aime(2022)).toBe(Math.floor(92350 / 420))
  })

  test('earnings above the taxable maximum are capped', () => {
    const big = new PiaCalculator(
      { birthDate: '1961-05-14', record: [{ year: 2022, amount: 1e6 }], projected: [] },
      awi,
    )
    expect(big.aime(2022)).toBe(Math.floor(147000 / 420))
  })
})

describe('statementCrossCheck', () => {
  test('matches a statement computed the same way', () => {
    const calc = new PiaCalculator(awiEarner, awi)
    // The record ends in 2022; the statement assumes 2022 earnings continue through 2027 (the year before FRA 2028).
    const continued = new PiaCalculator(
      {
        ...awiEarner,
        record: [
          ...awiEarner.record,
          ...[2023, 2024, 2025, 2026, 2027].map((year) => ({ year, amount: awiEarner.record.at(-1)!.amount })),
        ],
      },
      awi,
    )
    let expected = continued.basePia(2027)
    for (const y of [2024, 2025, 2026]) expected = truncDime(expected * (1 + ssaRules.cola(y)!))
    const r = statementCrossCheck(awiEarner, expected, 2026, awi)
    expect(r.computed).toBe(expected)
    expect(r.warn).toBe(false)
    expect(calc.basePia(2022)).toBeLessThan(r.computed)
    expect(statementCrossCheck(awiEarner, expected * 1.05, 2026, awi).warn).toBe(true)
  })
})
