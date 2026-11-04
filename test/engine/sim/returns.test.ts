import { describe, expect, test } from 'bun:test'
import type { EngineAccount } from '@/engine/model/prepare.ts'
import { cholesky, lognormalParams, ParametricMarket } from '@/engine/sim/returns.ts'

const acct = (mean: number, sd: number, kind: EngineAccount['kind'] = 'traditional') =>
  ({ mean, sd, kind }) as EngineAccount

function stats(xs: number[]) {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length
  return { mean: m, sd: Math.sqrt(v) }
}
function corr(a: number[], b: number[]) {
  const sa = stats(a)
  const sb = stats(b)
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i]! - sa.mean) * (b[i]! - sb.mean)
  return s / a.length / (sa.sd * sb.sd)
}

describe('parametric market [NFR-TEST-5]', () => {
  const params = {
    inflation: { mean: 0.025, sd: 0.012, phi: 0.6 },
    crossAccountCorrelation: 0.85,
    inflationCorrelation: -0.1,
    realReturnShift: 0,
    volatilityMultiplier: 1,
  }
  const market = new ParametricMarket([acct(0.06, 0.11), acct(0.075, 0.16), acct(0.03, 0.01, 'cash')], params)
  const a: number[] = []
  const b: number[] = []
  const cash: number[] = []
  const infl: number[] = []
  const inflFirst: number[] = []
  for (let p = 0; p < 4000; p++) {
    const d = market.draw(7, p, 10)
    for (let y = 0; y < 10; y++) {
      a.push(d.returns[0]![y]!)
      b.push(d.returns[1]![y]!)
      cash.push(d.returns[2]![y]!)
      infl.push(d.inflation[y]!)
    }
    inflFirst.push(d.inflation[0]!)
  }

  test('return means and volatilities match the inputs', () => {
    const sa = stats(a)
    const sb = stats(b)
    expect(sa.mean).toBeCloseTo(0.06, 2)
    expect(sa.sd).toBeCloseTo(0.11, 2)
    expect(sb.mean).toBeCloseTo(0.075, 2)
    expect(sb.sd).toBeCloseTo(0.16, 2)
  })
  test('cash is the stated rate', () => expect(stats(cash).sd).toBeLessThan(1e-12))
  test('cross-account correlation', () => expect(corr(a, b)).toBeCloseTo(0.85, 1))
  test('inflation mean and unconditional sd', () => {
    const si = stats(infl)
    expect(si.mean).toBeCloseTo(0.025, 2)
    expect(si.sd).toBeGreaterThan(0.008)
    expect(si.sd).toBeLessThan(0.013)
  })
  test('inflation correlation with returns is negative', () => expect(corr(infl, a)).toBeLessThan(0))
  test('draws are reproducible per path', () => {
    expect(Array.from(market.draw(7, 3, 5).returns[0]!)).toEqual(Array.from(market.draw(7, 3, 5).returns[0]!))
  })
})

test('lognormal parameters reproduce the arithmetic mean', () => {
  const { mu, sigma } = lognormalParams(0.06, 0.11)
  expect(Math.exp(mu + (sigma * sigma) / 2) - 1).toBeCloseTo(0.06, 10)
})

test('cholesky shrinks an infeasible matrix to a valid one', () => {
  const l = cholesky([
    [1, 0.9, -0.9],
    [0.9, 1, 0.9],
    [-0.9, 0.9, 1],
  ])
  expect(l.every((row) => row.every(Number.isFinite))).toBe(true)
})
