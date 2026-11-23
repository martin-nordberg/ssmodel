// The one boundary between ledger/budget money (integer cents) and planning money (float64 dollars)
// [NFR-ARCH-12, D: OQ-LED-1]. No other module converts between the two.

/** Integer cents to float dollars, for the planning engines. */
export function centsToDollars(cents: number): number {
  return cents / 100
}

/**
 * Float dollars to integer cents, rounding half away from zero to the nearest cent (planning results written back to
 * the ledger or budget, e.g. a planned contribution).
 */
export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars)) throw new Error(`dollarsToCents: not a finite amount: ${dollars}`)
  const cents = Math.sign(dollars) * Math.round(Math.abs(dollars) * 100)
  return cents === 0 ? 0 : cents // no negative zero
}
