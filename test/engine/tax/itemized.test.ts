import { describe, expect, test } from 'bun:test'
import { makeMortgage, mortgageBalance, mortgageInterestInYear } from '@/engine/accounts/mortgage.ts'
import { parseYM } from '@/engine/core/dates.ts'
import { federalRules } from '@/engine/rules/tables.ts'
import { emptyFederalInput, federalTax } from '@/engine/tax/federal.ts'
import { deductibleInterestShare, itemizedDeduction, NO_ITEMIZED, saltCap } from '@/engine/tax/itemized.ts'

// P.L. 119-21 (OBBBA), IRC 164(b)(7): cap $40,400 in 2026 with the phase-down starting at $505,000 of MAGI,
// 30% of the excess, floor $10,000; 1% a year more through 2029; $10,000 from 2030.
describe('SALT cap', () => {
  test('by year', () => {
    expect(saltCap(2026, 200_000)).toBe(40_400)
    expect(saltCap(2029, 200_000)).toBe(41_624)
    expect(saltCap(2030, 200_000)).toBe(10_000)
  })
  test('phase-down above the MAGI threshold, not below the floor', () => {
    expect(saltCap(2026, 600_000)).toBeCloseTo(40_400 - 0.3 * 95_000, 6)
    expect(saltCap(2026, 700_000)).toBe(10_000)
  })
})

describe('itemizedDeduction', () => {
  const top = federalRules.params(2026).value.brackets.mfj.at(-1)![0]
  test('medical over 7.5% of AGI, charity over 0.5% of AGI (2026), SALT capped', () => {
    const r = itemizedDeduction(
      2026,
      100_000,
      100_000,
      30_000,
      { propertyTax: 15_000, mortgageInterest: 9_000, medical: 12_000, charity: 3_000 },
      top,
      0,
    )
    expect(r.salt).toBe(40_400)
    expect(r.medical).toBeCloseTo(4_500, 6)
    expect(r.charity).toBeCloseTo(2_500, 6)
    expect(r.limitation).toBe(0)
    expect(r.total).toBeCloseTo(40_400 + 9_000 + 4_500 + 2_500, 6)
  })
  test('no charitable floor before 2026', () => {
    const r = itemizedDeduction(2025, 100_000, 100_000, 0, { ...NO_ITEMIZED, charity: 3_000 }, top, 0)
    expect(r.charity).toBe(3_000)
  })
  test('2/37 limitation in the 37% bracket (IRC 68 as amended)', () => {
    // Taxable income before the limitation + itemized = AGI − senior = 1,000,000; excess over the 37% start.
    const r = itemizedDeduction(2026, 1_000_000, 1_000_000, 0, { ...NO_ITEMIZED, mortgageInterest: 30_000 }, top, 0)
    expect(r.limitation).toBeCloseTo((2 / 37) * Math.min(30_000, 1_000_000 - top), 6)
    expect(r.total).toBeCloseTo(30_000 * (1 - 2 / 37), 6)
  })
})

describe('federal deduction: larger of standard and itemized', () => {
  const base = { ...emptyFederalInput(2026, 'mfj' as const), count65: 2, ordinary: 150_000 }
  test('standard wins with no itemizable amounts', () => {
    const r = federalTax(base)
    expect(r.itemizing).toBe(false)
    expect(r.deduction).toBe(32_200 + 2 * 1_650 + 2 * 6_000)
  })
  test('itemized wins with large property tax and interest; the senior deduction still applies', () => {
    const r = federalTax({
      ...base,
      itemized: { ...NO_ITEMIZED, propertyTax: 12_000, mortgageInterest: 20_000 },
      stateIncomeTax: () => 6_000,
    })
    expect(r.itemizing).toBe(true)
    expect(r.itemized).toBe(38_000)
    expect(r.stateTax).toBe(6_000)
    expect(r.deduction).toBe(38_000 + 2 * 6_000)
    expect(r.taxableIncome).toBe(150_000 - 50_000)
  })
})

describe('mortgage interest', () => {
  const mg = makeMortgage(300_000, 0.06, parseYM('2026-12'), parseYM('2056-12'))
  test('interest equals payments less principal repaid', () => {
    const paid = 12 * mg.payment
    const principal = mortgageBalance(mg, parseYM('2026-12')) - mortgageBalance(mg, parseYM('2027-12'))
    expect(mortgageInterestInYear(mg, 2027, parseYM('2027-01'))).toBeCloseTo(paid - principal, 6)
  })
  test('only the first $750,000 of acquisition debt', () => {
    expect(deductibleInterestShare(500_000)).toBe(1)
    expect(deductibleInterestShare(1_000_000)).toBe(0.75)
  })
})
