import { describe, expect, test } from 'bun:test'
import { lifeExpectancy, monthsUntilDeath } from '@/engine/sim/mortality.ts'
import { createRng } from '@/engine/sim/rng.ts'

describe('stochastic mortality [NFR-TEST-5]', () => {
  test('quantiles are monotone in u', () => {
    expect(monthsUntilDeath('male', 65 * 12, 0, 0.9)).toBeLessThan(monthsUntilDeath('male', 65 * 12, 0, 0.1))
  })
  test('median remaining life is plausible at 65', () => {
    const med = monthsUntilDeath('male', 65 * 12, 0, 0.5) / 12
    expect(med).toBeGreaterThan(15)
    expect(med).toBeLessThan(21)
  })
  test('simulated mean matches the table life expectancy', () => {
    for (const sex of ['male', 'female'] as const) {
      const rng = createRng(11)
      let sum = 0
      const n = 40000
      for (let i = 0; i < n; i++) sum += monthsUntilDeath(sex, 65 * 12, 0, rng.next())
      const e = lifeExpectancy(sex, 65)
      expect(Math.abs(sum / n / 12 - e)).toBeLessThan(0.15)
    }
  })
  test('table life expectancy at 65 (SSA 2022 period: about 17.5 male, 20.1 female)', () => {
    expect(lifeExpectancy('male', 65)).toBeCloseTo(17.5, 0)
    expect(lifeExpectancy('female', 65)).toBeCloseTo(20.1, 0)
  })
  test('a health offset shortens life', () => {
    expect(lifeExpectancy('female', 65, 5)).toBeLessThan(lifeExpectancy('female', 65))
  })
})
