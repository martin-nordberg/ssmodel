import { describe, expect, test } from 'bun:test'
import { earningsForYear, expenseForYear, incomeForYear, monthsActive } from '@/engine/cashflow/expenses.ts'
import { parseYM } from '@/engine/core/dates.ts'

const ctx = {
  baseYear: 2027,
  price: 1.05,
  medical: 1.08,
  survivorFrom: null,
  survivorFraction: 0.75,
  scale: 1,
  discretionaryScale: 1,
}

describe('monthsActive', () => {
  test('partial years', () => {
    expect(monthsActive(2031, parseYM('2027-01'), parseYM('2031-08'))).toBe(8)
    expect(monthsActive(2027, parseYM('2027-04'))).toBe(9)
    expect(monthsActive(2026, parseYM('2027-01'))).toBe(0)
  })
})

describe('expenseForYear', () => {
  const living = {
    label: 'Living',
    annual: 72000,
    start: '2027-01',
    indexing: 'inflation' as const,
    oneTime: false,
    perPerson: true,
  }
  const mortgage = {
    label: 'Mortgage',
    annual: 21600,
    start: '2027-01',
    end: '2031-08',
    indexing: 'none' as const,
    oneTime: false,
    perPerson: false,
  }
  const roof = {
    label: 'Roof',
    annual: 60000,
    start: '2028-06',
    indexing: 'inflation' as const,
    oneTime: true,
    perPerson: false,
  }

  test('inflation-indexed living expenses', () => expect(expenseForYear(living, 2028, ctx)).toBeCloseTo(75600, 6))
  test('nominal mortgage stops at its end month', () => {
    expect(expenseForYear(mortgage, 2030, ctx)).toBe(21600)
    expect(expenseForYear(mortgage, 2031, ctx)).toBe(14400)
    expect(expenseForYear(mortgage, 2032, ctx)).toBe(0)
  })
  test('one-time item only in its year', () => {
    expect(expenseForYear(roof, 2028, ctx)).toBeCloseTo(63000, 6)
    expect(expenseForYear(roof, 2029, ctx)).toBe(0)
  })
  test('survivor step-down applies to per-person items from the month after death', () => {
    const c = { ...ctx, price: 1, survivorFrom: parseYM('2040-07') }
    expect(expenseForYear(living, 2040, c)).toBeCloseTo((72000 * (6 + 6 * 0.75)) / 12, 6)
    expect(expenseForYear(living, 2041, c)).toBeCloseTo(54000, 6)
    expect(expenseForYear(mortgage, 2030, c)).toBe(21600)
  })
  test('fixed-rate and medical indexing', () => {
    expect(expenseForYear({ ...living, indexing: 0.1, perPerson: false }, 2029, ctx)).toBeCloseTo(72000 * 1.21, 6)
    expect(expenseForYear({ ...living, indexing: 'medical' }, 2029, ctx)).toBeCloseTo(72000 * 1.08, 6)
  })
  test('scale lever', () => expect(expenseForYear(living, 2028, { ...ctx, scale: 0.9 })).toBeCloseTo(75600 * 0.9, 6))
  test('discretionary items use their own scale; nondiscretionary items ignore it', () => {
    const c = { ...ctx, scale: 0.9, discretionaryScale: 1.2 }
    expect(expenseForYear({ ...living, discretionary: true }, 2028, c)).toBeCloseTo(75600 * 1.2, 6)
    expect(expenseForYear(living, 2028, c)).toBeCloseTo(75600 * 0.9, 6)
  })
})

describe('income and earnings', () => {
  test('owner income stops at death; joint continues', () => {
    const s = {
      label: 'Rent',
      owner: 'primary' as const,
      annual: 12000,
      start: '2027-01',
      indexing: 'none' as const,
      tax: 'ordinary' as const,
    }
    expect(incomeForYear(s, 2030, ctx, parseYM('2030-03'))).toBe(3000)
    expect(incomeForYear({ ...s, owner: 'joint' }, 2030, ctx, parseYM('2030-03'))).toBe(12000)
  })
  test('earnings prorate to months alive', () => {
    const rows = [{ year: 2027, wages: 60000, selfEmployment: 12000 }]
    expect(earningsForYear(rows, 2027, null)).toEqual({ wages: 60000, selfEmployment: 12000 })
    expect(earningsForYear(rows, 2027, parseYM('2027-06'))).toEqual({ wages: 30000, selfEmployment: 6000 })
    expect(earningsForYear(rows, 2028, null)).toEqual({ wages: 0, selfEmployment: 0 })
  })
})
