import { describe, expect, test } from 'bun:test'
import { scRules } from '@/engine/rules/tables.ts'
import { scIncomeAdjustedDeduction, scTax } from '@/engine/tax/sc.ts'

const sciad = scRules.params(2026).value.sciad

describe('SC income adjusted deduction (Act 110)', () => {
  test('full below $80k MFJ', () => expect(scIncomeAdjustedDeduction(80000, 'mfj', sciad)).toBe(30000))
  test('phase-out fraction over $110k denominator, rounded to $10', () => {
    // (100,000 - 80,000) / 110,000 = 0.181818 -> reduction 5,454.5 -> 5,450
    expect(scIncomeAdjustedDeduction(100000, 'mfj', sciad)).toBe(24550)
  })
  test('none at or above $190k MFJ', () => expect(scIncomeAdjustedDeduction(190000, 'mfj', sciad)).toBe(0))
  test('single thresholds', () => expect(scIncomeAdjustedDeduction(40000, 'single', sciad)).toBe(15000))
})

describe('scTax', () => {
  test('retirees: SS exempt, retirement and age-65 deductions', () => {
    // AGI 137,500 includes 42,500 taxable SS. Each spouse 65+: retirement income 40,000 -> 10,000 deduction,
    // plus 15,000 - 10,000 = 5,000 age-65 deduction. Capital gain 10,000 -> 4,400.
    // Subtractions 42,500 + 4,400 + 2*15,000 = 76,900. SCIAD: (137,500-80,000)/110,000 -> 15,681.8 -> 15,680
    // reduction -> 14,320. Taxable 137,500 - 76,900 - 14,320 = 46,280 -> 5.21% * 46,280 - 966 = 1,445.19.
    const r = scTax({
      year: 2026,
      status: 'mfj',
      priceFactor: 1,
      federalAgi: 137500,
      taxableSocialSecurity: 42500,
      ltcg: 10000,
      people: [
        { retirementIncome: 40000, is65: true },
        { retirementIncome: 40000, is65: true },
      ],
    })
    expect(r.subtractions).toBe(76900)
    expect(r.sciad).toBe(14320)
    expect(r.taxableIncome).toBe(46280)
    expect(r.tax).toBeCloseTo(1445.188, 3)
  })

  test('under 65: $3,000 retirement deduction, no age-65 deduction', () => {
    const r = scTax({
      year: 2026,
      status: 'single',
      priceFactor: 1,
      federalAgi: 30000,
      taxableSocialSecurity: 0,
      ltcg: 0,
      people: [{ retirementIncome: 20000, is65: false }],
    })
    // 30,000 - 3,000 - 15,000 = 12,000 * 1.99% = 238.80
    expect(r.tax).toBeCloseTo(238.8, 6)
  })

  test('the age-65 deduction applies even without retirement income', () => {
    const r = scTax({
      year: 2026,
      status: 'mfj',
      priceFactor: 1,
      federalAgi: 60000,
      taxableSocialSecurity: 0,
      ltcg: 0,
      people: [
        { retirementIncome: 0, is65: true },
        { retirementIncome: 0, is65: false },
      ],
    })
    // 60,000 - 15,000 - 30,000 = 15,000 * 1.99%
    expect(r.taxableIncome).toBe(15000)
    expect(r.tax).toBeCloseTo(298.5, 6)
  })
})
