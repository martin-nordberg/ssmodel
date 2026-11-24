import { describe, expect, test } from 'bun:test'
import { convertPeriod, periodKind, periodLabel, shiftPeriod } from '@/app/components/PeriodPicker.tsx'

// FR-RPT-2 (base): report periods of a year, a quarter or a month.
describe('report periods', () => {
  test('kinds and labels', () => {
    expect([periodKind('2026'), periodKind('2026-Q3'), periodKind('2026-11')]).toEqual(['year', 'quarter', 'month'])
    expect([periodLabel('2026'), periodLabel('2026-Q3'), periodLabel('2026-01')]).toEqual([
      '2026',
      'Q3 2026',
      'Jan 2026',
    ])
  })

  test('previous and next, across year ends', () => {
    expect(shiftPeriod('2026', -1)).toBe('2025')
    expect(shiftPeriod('2026-Q1', -1)).toBe('2025-Q4')
    expect(shiftPeriod('2026-Q4', 1)).toBe('2027-Q1')
    expect(shiftPeriod('2026-01', -1)).toBe('2025-12')
    expect(shiftPeriod('2026-12', 13)).toBe('2028-01')
  })

  test('changing the kind keeps the same point in time', () => {
    expect(convertPeriod('2026-11', 'quarter')).toBe('2026-Q4')
    expect(convertPeriod('2026-Q2', 'month')).toBe('2026-06')
    expect(convertPeriod('2026', 'month')).toBe('2026-12')
    expect(convertPeriod('2026-02', 'year')).toBe('2026')
  })
})
