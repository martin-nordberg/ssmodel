import { describe, expect, test } from 'bun:test'
import { SsaAge } from '@/engine/core/dates.ts'
import { earningsTest } from '@/engine/ss/earningsTest.ts'
import { monthlyBenefit, ownBenefitFactor } from '@/engine/ss/ownBenefit.ts'

// Factors per https://www.ssa.gov/benefits/retirement/planner/agereduction.html
describe('ownBenefitFactor (FRA 67)', () => {
  const a = new SsaAge('1966-05-02') // born on the 2nd: eligible in the birthday month, FRA 67
  const at = (years: number, months = 0) => a.attainMonth(years * 12 + months)
  test('62: 70%', () => expect(ownBenefitFactor(at(62), a)).toBeCloseTo(0.7, 10))
  test('64y6m: 83.33%', () => expect(ownBenefitFactor(at(64, 6), a)).toBeCloseTo(1 - 30 * (5 / 900), 10))
  test('64: 80%', () => expect(ownBenefitFactor(at(64), a)).toBeCloseTo(0.8, 10))
  test('FRA: 100%', () => expect(ownBenefitFactor(at(67), a)).toBe(1))
  test('68: 108%', () => expect(ownBenefitFactor(at(68), a)).toBeCloseTo(1.08, 10))
  test('70: 124%, no credit after 70', () => {
    expect(ownBenefitFactor(at(70), a)).toBeCloseTo(1.24, 10)
    expect(ownBenefitFactor(at(71), a)).toBeCloseTo(1.24, 10)
  })
  test('withheld months stop counting as early at FRA', () => {
    // Claimed at 62 (60 months early) with 12 months withheld: recomputed as 48 months early = 75%.
    expect(ownBenefitFactor(at(62), a, 12)).toBeCloseTo(0.75, 10)
  })
})

test('mid-month birthday: earliest is 62y1m at 70.42%', () => {
  const a = new SsaAge('1966-05-14')
  expect(ownBenefitFactor(a.firstEligible, a)).toBeCloseTo(1 - 36 * (5 / 900) - 23 * (5 / 1200), 10)
})

test('FRA 66y6m (born 1957): 62 is 72.5%', () => {
  const a = new SsaAge('1957-08-02')
  expect(ownBenefitFactor(a.attainMonth(62 * 12), a)).toBeCloseTo(0.725, 10)
})

test('monthly benefit rounds down to the dollar', () => {
  expect(monthlyBenefit(2550.7, 0.7)).toBe(1785)
  expect(monthlyBenefit(2000, 1.24)).toBe(2480)
})

describe('earningsTest', () => {
  const limits = { underFra: 25560, fraYear: 67920 }
  test('before the FRA year: $1 per $2', () => {
    // SSA example shape: $20,000 over the limit -> $10,000 withheld -> 7 months of a $1,500 benefit.
    const r = earningsTest({
      annualEarnings: 45560,
      entitledMonthsBeforeFra: 12,
      fraYear: false,
      monthsBeforeFra: 12,
      limits,
      monthlyOnRecord: 1500,
    })
    expect(r.withholding).toBe(10000)
    expect(r.monthsWithheld).toBe(7)
  })
  test('FRA year: $1 per $3 on earnings before the FRA month', () => {
    const r = earningsTest({
      annualEarnings: 116880, // 77,920 earned in the 8 months before FRA
      entitledMonthsBeforeFra: 8,
      fraYear: true,
      monthsBeforeFra: 8,
      limits,
      monthlyOnRecord: 1500,
    })
    expect(r.excess).toBeCloseTo(10000, 6)
    expect(r.monthsWithheld).toBe(3)
  })
  test('withholding cannot exceed entitled months', () => {
    const r = earningsTest({
      annualEarnings: 200000,
      entitledMonthsBeforeFra: 4,
      fraYear: false,
      monthsBeforeFra: 12,
      limits,
      monthlyOnRecord: 1000,
    })
    expect(r.monthsWithheld).toBe(4)
  })
  test('no earnings, no withholding', () => {
    expect(
      earningsTest({
        annualEarnings: 0,
        entitledMonthsBeforeFra: 12,
        fraYear: false,
        monthsBeforeFra: 12,
        limits,
        monthlyOnRecord: 1000,
      }).monthsWithheld,
    ).toBe(0)
  })
})
