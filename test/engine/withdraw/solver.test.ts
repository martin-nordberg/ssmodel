import { describe, expect, test } from 'bun:test'
import { emptyFederalInput, federalTax } from '@/engine/tax/federal.ts'
import { type SolverAccount, solveWithdrawals, type TaxFn } from '@/engine/withdraw/solver.ts'

const acct = (kind: SolverAccount['kind'], available: number, over: Partial<SolverAccount> = {}): SolverAccount => ({
  kind,
  owner: 0,
  available,
  gainFrac: 0,
  reserve: 0,
  penaltyRate: 0,
  ...over,
})

// Flat 20% on ordinary income and 15% on gains, no other income.
const flat: TaxFn = (d) => {
  const ord = d.ordinaryByPerson[0] + d.ordinaryByPerson[1]
  return { total: 0.2 * ord + 0.15 * d.ltcg + d.penalty, ordinaryTaxable: ord, magi: ord + d.ltcg }
}

describe('solveWithdrawals', () => {
  test('grosses up traditional withdrawals for tax', () => {
    const r = solveWithdrawals({
      accounts: [acct('traditional', 1e6)],
      strategy: { kind: 'conventional' },
      inflows: 0,
      spending: 50000,
      tax: flat,
    })
    expect(r.withdrawals[0]).toBeCloseTo(62500, -1)
    expect(Math.abs(r.net - 50000)).toBeLessThan(1)
    expect(r.shortfall).toBe(0)
  })

  test('conventional order: cash above reserve, then taxable, then traditional, then Roth', () => {
    const accounts = [
      acct('roth', 100000),
      acct('traditional', 100000),
      acct('taxable', 20000, { gainFrac: 0.5 }),
      acct('cash', 15000, { reserve: 10000 }),
    ]
    const r = solveWithdrawals({ accounts, strategy: { kind: 'conventional' }, inflows: 0, spending: 40000, tax: flat })
    const [roth, trad, taxable, cash] = r.withdrawals
    expect(cash).toBeCloseTo(5000, 6)
    expect(taxable).toBeCloseTo(20000, 6)
    // Remaining need: 40,000 - 5,000 - (20,000 - 1,500 tax on gains) = 16,500 net from traditional at 20%.
    expect(trad).toBeCloseTo(16500 / 0.8, -1)
    expect(roth).toBe(0)
  })

  test('surplus when inflows exceed spending plus tax', () => {
    const r = solveWithdrawals({
      accounts: [acct('taxable', 1000)],
      strategy: { kind: 'conventional' },
      inflows: 60000,
      spending: 50000,
      tax: flat,
    })
    expect(r.surplus).toBe(10000)
    expect(r.withdrawals[0]).toBe(0)
  })

  test('shortfall when accounts are exhausted', () => {
    const r = solveWithdrawals({
      accounts: [acct('roth', 10000)],
      strategy: { kind: 'conventional' },
      inflows: 5000,
      spending: 50000,
      tax: flat,
    })
    expect(r.shortfall).toBeCloseTo(35000, 6)
  })

  test('cash reserve is used last when everything else is gone', () => {
    const r = solveWithdrawals({
      accounts: [acct('cash', 10000, { reserve: 8000 })],
      strategy: { kind: 'conventional' },
      inflows: 0,
      spending: 9000,
      tax: flat,
    })
    expect(r.withdrawals[0]).toBeCloseTo(9000, 6)
  })

  test('bracket-fill: traditional up to the bracket top, then taxable', () => {
    // 0% on the first 30,000 of ordinary income, 22% above.
    const kinked: TaxFn = (d) => {
      const ord = d.ordinaryByPerson[0] + d.ordinaryByPerson[1]
      return { total: 0.22 * Math.max(0, ord - 30000) + 0.15 * d.ltcg, ordinaryTaxable: ord, magi: ord + d.ltcg }
    }
    const accounts = [acct('traditional', 1e6), acct('taxable', 1e6, { gainFrac: 0 })]
    const r = solveWithdrawals({
      accounts,
      strategy: { kind: 'bracket_fill', bracketTop: 30000, magiCap: Number.POSITIVE_INFINITY },
      inflows: 0,
      spending: 50000,
      tax: kinked,
    })
    expect(r.withdrawals[0]).toBeCloseTo(30000, -1)
    expect(r.withdrawals[1]).toBeCloseTo(20000, -1)
  })

  test('bracket-fill respects a MAGI cap', () => {
    const accounts = [acct('traditional', 1e6), acct('roth', 1e6)]
    const r = solveWithdrawals({
      accounts,
      strategy: { kind: 'bracket_fill', bracketTop: 100000, magiCap: 25000 },
      inflows: 0,
      spending: 50000,
      tax: flat,
    })
    expect(r.withdrawals[0]).toBeCloseTo(25000, -1)
  })

  test('proportional draws pro-rata', () => {
    const accounts = [acct('roth', 30000), acct('cash', 10000)]
    const r = solveWithdrawals({ accounts, strategy: { kind: 'proportional' }, inflows: 0, spending: 20000, tax: flat })
    expect(r.withdrawals[0]! / r.withdrawals[1]!).toBeCloseTo(3, 4)
  })

  test('custom order', () => {
    const accounts = [acct('roth', 1e5), acct('cash', 1e5)]
    const r = solveWithdrawals({
      accounts,
      strategy: { kind: 'custom', order: ['roth'] },
      inflows: 0,
      spending: 20000,
      tax: flat,
    })
    expect(r.withdrawals).toEqual([20000, 0])
  })

  test('converges on real federal tax with SS taxation kinks', () => {
    const tax: TaxFn = (d) => {
      const r = federalTax({
        ...emptyFederalInput(2026, 'mfj'),
        count65: 2,
        taxableMax: 184500,
        socialSecurity: 48000,
        ordinary: 6000 + d.ordinaryByPerson[0] + d.ordinaryByPerson[1],
        ltcg: d.ltcg,
      })
      return { total: r.total, ordinaryTaxable: r.ordinaryTaxable, magi: r.magi }
    }
    for (const spending of [55000, 80000, 120000, 200000]) {
      const r = solveWithdrawals({
        accounts: [acct('traditional', 2e6), acct('taxable', 3e5, { gainFrac: 0.3 })],
        strategy: { kind: 'bracket_fill', bracketTop: 100800, magiCap: Number.POSITIVE_INFINITY },
        inflows: 48000 + 6000,
        spending,
        tax,
      })
      expect(r.net - spending).toBeGreaterThanOrEqual(0)
      expect(r.net - spending).toBeLessThan(1)
    }
  })
})
