// Paying a Roth conversion's tax [FR-WD-4, D: Q-TAX-6]. The tax comes from cash above its reserve target first (no
// gain), then taxable shares, then the rest of cash. Selling shares realizes gain = g × sold, which is itself taxed
// in the same year, so the tax due T solves T = taxFor(g × S(T)) with S(T) = clamp(T − freeCash, 0, taxable).
// The fixed point is found by iteration: the marginal rate on the gain is below 1, so it converges (to $0.01).

export type FundingSources = {
  /** Cash above its reserve target. */
  freeCash: number
  taxableBalance: number
  /** Unrealized gain fraction of the taxable account (1 − basis / balance). */
  gainFrac: number
  /** Cash within the reserve target (used last). */
  reserveCash: number
}

export type Funding = { tax: number; fromFreeCash: number; sold: number; gain: number; fromReserve: number }

/** `taxFor(gain)` is the year's extra tax for the conversion with `gain` of extra long-term gain. */
export function fundConversionTax(taxFor: (gain: number) => number, src: FundingSources): Funding {
  const sale = (t: number) => Math.min(src.taxableBalance, Math.max(0, t - src.freeCash))
  let t = taxFor(0)
  for (let k = 0; k < 50; k++) {
    const next = taxFor(src.gainFrac * sale(t))
    const done = Math.abs(next - t) < 0.01
    t = next
    if (done) break
  }
  const fromFreeCash = Math.min(t, src.freeCash)
  const sold = sale(t)
  const fromReserve = Math.min(src.reserveCash, Math.max(0, t - fromFreeCash - sold))
  return { tax: t, fromFreeCash, sold, gain: src.gainFrac * sold, fromReserve }
}

/** Everything that can pay the tax. */
export const fundingCapacity = (src: FundingSources) => src.freeCash + src.taxableBalance + src.reserveCash
