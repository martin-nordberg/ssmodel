import { describe, expect, test } from 'bun:test'
import { claimCandidates, dayBefore, formatYM, parseDate, parseYM, SsaAge, ym } from '@/engine/core/dates.ts'

describe('month arithmetic', () => {
  test('parse/format round trip', () => {
    expect(formatYM(parseYM('2027-01'))).toBe('2027-01')
    expect(parseYM('2027-12') - parseYM('2027-01')).toBe(11)
  })
  test('day before handles month and year edges', () => {
    expect(dayBefore(parseDate('1961-01-01'))).toEqual({ year: 1960, month: 12, day: 31 })
    expect(dayBefore(parseDate('1960-03-01'))).toEqual({ year: 1960, month: 2, day: 29 })
    expect(dayBefore(parseDate('1961-05-14'))).toEqual({ year: 1961, month: 5, day: 13 })
  })
})

// SSA: you are eligible in the first month you are 62 throughout; most people therefore start at 62 and 1 month.
// https://www.ssa.gov/benefits/retirement/planner/agereduction.html
describe('SsaAge', () => {
  test('mid-month birthday: first eligible 62y1m, FRA in the birthday month', () => {
    const a = new SsaAge('1961-05-14')
    expect(formatYM(a.firstEligible)).toBe('2023-06')
    expect(formatYM(a.fraMonth)).toBe('2028-05')
    expect(formatYM(a.age70Month)).toBe('2031-05')
    expect(a.fraMonth - a.firstEligible).toBe(59)
  })
  test('born on the 2nd: eligible in the birthday month', () => {
    const a = new SsaAge('1961-05-02')
    expect(formatYM(a.firstEligible)).toBe('2023-05')
    expect(a.fraMonth - a.firstEligible).toBe(60)
  })
  test('born January 1st: uses the prior year for FRA and attains ages in December', () => {
    const a = new SsaAge('1960-01-01')
    expect(a.fraMonths).toBe(66 * 12 + 10) // 1959 table row
    expect(formatYM(a.firstEligible)).toBe('2022-01')
    expect(formatYM(a.fraMonth)).toBe('2026-10')
  })
  test('FRA for 1957 is 66 and 6 months', () => {
    expect(new SsaAge('1957-08-20').fraMonths).toBe(66 * 12 + 6)
  })
})

describe('claimCandidates', () => {
  test('young enough for the full grid', () => {
    const a = new SsaAge('1966-05-14')
    const c = claimCandidates(a, ym(2027, 1))
    expect(c.length).toBe(33)
    expect(formatYM(c[0]!)).toBe('2028-06') // 62y1m, first eligible
    expect(formatYM(c[1]!)).toBe('2028-08') // 62y3m
    expect(c).toContain(a.fraMonth)
    expect(formatYM(c.at(-1)!)).toBe('2036-05')
  })
  test('drops candidates before the base date', () => {
    const a = new SsaAge('1961-05-14')
    const c = claimCandidates(a, ym(2027, 1))
    expect(formatYM(c[0]!)).toBe('2027-02') // 65y9m
    expect(formatYM(c.at(-1)!)).toBe('2031-05')
    expect(c.length).toBe(18)
  })
})
