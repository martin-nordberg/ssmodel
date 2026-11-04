// Metrics per claiming candidate across Monte Carlo paths [FR-REC-1].
import type { YM } from '../core/dates.ts'
import type { CandidateSamples } from '../sim/monteCarlo.ts'

export type Percentiles = { p10: number; p25: number; p50: number; p75: number; p90: number; mean: number }

export function percentiles(xs: ArrayLike<number>): Percentiles {
  const a = Float64Array.from(xs).sort()
  const n = a.length
  if (n === 0) return { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, mean: 0 }
  const q = (p: number) => {
    const pos = (n - 1) * p
    const lo = Math.floor(pos)
    const hi = Math.min(n - 1, lo + 1)
    return a[lo]! + (a[hi]! - a[lo]!) * (pos - lo)
  }
  let sum = 0
  for (const v of a) sum += v
  return { p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9), mean: sum / n }
}

const mean = (xs: ArrayLike<number>) => {
  let s = 0
  for (let i = 0; i < xs.length; i++) s += xs[i]!
  return xs.length ? s / xs.length : 0
}

export type CandidateMetrics = {
  claim: YM
  paths: number
  /** Savings never depleted while either spouse is alive. */
  successProb: number
  bequestProb: number
  terminal: Percentiles
  minLiquid: Percentiles
  lifetimeSs: number
  pvSs: number
  lifetimeTax: number
  irmaa: number
  shortfall: number
}

export function candidateMetrics(s: CandidateSamples): CandidateMetrics {
  const n = s.terminal.length
  return {
    claim: s.claim,
    paths: n,
    successProb: n ? 1 - mean(s.depleted) : 0,
    bequestProb: n ? mean(s.bequestMet) : 0,
    terminal: percentiles(s.terminal),
    minLiquid: percentiles(s.minLiquid),
    lifetimeSs: mean(s.lifetimeSs),
    pvSs: mean(s.pvSs),
    lifetimeTax: mean(s.lifetimeTax),
    irmaa: mean(s.irmaa),
    shortfall: mean(s.shortfall),
  }
}
