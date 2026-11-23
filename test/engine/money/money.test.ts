import { describe, expect, test } from 'bun:test'
import fc from 'fast-check'
import { centsToDollars, dollarsToCents } from '@/engine/money/index.ts'

// NFR-ARCH-12: the one cents ⇄ dollars boundary.
describe('cents ⇄ dollars', () => {
  test('converts exact amounts', () => {
    expect(centsToDollars(123456)).toBe(1234.56)
    expect(centsToDollars(-5)).toBe(-0.05)
    expect(dollarsToCents(1234.56)).toBe(123456)
    expect(dollarsToCents(-0.05)).toBe(-5)
    expect(dollarsToCents(0.1 + 0.2)).toBe(30)
  })

  test('rounds to the nearest cent, half away from zero', () => {
    expect(dollarsToCents(10.004)).toBe(1000)
    expect(dollarsToCents(10.006)).toBe(1001)
    expect(dollarsToCents(0.125)).toBe(13)
    expect(dollarsToCents(-0.125)).toBe(-13)
  })

  test('never returns negative zero', () => {
    expect(Object.is(dollarsToCents(-0.001), 0)).toBe(true)
  })

  test('rejects non-finite amounts', () => {
    expect(() => dollarsToCents(Number.NaN)).toThrow()
    expect(() => dollarsToCents(Number.POSITIVE_INFINITY)).toThrow()
  })

  test('every whole-cent amount survives the round trip', () => {
    // Up to $10 trillion, far beyond any household amount.
    fc.assert(
      fc.property(fc.integer({ min: -1e15, max: 1e15 }), (cents) => dollarsToCents(centsToDollars(cents)) === cents),
      { numRuns: 20_000 },
    )
  })
})
