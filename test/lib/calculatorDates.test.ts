import { describe, expect, test } from 'bun:test'
import { amountToCents, evaluate } from '@/lib/calculator.ts'
import { addToIso, dateShortcut, parseDateInput } from '@/lib/dateShortcuts.ts'

// FR-UI-31: the register's inline calculator and date shortcuts.

describe('calculator', () => {
  test('arithmetic with precedence, parentheses, unary minus and money formatting', () => {
    expect(evaluate('1 + 2 * 3')).toBe(7)
    expect(evaluate('(1 + 2) * 3')).toBe(9)
    expect(evaluate('-4 + 10 / 4')).toBe(-1.5)
    expect(evaluate('$1,234.56 - 34.56')).toBeCloseTo(1200)
    expect(evaluate('12 × 3 ÷ 4 − 1')).toBe(8)
  })

  test('mistakes are reported plainly', () => {
    expect(() => evaluate('1 +')).toThrow('incomplete')
    expect(() => evaluate('(1 + 2')).toThrow('not closed')
    expect(() => evaluate('5 / 0')).toThrow('Division by zero')
    expect(() => evaluate('abc')).toThrow('Unexpected')
  })

  test('amount fields round to the cent; empty is zero', () => {
    expect(amountToCents('19.99 * 3')).toEqual({ cents: 5997 })
    expect(amountToCents('10/3')).toEqual({ cents: 333 })
    expect(amountToCents('')).toEqual({ cents: 0 })
    expect('error' in amountToCents('1 +')).toBe(true)
  })
})

describe('date shortcuts and parsing', () => {
  const today = '2026-11-23'

  test('shortcut keys', () => {
    expect(dateShortcut('t', '2026-01-15', today)).toBe(today)
    expect(dateShortcut('+', '2026-12-31', today)).toBe('2027-01-01')
    expect(dateShortcut('-', '2026-03-01', today)).toBe('2026-02-28')
    expect(dateShortcut('PageDown', '2026-01-31', today)).toBe('2026-02-28')
    expect(dateShortcut('PageUp', '2026-03-31', today)).toBe('2026-02-28')
    expect(dateShortcut('m', '2026-03-17', today)).toBe('2026-03-01')
    expect(dateShortcut('h', '2028-02-03', today)).toBe('2028-02-29')
    expect(dateShortcut('y', '2026-03-17', today)).toBe('2026-01-01')
    expect(dateShortcut('r', '2026-03-17', today)).toBe('2026-12-31')
    expect(dateShortcut('+', 'garbage', today)).toBe('2026-11-24')
    expect(dateShortcut('x', '2026-03-17', today)).toBeNull()
  })

  test('lenient typed dates', () => {
    expect(parseDateInput('2026-02-03', today)).toBe('2026-02-03')
    expect(parseDateInput('2/3/2026', today)).toBe('2026-02-03')
    expect(parseDateInput('2/3/25', today)).toBe('2025-02-03')
    expect(parseDateInput('2/3', today)).toBe('2026-02-03')
    expect(parseDateInput('7', today)).toBe('2026-11-07')
    expect(parseDateInput('2/30', today)).toBeNull()
    expect(parseDateInput('soon', today)).toBeNull()
  })

  test('adding days and months', () => {
    expect(addToIso('2026-01-31', 0, 1)).toBe('2026-02-28')
    expect(addToIso('2024-02-29', 0, 12)).toBe('2025-02-28')
  })
})
