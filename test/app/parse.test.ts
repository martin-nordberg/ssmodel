import { describe, expect, test } from 'bun:test'
import {
  formatCurrency,
  formatPercent,
  parseCurrency,
  parseDate,
  parseInteger,
  parsePercent,
  parseTsv,
  parseYearMonth,
  toTsv,
} from '@/app/components/grid/parse.ts'

const ok = <T>(v: T) => ({ ok: true as const, value: v })

describe('cell parsing (FR-UI-4)', () => {
  test('currency', () => {
    expect(parseCurrency('$1,234')).toEqual(ok(1234))
    expect(parseCurrency('1.2k')).toEqual(ok(1200))
    expect(parseCurrency('1.2M')).toEqual(ok(1200000))
    expect(parseCurrency('(500)')).toEqual(ok(-500))
    expect(parseCurrency('abc').ok).toBe(false)
    expect(parseCurrency('').ok).toBe(false)
  })
  test('percent', () => {
    expect(parsePercent('3.5%')).toEqual(ok(0.035))
    expect(parsePercent('3.5')).toEqual(ok(0.035))
    expect(parsePercent('0.035')).toEqual(ok(0.035))
  })
  test('integer', () => {
    expect(parseInteger('2027')).toEqual(ok(2027))
    expect(parseInteger('20.5').ok).toBe(false)
  })
  test('year-month', () => {
    expect(parseYearMonth('2032-01')).toEqual(ok('2032-01'))
    expect(parseYearMonth('2032-1')).toEqual(ok('2032-01'))
    expect(parseYearMonth('Jan 2032')).toEqual(ok('2032-01'))
    expect(parseYearMonth('january 2032')).toEqual(ok('2032-01'))
    expect(parseYearMonth('1/2032')).toEqual(ok('2032-01'))
    expect(parseYearMonth('2032-13').ok).toBe(false)
  })
  test('date', () => {
    expect(parseDate('1961-05-14')).toEqual(ok('1961-05-14'))
    expect(parseDate('5/14/1961')).toEqual(ok('1961-05-14'))
    expect(parseDate('1961-02-30').ok).toBe(false)
  })
  test('formatting', () => {
    expect(formatCurrency(1234.4)).toBe('$1,234')
    expect(formatCurrency(1234567, true)).toBe('$1.23M')
    expect(formatPercent(0.035)).toBe('3.5%')
    expect(formatPercent(0.1)).toBe('10%')
  })
  test('TSV round trip, including the SSA earnings table format', () => {
    const text = '2023\t$160,200\t$160,200\r\n2024\t$168,600\t$168,600\r\n'
    const cells = parseTsv(text)
    expect(cells).toEqual([
      ['2023', '$160,200', '$160,200'],
      ['2024', '$168,600', '$168,600'],
    ])
    expect(toTsv(cells)).toBe('2023\t$160,200\t$160,200\n2024\t$168,600\t$168,600')
  })
})

import { formatCell, parseCell } from '@/app/components/grid/DataGrid.tsx'

describe('parseCell / formatCell', () => {
  const sel = { type: 'select' as const, options: [{ value: 'se', label: 'Self-employment' }] }
  test('select accepts value or label', () => {
    expect(parseCell(sel, 'Self-employment')).toEqual({ ok: true, value: 'se' })
    expect(parseCell(sel, 'se')).toEqual({ ok: true, value: 'se' })
    expect(parseCell(sel, 'x').ok).toBe(false)
  })
  test('optional empty clears; required empty errors', () => {
    expect(parseCell({ type: 'currency', optional: true }, '')).toEqual({ ok: true, value: undefined })
    expect(parseCell({ type: 'currency' }, '').ok).toBe(false)
  })
  test('min and max', () => {
    expect(parseCell({ type: 'integer', min: 1937 }, '1900').ok).toBe(false)
    expect(parseCell({ type: 'percent', max: 1 }, '150%').ok).toBe(false)
  })
  test('boolean', () => {
    expect(parseCell({ type: 'boolean' }, 'yes')).toEqual({ ok: true, value: true })
    expect(formatCell('boolean', false)).toBe('No')
  })
})

test('percent formatting keeps whole-number zeros', () => {
  expect(formatPercent(0.9, 0)).toBe('90%')
  expect(formatPercent(0.025)).toBe('2.5%')
  expect(formatPercent(1, 0)).toBe('100%')
})

import { DEFAULT_LEVERS } from '@/app/views/console/levers.ts'

test('lever formats keep whole-number zeros', () => {
  const fmt = (id: string, v: number) => {
    const l = DEFAULT_LEVERS.find((x) => x.id === id)!
    return l.kind === 'slider' ? l.format(v) : ''
  }
  expect(fmt('expenseScale', 1)).toBe('100%')
  expect(fmt('successFloor', 0.9)).toBe('90%')
  expect(fmt('inflation', 0.025)).toBe('2.5%')
  expect(fmt('deathP', 90)).toBe('90')
})
