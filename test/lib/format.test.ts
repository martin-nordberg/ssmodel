import { describe, expect, test } from 'bun:test'
import fc from 'fast-check'
import { formatCents, formatDate, formatDollars, formatPercent, formatPeriod } from '@/lib/format.ts'

// FR-UI-30: one formatting module; negative amounts look the same in the ledger (cents) and in plans (dollars).

const m = '−'

describe('formatCents', () => {
  test('exact to the cent, grouped', () => {
    expect(formatCents(0)).toBe('$0.00')
    expect(formatCents(5)).toBe('$0.05')
    expect(formatCents(123456)).toBe('$1,234.56')
    expect(formatCents(123456789012)).toBe('$1,234,567,890.12')
  })

  test('negatives use a minus sign before the dollar sign', () => {
    expect(formatCents(-5)).toBe(`${m}$0.05`)
    expect(formatCents(-123456)).toBe(`${m}$1,234.56`)
  })

  test('an optional plus for positive changes', () => {
    expect(formatCents(100, { plus: true })).toBe('+$1.00')
    expect(formatCents(0, { plus: true })).toBe('$0.00')
  })

  test('round-trips through its own text for any amount', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e13, max: 1e13 }), (cents) => {
        const text = formatCents(cents)
        const back = Number(text.replace(/[^\d]/g, '')) * (text.startsWith(m) ? -1 : 1)
        return back === cents || (cents === 0 && back === 0)
      }),
    )
  })
})

describe('formatDollars', () => {
  test('whole dollars by default, negatives as in the ledger', () => {
    expect(formatDollars(1234.4)).toBe('$1,234')
    expect(formatDollars(-1234.5)).toBe(`${m}$1,235`)
    expect(formatDollars(-0.4)).toBe('$0')
    expect(formatDollars(undefined)).toBe('')
    expect(formatDollars(Number.NaN)).toBe('')
  })

  test('the same negative style as formatCents', () => {
    expect(formatDollars(-1234.56, { cents: true })).toBe(formatCents(-123456))
  })

  test('compact abbreviations', () => {
    expect(formatDollars(9999, { compact: true })).toBe('$9,999')
    expect(formatDollars(12_345, { compact: true })).toBe('$12k')
    expect(formatDollars(-2_500_000, { compact: true })).toBe(`${m}$2.50M`)
  })
})

describe('formatPercent', () => {
  test('trims trailing zeros', () => {
    expect(formatPercent(0.0525)).toBe('5.25%')
    expect(formatPercent(0.05)).toBe('5%')
    expect(formatPercent(0.123456, 1)).toBe('12.3%')
    expect(formatPercent(-0.1)).toBe(`${m}10%`)
    expect(formatPercent(-0.00001)).toBe('0%')
  })
})

describe('dates and periods', () => {
  test('calendar dates without time zones', () => {
    expect(formatDate('2026-11-23')).toBe('Nov 23, 2026')
    expect(formatDate('2026-01-05', 'numeric')).toBe('1/5/2026')
    expect(formatDate('2026-01-05', 'iso')).toBe('2026-01-05')
    expect(formatDate('not a date')).toBe('not a date')
  })

  test('period labels', () => {
    expect(formatPeriod({ year: 2026 })).toBe('2026')
    expect(formatPeriod({ year: 2026, quarter: 3 })).toBe('Q3 2026')
    expect(formatPeriod({ year: 2026, month: 11 })).toBe('Nov 2026')
  })
})
