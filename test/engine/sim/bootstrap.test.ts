import { describe, expect, test } from 'bun:test'
import type { EngineAccount } from '@/engine/model/prepare.ts'
import { BootstrapMarket, proxyMix } from '@/engine/sim/bootstrap.ts'
import { HISTORY } from '@/engine/sim/historyData.ts'

const acct = (mix: EngineAccount['proxyMix'], kind: EngineAccount['kind'] = 'traditional') =>
  ({ kind, proxyMix: mix, sd: 0.11, mean: 0.06, cashRate: 0 }) as EngineAccount

describe('historical block bootstrap [NFR-TEST-5]', () => {
  const stocks = acct({ stocks: 1, bonds: 0, cash: 0 })
  const bonds = acct({ stocks: 0, bonds: 1, cash: 0 })
  const m = new BootstrapMarket([stocks, bonds], { blockLength: 5, realReturnShift: 0, volatilityMultiplier: 1 })
  const histMean = (col: number) => HISTORY.reduce((s, r) => s + r[col]!, 0) / HISTORY.length

  test('series covers 1928-2025', () => {
    expect(HISTORY[0]![0]).toBe(1928)
    expect(HISTORY.at(-1)![0]).toBe(2025)
  })

  test('resampled means match the historical means', () => {
    let sp = 0
    let bd = 0
    let inf = 0
    let n = 0
    for (let p = 0; p < 3000; p++) {
      const d = m.draw(1, p, 30)
      for (let y = 0; y < 30; y++) {
        sp += d.returns[0]![y]!
        bd += d.returns[1]![y]!
        inf += d.inflation[y]!
        n++
      }
    }
    expect(sp / n).toBeCloseTo(histMean(1), 2)
    expect(bd / n).toBeCloseTo(histMean(3), 2)
    expect(inf / n).toBeCloseTo(histMean(4), 2)
  })

  test('blocks are consecutive historical years', () => {
    const d = m.draw(3, 0, 5)
    const i = HISTORY.findIndex((r) => Math.abs(r[1] - d.returns[0]![0]!) < 1e-12 && r[4] === d.inflation[0])
    expect(i).toBeGreaterThanOrEqual(0)
    for (let k = 1; k < 5; k++) expect(d.returns[0]![k]).toBeCloseTo(HISTORY[(i + k) % HISTORY.length]![1], 10)
  })

  test('reproducible per path; volatility multiplier shrinks dispersion', () => {
    expect(Array.from(m.draw(9, 4, 10).inflation)).toEqual(Array.from(m.draw(9, 4, 10).inflation))
    const calm = new BootstrapMarket([stocks], { blockLength: 5, realReturnShift: 0, volatilityMultiplier: 0.5 })
    const a = m.draw(9, 4, 10).returns[0]!
    const b = calm.draw(9, 4, 10).returns[0]!
    const spread = (x: Float64Array) => Math.max(...x) - Math.min(...x)
    expect(spread(b)).toBeCloseTo(spread(a) / 2, 6)
  })

  test('proxy mix implied by volatility', () => {
    expect(proxyMix({ proxyMix: null, sd: 0.17 } as EngineAccount).stocks).toBeCloseTo(1, 6)
    expect(proxyMix({ proxyMix: null, sd: 0.03 } as EngineAccount).stocks).toBe(0)
  })
})
