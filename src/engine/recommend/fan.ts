// Fan-chart summaries from a detail run [FR-OUT-3]: per-year percentiles of real liquid balances across paths
// (paths whose household has ended are excluded from later years), and per-account medians.
import { percentiles } from './metrics.ts'

export type FanPoint = { year: number; p10: number; p25: number; p50: number; p75: number; p90: number; alive: number }

export function fanSummary(liquid: Float32Array, paths: number, years: number, baseYear: number): FanPoint[] {
  const out: FanPoint[] = []
  for (let y = 0; y < years; y++) {
    const vals: number[] = []
    for (let p = 0; p < paths; p++) {
      const v = liquid[p * years + y]!
      if (!Number.isNaN(v)) vals.push(v)
    }
    if (vals.length < Math.max(10, paths * 0.05)) break
    const q = percentiles(vals)
    out.push({
      year: baseYear + y,
      p10: q.p10,
      p25: q.p25,
      p50: q.p50,
      p75: q.p75,
      p90: q.p90,
      alive: vals.length / paths,
    })
  }
  return out
}

export function accountMedians(
  byAccount: Float32Array,
  paths: number,
  years: number,
  nAcc: number,
  baseYear: number,
  maxYears: number,
) {
  const out: { year: number; values: number[] }[] = []
  for (let y = 0; y < Math.min(years, maxYears); y++) {
    const values: number[] = []
    for (let a = 0; a < nAcc; a++) {
      const vals: number[] = []
      for (let p = 0; p < paths; p++) {
        const v = byAccount[(p * years + y) * nAcc + a]!
        if (!Number.isNaN(v)) vals.push(v)
      }
      values.push(vals.length ? percentiles(vals).p50 : 0)
    }
    out.push({ year: baseYear + y, values })
  }
  return out
}
