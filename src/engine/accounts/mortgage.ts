// Home mortgage [FR-ACC-7]: a fixed-rate, level-payment loan described by its balance on a statement date, the
// interest rate and the payoff month. The principal-and-interest payment is derived (standard amortization:
// payment = B·i / (1 − (1 + i)^−n), i = monthly rate, n = payments left), so escrowed taxes and insurance are not
// part of it. Payments fall on months asOf+1 … payoff; the statement balance is after the asOf payment.
import type { YM } from '../core/dates.ts'

export type EngineMortgage = {
  /** Statement month and balance after that month's payment (nominal). */
  asOf: YM
  balance: number
  /** Monthly interest rate (annual / 12). */
  i: number
  /** Month of the last payment. */
  payoff: YM
  /** Monthly principal and interest (nominal, level). */
  payment: number
}

export function makeMortgage(balance: number, annualRate: number, asOf: YM, payoff: YM): EngineMortgage {
  const i = annualRate / 12
  const n = Math.max(1, payoff - asOf)
  const payment = i === 0 ? balance / n : (balance * i) / (1 - (1 + i) ** -n)
  return { asOf, balance, i, payoff, payment }
}

/** Balance after the payment of month `m` (0 from the payoff month on). Months before `asOf` run backwards. */
export function mortgageBalance(mg: EngineMortgage, m: YM): number {
  if (m >= mg.payoff) return 0
  const k = m - mg.asOf
  if (mg.i === 0) return Math.max(0, mg.balance - mg.payment * k)
  const g = (1 + mg.i) ** k
  return Math.max(0, mg.balance * g - (mg.payment * (g - 1)) / mg.i)
}

/** Number of monthly payments in `year` from month `from` on (e.g. the model's base month). */
export function mortgagePaymentsInYear(mg: EngineMortgage, year: number, from: YM): number {
  const first = Math.max(year * 12, from)
  const last = Math.min(year * 12 + 11, mg.payoff)
  return Math.max(0, last - first + 1)
}
