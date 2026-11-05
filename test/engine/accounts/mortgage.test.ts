import { describe, expect, test } from 'bun:test'
import { makeMortgage, mortgageBalance, mortgagePaymentsInYear } from '@/engine/accounts/mortgage.ts'
import { parseYM } from '@/engine/core/dates.ts'

// Level-payment amortization, e.g. CFPB "What is amortization?" and any standard amortization table:
// $300,000 at 6% for 360 months -> $1,798.65/month principal and interest.
describe('mortgage', () => {
  const asOf = parseYM('2026-12')
  const m = makeMortgage(300_000, 0.06, asOf, asOf + 360)

  test('payment from balance, rate and payoff month', () => {
    expect(m.payment).toBeCloseTo(1798.65, 2)
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

  test('zero rate is straight-line', () => {
    const z = makeMortgage(12_000, 0, asOf, asOf + 12)
    expect(z.payment).toBe(1000)
    expect(mortgageBalance(z, asOf + 6)).toBe(6000)
  })

  test('payments per year respect the model start and the payoff month', () => {
    const short = makeMortgage(50_000, 0.04, parseYM('2026-10'), parseYM('2031-08'))
    expect(mortgagePaymentsInYear(short, 2027, parseYM('2027-01'))).toBe(12)
    expect(mortgagePaymentsInYear(short, 2027, parseYM('2027-04'))).toBe(9)
    expect(mortgagePaymentsInYear(short, 2031, parseYM('2027-01'))).toBe(8)
    expect(mortgagePaymentsInYear(short, 2032, parseYM('2027-01'))).toBe(0)
  })
})
