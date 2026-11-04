import { describe, expect, test } from 'bun:test'
import { federalRules } from '@/engine/rules/tables.ts'
import {
  bracketTax,
  bracketTop,
  emptyFederalInput,
  federalTax,
  seniorDeduction,
  taxableSocialSecurity,
} from '@/engine/tax/federal.ts'

const base = (over: Partial<ReturnType<typeof emptyFederalInput>> = {}) => ({
  ...emptyFederalInput(2026, 'mfj'),
  taxableMax: 184500,
  count65: 2,
  ...over,
})

describe('taxable Social Security (Pub 915 worksheet)', () => {
  test('below the first base', () => expect(taxableSocialSecurity(30000, 10000, 'mfj')).toBe(0))
  test('between bases: half the excess', () => {
    // PI = 20,000 + 18,000 = 38,000 -> 0.5 * (38,000 - 32,000) = 3,000
    expect(taxableSocialSecurity(36000, 20000, 'mfj')).toBe(3000)
  })
  test('above the second base', () => {
    // PI = 30,000 + 20,000 = 50,000 -> 0.85 * 6,000 + min(20,000, 6,000) = 11,100
    expect(taxableSocialSecurity(40000, 30000, 'mfj')).toBe(11100)
  })
  test('capped at 85%', () => expect(taxableSocialSecurity(40000, 200000, 'mfj')).toBe(34000))
  test('single thresholds', () => {
    // PI = 25,000 + 10,000 = 35,000 -> 0.85 * 1,000 + min(10,000, 4,500) = 5,350
    expect(taxableSocialSecurity(20000, 25000, 'single')).toBe(5350)
  })
})

describe('brackets', () => {
  const b = federalRules.params(2026).value.brackets.mfj
  test('bracketTax', () => {
    expect(bracketTax(24800, b)).toBeCloseTo(2480, 6)
    expect(bracketTax(100800, b)).toBeCloseTo(2480 + 0.12 * 76000, 6)
  })
  test('bracketTop', () => {
    expect(bracketTop(0.12, b)).toBe(100800)
    expect(bracketTop(0.37, b)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('senior deduction (2025-2028)', () => {
  test('full amount below the phase-out', () => expect(seniorDeduction(2026, 2, 100000, 'mfj')).toBe(12000))
  test('6% phase-out per person above $150k MFJ', () => expect(seniorDeduction(2026, 2, 200000, 'mfj')).toBe(6000))
  test('gone at $250k MFJ', () => expect(seniorDeduction(2026, 2, 250000, 'mfj')).toBe(0))
  test('expires after 2028', () => expect(seniorDeduction(2029, 2, 50000, 'mfj')).toBe(0))
})

describe('federalTax', () => {
  test('low-income retirees owe nothing', () => {
    // Taxable SS 11,100; AGI 41,100; deduction 32,200 + 2*1,650 + 12,000 = 47,500.
    const r = federalTax(base({ socialSecurity: 40000, ordinary: 30000 }))
    expect(r.taxableSocialSecurity).toBe(11100)
    expect(r.agi).toBe(41100)
    expect(r.deduction).toBe(47500)
    expect(r.total).toBe(0)
  })

  test('hand-computed: IRA, dividends and gains stacked on SS', () => {
    // PI = 95,000 + 25,000 = 120,000 -> taxable SS = min(42,500, 0.85*76,000 + 6,000) = 42,500
    // AGI 137,500; deduction 47,500; TI 90,000 = 75,000 ordinary + 15,000 preferential.
    // Ordinary tax: 2,480 + 0.12 * 50,200 = 8,504. Preferential income fits under the 0% top (98,900).
    const r = federalTax(base({ socialSecurity: 50000, ordinary: 80000, qualifiedDividends: 5000, ltcg: 10000 }))
    expect(r.taxableSocialSecurity).toBe(42500)
    expect(r.agi).toBe(137500)
    expect(r.taxableIncome).toBe(90000)
    expect(r.ordinaryTax).toBeCloseTo(8504, 6)
    expect(r.capitalGainsTax).toBe(0)
    expect(r.incomeTax).toBeCloseTo(8504, 6)
    expect(r.marginalRate).toBe(0.12)
  })

  test('gains straddling the 0% / 15% boundary', () => {
    // No SS, single 65+ count 0, MFJ: ordinary 100,000 + ltcg 50,000. Deduction 32,200.
    // TI 117,800: ordinary 67,800, gains 50,000; 0% band to 98,900 holds 31,100; 18,900 at 15% = 2,835.
    const r = federalTax(base({ count65: 0, ordinary: 100000, ltcg: 50000 }))
    expect(r.taxableIncome).toBe(117800)
    expect(r.capitalGainsTax).toBeCloseTo(2835, 6)
  })

  test('NIIT above $250k MAGI', () => {
    const r = federalTax(base({ count65: 0, ordinary: 300000, investmentOrdinary: 20000, ltcg: 30000 }))
    // MAGI 350,000; NII 50,000 -> min(50,000, 100,000) * 3.8% = 1,900
    expect(r.niit).toBeCloseTo(1900, 6)
  })

  test('self-employment tax and half deduction', () => {
    const r = federalTax(base({ count65: 0, seByPerson: [50000] }))
    // 50,000 * 0.9235 = 46,175 * 15.3% = 7,064.78; half is deductible.
    expect(r.payrollTax).toBeCloseTo(7064.775, 3)
    expect(r.agi).toBeCloseTo(50000 - 7064.775 / 2, 3)
  })

  test('FICA OASDI is capped at the taxable maximum per person', () => {
    const r = federalTax(base({ count65: 0, wagesByPerson: [200000, 50000] }))
    // 184,500*6.2% + 200,000*1.45% + 50,000*7.65% ; additional Medicare 0.9% over 250k = 0
    expect(r.payrollTax).toBeCloseTo(184500 * 0.062 + 200000 * 0.0145 + 50000 * 0.0765, 6)
  })

  test('projected year scales brackets and deductions', () => {
    const r = federalTax({ ...base({ count65: 0, ordinary: 100000 }), year: 2030, priceFactor: 1.1 })
    expect(r.deduction).toBeCloseTo(32200 * 1.1, 6)
  })
})
