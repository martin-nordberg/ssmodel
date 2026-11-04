// Taxable brokerage account with average cost basis [FR-ACC-4]. Dividends are taxed yearly (treated as qualified)
// and reinvested, which raises the basis. Sales realize gain in proportion to the unrealized gain.

export type TaxableState = { balance: number; basis: number }

/** Sell `amount` (capped at the balance). Returns the amount sold and the long-term gain realized. */
export function sellTaxable(s: TaxableState, amount: number): { sold: number; gain: number } {
  const sold = Math.min(Math.max(0, amount), s.balance)
  if (sold <= 0 || s.balance <= 0) return { sold: 0, gain: 0 }
  const basisSold = s.basis * (sold / s.balance)
  s.balance -= sold
  s.basis -= basisSold
  return { sold, gain: Math.max(0, sold - basisSold) }
}

/** Gross amount to sell to net `net` after a capital gains tax rate on the gain portion. */
export function grossUpTaxableSale(s: TaxableState, net: number, gainRate: number): number {
  if (s.balance <= 0) return 0
  const gainFrac = Math.max(0, 1 - s.basis / s.balance)
  return net / Math.max(1e-9, 1 - gainFrac * gainRate)
}

export function addToTaxable(s: TaxableState, amount: number): void {
  s.balance += amount
  s.basis += amount
}
