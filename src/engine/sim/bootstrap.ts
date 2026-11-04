// Historical block bootstrap [FR-MC-3]: each path strings together blocks of consecutive historical years
// (wrapping around the end of the series), keeping within-block sequences such as inflation spells. An account's
// return is its stock/bond/cash proxy mix of the S&P 500, 10-year Treasury and T-bill returns; inflation is CPI-U.
import type { EngineAccount } from '../model/prepare.ts'
import { HISTORY } from './historyData.ts'
import type { MarketDraws } from './returns.ts'
import { createRng, Stream } from './rng.ts'

type Mix = { stocks: number; bonds: number; cash: number }

const PRESET_MIX: Record<string, Mix> = {
  conservative: { stocks: 0.3, bonds: 0.6, cash: 0.1 },
  moderate: { stocks: 0.6, bonds: 0.35, cash: 0.05 },
  aggressive: { stocks: 0.85, bonds: 0.15, cash: 0 },
}

/** Proxy mix for an account: explicit, else implied by its volatility (stocks ≈ 17% sd, bonds ≈ 7%). */
export function proxyMix(a: EngineAccount): Mix {
  if (a.proxyMix) return a.proxyMix
  const stocks = Math.min(1, Math.max(0, (a.sd - 0.03) / 0.14))
  return { stocks, bonds: Math.max(0, 1 - stocks - 0.05), cash: Math.min(0.05, 1 - stocks) }
}

export { PRESET_MIX }

export class BootstrapMarket {
  private readonly mixes: (Mix | null)[]
  private readonly cashRates: number[]
  private readonly block: number
  private readonly shift: number
  private readonly vol: number
  private readonly meanReturn: number[]

  constructor(
    accounts: EngineAccount[],
    p: { blockLength: number; realReturnShift: number; volatilityMultiplier: number },
  ) {
    this.mixes = accounts.map((a) => (a.kind === 'cash' ? null : proxyMix(a)))
    this.cashRates = accounts.map((a) => a.cashRate || a.mean)
    this.block = Math.max(1, Math.round(p.blockLength))
    this.shift = p.realReturnShift
    this.vol = p.volatilityMultiplier
    // Historical mean per account, for scaling volatility around it.
    this.meanReturn = this.mixes.map((m) => {
      if (!m) return 0
      let s = 0
      for (const [, sp, bill, bond] of HISTORY) s += m.stocks * sp + m.bonds * bond + m.cash * bill
      return s / HISTORY.length
    })
  }

  draw(seed: number, path: number, years: number): MarketDraws {
    const rng = createRng(seed, path, Stream.bootstrap)
    const n = HISTORY.length
    const idx: number[] = []
    while (idx.length < years) {
      const start = Math.floor(rng.next() * n)
      for (let k = 0; k < this.block && idx.length < years; k++) idx.push((start + k) % n)
    }
    const inflation = new Float64Array(years)
    const returns = this.mixes.map(() => new Float64Array(years))
    for (let y = 0; y < years; y++) {
      const [, sp, bill, bond, cpi] = HISTORY[idx[y]!]!
      inflation[y] = cpi
      for (let a = 0; a < this.mixes.length; a++) {
        const m = this.mixes[a]
        if (!m) {
          returns[a]![y] = this.cashRates[a]!
          continue
        }
        const raw = m.stocks * sp + m.bonds * bond + m.cash * bill
        const mean = this.meanReturn[a]!
        returns[a]![y] = mean + this.vol * (raw - mean) + this.shift
      }
    }
    return { inflation, returns }
  }
}
