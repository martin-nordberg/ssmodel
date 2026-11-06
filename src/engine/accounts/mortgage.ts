// Home mortgage [FR-ACC-7]: a fixed-rate loan described by its balance on a statement date, the interest rate and
// the monthly principal-and-interest payment actually made (escrow excluded; any regular extra principal included).
// The balance after k payments is B·(1+i)^k − P·((1+i)^k − 1)/i (i = monthly rate). Payments fall on months
// asOf+1 … payoff, where payoff is the first month the balance reaches zero; the last payment is only what is owed.
import type { YM } from '../core/dates.ts'

export type EngineMortgage = {
  /** Statement month and balance after that month's payment (nominal). */
  asOf: YM
  balance: number
  /** Monthly interest rate (annual / 12). */
  i: number
  /** Monthly principal and interest (nominal, level), except the smaller final payment. */
  payment: number
  /** Month of the last (possibly partial) payment; Infinity if the payment does not cover the interest. */
  payoff: YM
}

/** Payments needed to retire `balance` at monthly rate `i` paying `payment`; Infinity if it never amortizes. */
export function paymentsToPayoff(balance: number, i: number, payment: number): number {
  if (balance <= 0) return 0
  if (payment <= balance * i) return Number.POSITIVE_INFINITY
  if (i === 0) return Math.ceil(balance / payment - 1e-9)
  return Math.ceil(-Math.log(1 - (balance * i) / payment) / Math.log(1 + i) - 1e-9)
}

/** Level payment that retires `balance` in `n` monthly payments (standard amortization). */
export function levelPayment(balance: number, annualRate: number, n: number): number {
  const i = annualRate / 12
  return i === 0 ? balance / n : (balance * i) / (1 - (1 + i) ** -n)
}

export function makeMortgage(balance: number, annualRate: number, asOf: YM, payment: number): EngineMortgage {
  const i = annualRate / 12
  // A payment below the interest (rejected by the schema, but possible while editing) never pays off.
  return { asOf, balance, i, payment, payoff: asOf + paymentsToPayoff(balance, i, payment) }
}

/** Balance after the payment of month `m` (0 from the payoff month on). Months before `asOf` run backwards. */
export function mortgageBalance(mg: EngineMortgage, m: YM): number {
  if (m >= mg.payoff) return 0
  const k = m - mg.asOf
  if (mg.i === 0) return Math.max(0, mg.balance - mg.payment * k)
  const g = (1 + mg.i) ** k
  return Math.max(0, mg.balance * g - (mg.payment * (g - 1)) / mg.i)
}

function paymentMonths(mg: EngineMortgage, year: number, from: YM): [YM, YM] {
  return [Math.max(year * 12, from), Math.min(year * 12 + 11, mg.payoff)]
}

/** Interest in the payments of `year` from month `from` on: each payment's interest is the prior balance × i. */
export function mortgageInterestInYear(mg: EngineMortgage, year: number, from: YM): number {
  const [first, last] = paymentMonths(mg, year, from)
  let interest = 0
  for (let m = first; m <= last; m++) interest += mortgageBalance(mg, m - 1) * mg.i
  return interest
}

/** Principal and interest paid in `year` from month `from` on, including the partial final payment. */
export function mortgagePaidInYear(mg: EngineMortgage, year: number, from: YM): number {
  const [first, last] = paymentMonths(mg, year, from)
  if (last < first) return 0
  const principal = mortgageBalance(mg, first - 1) - mortgageBalance(mg, last)
  return principal + mortgageInterestInYear(mg, year, from)
}
