// Stochastic inflation and returns [FR-MC-2, FR-MC-3 parametric].
// Inflation: AR(1) around the mean; `sd` is the unconditional standard deviation, so the innovation sd is
// sd * sqrt(1 - phi^2). Returns: lognormal per account with the given arithmetic mean and sd; the inflation shock
// and all account shocks are jointly normal with one cross-account correlation and one inflation correlation.
import type { EngineAccount } from '../model/prepare.ts'
import { createRng, Stream } from './rng.ts'

export type ReturnModelParams = {
  inflation: { mean: number; sd: number; phi: number }
  crossAccountCorrelation: number
  inflationCorrelation: number
  realReturnShift: number
  volatilityMultiplier: number
}

/** Lower-triangular Cholesky factor; shrinks off-diagonals until the matrix is positive definite. */
export function cholesky(c: number[][]): number[][] {
  const n = c.length
  for (let shrink = 1; shrink >= 0; shrink -= 0.05) {
    const a = c.map((row, i) => row.map((v, j) => (i === j ? v : v * shrink)))
    const l = a.map(() => new Array<number>(n).fill(0))
    let ok = true
    for (let i = 0; i < n && ok; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = a[i]![j]!
        for (let k = 0; k < j; k++) sum -= l[i]![k]! * l[j]![k]!
        if (i === j) {
          if (sum <= 1e-12) {
            ok = false
            break
          }
          l[i]![i] = Math.sqrt(sum)
        } else l[i]![j] = sum / l[j]![j]!
      }
    }
    if (ok) return l
  }
  return c.map((row, i) => row.map((_, j) => (i === j ? 1 : 0)))
}

/** Lognormal parameters for an arithmetic mean m and sd s of the simple return. */
export function lognormalParams(m: number, s: number): { mu: number; sigma: number } {
  const sigma2 = Math.log(1 + (s * s) / ((1 + m) * (1 + m)))
  return { mu: Math.log(1 + m) - sigma2 / 2, sigma: Math.sqrt(sigma2) }
}

export type MarketDraws = { inflation: Float64Array; returns: Float64Array[] }

export class ParametricMarket {
  private readonly chol: number[][]
  private readonly params: { mu: number; sigma: number }[]
  private readonly p: ReturnModelParams

  constructor(accounts: EngineAccount[], p: ReturnModelParams) {
    this.p = p
    const n = accounts.length
    const c: number[][] = []
    for (let i = 0; i <= n; i++) {
      const row: number[] = []
      for (let j = 0; j <= n; j++)
        row.push(i === j ? 1 : i === 0 || j === 0 ? p.inflationCorrelation : p.crossAccountCorrelation)
      c.push(row)
    }
    this.chol = cholesky(c)
    this.params = accounts.map((a) =>
      a.kind === 'cash'
        ? { mu: Math.log(1 + a.mean), sigma: 0 }
        : lognormalParams(a.mean + p.realReturnShift, a.sd * p.volatilityMultiplier),
    )
  }

  draw(seed: number, path: number, years: number): MarketDraws {
    const n = this.params.length
    const rngInf = createRng(seed, path, Stream.inflation)
    const rngRet = createRng(seed, path, Stream.returns)
    const inflation = new Float64Array(years)
    const returns = this.params.map(() => new Float64Array(years))
    const { mean, sd, phi } = this.p.inflation
    const innov = sd * Math.sqrt(1 - phi * phi)
    const eps = new Float64Array(n + 1)
    const z = new Float64Array(n + 1)
    let prev = mean
    for (let y = 0; y < years; y++) {
      eps[0] = rngInf.normal()
      for (let i = 1; i <= n; i++) eps[i] = rngRet.normal()
      for (let i = 0; i <= n; i++) {
        let s = 0
        const row = this.chol[i]!
        for (let k = 0; k <= i; k++) s += row[k]! * eps[k]!
        z[i] = s
      }
      const infl = mean + phi * (prev - mean) + innov * z[0]!
      inflation[y] = infl
      prev = infl
      for (let i = 0; i < n; i++) {
        const { mu, sigma } = this.params[i]!
        returns[i]![y] = Math.exp(mu + sigma * z[i + 1]!) - 1
      }
    }
    return { inflation, returns }
  }
}
