import { describe, expect, test } from 'bun:test'
import { inheritedRequired, inheritedRules, inheritedScheduled } from '@/engine/accounts/inheritedIra.ts'
import { lifetimeRmd, requiredBeginningYear, rmdStartYear } from '@/engine/accounts/rmd.ts'
import { addToTaxable, sellTaxable } from '@/engine/accounts/taxable.ts'

describe('lifetime RMDs (Pub 590-B Table III)', () => {
  test('start year by birth year', () => {
    expect(rmdStartYear('1955-06-01')).toBe(2028) // age 73
    expect(rmdStartYear('1961-05-14')).toBe(2036) // age 75
    expect(requiredBeginningYear('1961-05-14')).toBe(2037)
  })
  test('none before the RMD age, then balance / divisor', () => {
    expect(lifetimeRmd('1961-05-14', 2035, 500000)).toBe(0)
    expect(lifetimeRmd('1961-05-14', 2036, 500000)).toBeCloseTo(500000 / 24.6, 6)
    expect(lifetimeRmd('1961-05-14', 2041, 300000)).toBeCloseTo(300000 / 20.2, 6) // age 80
  })
})

describe('inherited IRAs', () => {
  // Fixture case: owner born 1938, died April 2023 (after his RBD in 2012) -> annual RMDs plus 10-year rule.
  const spec = {
    flavor: 'traditional' as const,
    decedentBirthDate: '1938-07-01',
    decedentDeathDate: '2023-04-15',
    beneficiaryBirthDate: '1963-02-02',
    beneficiaryClass: 'designated' as const,
  }
  const r = inheritedRules(spec)

  test('derived deadline, RMD status and divisor', () => {
    expect(r.deadlineYear).toBe(2033)
    expect(r.annualRmd).toBe(true)
    expect(r.firstRmdYear).toBe(2024)
    // Beneficiary is 61 in 2024: Single Life 26.2. Owner was 85 in 2023: 8.1 - 1 = 7.1. Use the longer.
    expect(r.initialDivisor).toBe(26.2)
  })

  test('annual RMDs reduce the divisor by 1 a year, full balance in the deadline year', () => {
    expect(inheritedRequired(r, 2027, 220000)).toBeCloseTo(220000 / (26.2 - 3), 6)
    expect(inheritedRequired(r, 2033, 50000)).toBe(50000)
  })

  test('Even schedule spreads over the remaining years', () => {
    // 2027 through 2033 is 7 years.
    expect(inheritedScheduled(r, 'even', 2027, 210000)).toBeCloseTo(30000, 6)
    expect(inheritedScheduled(r, 'back_loaded', 2027, 210000)).toBeCloseTo(210000 / 23.2, 6)
  })

  test('owner died before RBD: no annual RMDs, only the deadline', () => {
    const early = inheritedRules({ ...spec, decedentBirthDate: '1960-01-01', decedentDeathDate: '2025-06-01' })
    expect(early.annualRmd).toBe(false)
    expect(early.deadlineYear).toBe(2035)
    expect(inheritedRequired(early, 2030, 100000)).toBe(0)
    expect(inheritedRequired(early, 2035, 100000)).toBe(100000)
  })

  test('inherited Roth: no annual RMDs even after RBD', () => {
    const roth = inheritedRules({ ...spec, flavor: 'roth' })
    expect(roth.annualRmd).toBe(false)
    expect(roth.deadlineYear).toBe(2033)
  })

  test('eligible designated beneficiary: stretch, no deadline', () => {
    const edb = inheritedRules({ ...spec, beneficiaryClass: 'eligible_designated' })
    expect(edb.deadlineYear).toBeNull()
    expect(inheritedRequired(edb, 2040, 100000)).toBeCloseTo(100000 / (26.2 - 16), 6)
  })
})

describe('taxable account basis', () => {
  test('sales realize proportional gain', () => {
    const s = { balance: 300000, basis: 210000 }
    const r = sellTaxable(s, 30000)
    expect(r.gain).toBeCloseTo(9000, 6)
    expect(s.balance).toBe(270000)
    expect(s.basis).toBeCloseTo(189000, 6)
  })
  test('cannot sell more than the balance', () => {
    const s = { balance: 1000, basis: 1000 }
    expect(sellTaxable(s, 5000)).toEqual({ sold: 1000, gain: 0 })
  })
  test('additions raise basis', () => {
    const s = { balance: 100, basis: 50 }
    addToTaxable(s, 100)
    expect(s).toEqual({ balance: 200, basis: 150 })
  })
})
