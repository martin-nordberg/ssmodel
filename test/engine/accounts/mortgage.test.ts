import { describe, expect, test } from 'bun:test'
import {
  levelPayment,
  makeMortgage,
  mortgageBalance,
  mortgageInterestInYear,
  mortgagePaidInYear,
  paymentsToPayoff,
} from '@/engine/accounts/mortgage.ts'
import { parseYM } from '@/engine/core/dates.ts'

// Level-payment amortization, e.g. CFPB "What is amortization?" and any standard amortization table:
// $300,000 at 6% for 360 months -> $1,798.65/month principal and interest.
describe('mortgage', () => {
  const asOf = parseYM('2026-12')
  const m = makeMortgage(300_000, 0.06, asOf, levelPayment(300_000, 0.06, 360))

  test('level payment and payoff from balance, rate and payment', () => {
    expect(m.payment).toBeCloseTo(1798.65, 2)
    expect(m.payoff).toBe(asOf + 360)
  })

  test('balance amortizes to zero at payoff', () => {
    expect(mortgageBalance(m, asOf)).toBeCloseTo(300_000, 6)
    // After the first payment: 300,000 + 1,500 interest - 1,798.65 = 299,701.35.
    expect(mortgageBalance(m, asOf + 1)).toBeCloseTo(299_701.35, 2)
    // The balance equals the present value of the payments still due (240 after 120 are made): about $251,057.
    expect(mortgageBalance(m, asOf + 120)).toBeCloseTo((m.payment * (1 - 1.005 ** -240)) / 0.005, 6)
    expect(mortgageBalance(m, asOf + 120)).toBeCloseTo(251_057, 0)
    expect(mortgageBalance(m, asOf + 359)).toBeCloseTo(m.payment / 1.005, 2)
    expect(mortgageBalance(m, asOf + 360)).toBe(0)
    expect(mortgageBalance(m, asOf + 400)).toBe(0)
  })

  test('a balance date after the model start runs the balance backwards', () => {
    expect(mortgageBalance(m, asOf - 1)).toBeCloseTo((300_000 + m.payment) / 1.005, 6)
  })

  test('extra principal pays it off sooner; the last payment is only what is owed', () => {
    // $2,500/month instead of $1,798.65: n = −ln(1 − 300,000·0.005/2,500) / ln(1.005) = 183.7 -> 184 payments.
    const fast = makeMortgage(300_000, 0.06, asOf, 2500)
    expect(fast.payoff).toBe(asOf + 184)
    const last = mortgageBalance(fast, asOf + 183) * 1.005
    expect(last).toBeGreaterThan(0)
    expect(last).toBeLessThan(2500)
    // Total paid = balance + all interest.
    let paid = 0
    let interest = 0
    for (let y = 2027; y <= 2042; y++) {
      paid += mortgagePaidInYear(fast, y, asOf + 1)
      interest += mortgageInterestInYear(fast, y, asOf + 1)
    }
    expect(paid).toBeCloseTo(300_000 + interest, 6)
    expect(paid).toBeCloseTo(183 * 2500 + last, 6)
  })

  test('a payment that does not cover the interest never pays off', () => {
    expect(paymentsToPayoff(300_000, 0.005, 1500)).toBe(Number.POSITIVE_INFINITY)
    const neg = makeMortgage(300_000, 0.06, asOf, 1400)
    expect(neg.payoff).toBe(Number.POSITIVE_INFINITY)
    expect(mortgageBalance(neg, asOf + 12)).toBeGreaterThan(300_000)
  })

  test('zero rate is straight-line', () => {
    const z = makeMortgage(12_000, 0, asOf, 1000)
    expect(z.payoff).toBe(asOf + 12)
    expect(mortgageBalance(z, asOf + 6)).toBe(6000)
  })

  test('payments per year respect the model start and the payoff month', () => {
    const short = makeMortgage(50_000, 0.04, parseYM('2026-10'), levelPayment(50_000, 0.04, 58))
    expect(short.payoff).toBe(parseYM('2031-08'))
    const p = short.payment
    expect(mortgagePaidInYear(short, 2027, parseYM('2027-01'))).toBeCloseTo(12 * p, 6)
    expect(mortgagePaidInYear(short, 2027, parseYM('2027-04'))).toBeCloseTo(9 * p, 6)
    expect(mortgagePaidInYear(short, 2031, parseYM('2027-01'))).toBeCloseTo(8 * p, 6)
    expect(mortgagePaidInYear(short, 2032, parseYM('2027-01'))).toBe(0)
  })
})
