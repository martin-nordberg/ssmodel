import { describe, expect, test } from 'bun:test'
import { mortgageBalance } from '@/engine/accounts/mortgage.ts'
import { type EngineProperty, sellProperty } from '@/engine/accounts/property.ts'
import { parseYM } from '@/engine/core/dates.ts'
import { prepare } from '@/engine/model/prepare.ts'
import { runDeterministic } from '@/engine/sim/deterministic.ts'
import type { YearRow } from '@/engine/sim/path.ts'
import type { HouseholdFile } from '@/schema/model.ts'
import { parseHouseholdYaml } from '@/schema/yamlio.ts'

const base = await (async () => {
  const r = parseHouseholdYaml(await Bun.file(new URL('../../fixtures/full.yaml', import.meta.url)).text())
  if (!r.ok) throw new Error('fixture')
  return r.value
})()

function run(edit: (f: HouseholdFile) => void) {
  const f = structuredClone(base)
  f.scenarios[0]!.assumptions.mortality.mode = 'fixed'
  edit(f)
  const p = prepare(f)
  return { prep: p, rows: runDeterministic(p, p.people[0].age.fraMonth).rows! }
}
const row = (rows: YearRow[], y: number): YearRow => rows.find((r) => r.year === y)!

describe('sellProperty', () => {
  const home = { primaryResidence: true, sale: { costPct: 0.07 } } as EngineProperty
  test('section 121 exclusion on a primary residence', () => {
    const r = sellProperty(home, 1_000_000, 300_000, 0, 'mfj')
    expect(r.netProceeds).toBeCloseTo(930_000, 6)
    expect(r.gain).toBeCloseTo(130_000, 6) // 930k - 300k - 500k
    expect(r.stillOwned).toBe(false)
  })
  test('single filer exclusion is $250k', () =>
    expect(sellProperty(home, 1_000_000, 300_000, 0, 'single').gain).toBeCloseTo(380_000, 6))
  test('downsizing keeps a replacement home', () => {
    const r = sellProperty(home, 600_000, 200_000, 350_000, 'mfj')
    expect(r.netProceeds).toBeCloseTo(208_000, 6)
    expect(r.stillOwned).toBe(true)
    expect(r.newValue).toBe(350_000)
  })
  test('the mortgage is paid from the proceeds; the gain is unchanged', () => {
    const r = sellProperty(home, 600_000, 200_000, 0, 'mfj', 150_000)
    expect(r.netProceeds).toBeCloseTo(558_000 - 150_000, 6)
    expect(r.gain).toBe(sellProperty(home, 600_000, 200_000, 0, 'mfj').gain)
  })
})

describe('properties in the path', () => {
  test('home equity counts in terminal wealth but not liquid savings', () => {
    // A home with no loan or costs: equity counts, liquid savings are untouched.
    const withHome = run((f) => {
      const h = f.scenarios[0]!.home!
      h.sale.mode = 'none'
      h.mortgage = undefined
      h.costs = { propertyTax: 0, insurance: 0, maintenance: 0 }
    })
    const noHome = run((f) => {
      f.scenarios[0]!.home = undefined
    })
    expect(withHome.rows[0]!.homeEquity).toBeCloseTo(450_000 * 1.03 * 0.93, 0)
    const withLoan = run((f) => {
      f.scenarios[0]!.home!.sale.mode = 'none'
    })
    const mg = withLoan.prep.properties[0]!.mortgage!
    expect(withLoan.rows[0]!.homeEquity).toBeCloseTo(450_000 * 1.03 * 0.93 - mortgageBalance(mg, parseYM('2027-12')), 0)
    expect(withHome.rows.at(-1)!.liquid).toBeCloseTo(noHome.rows.at(-1)!.liquid, -2)
  })

  test('housing: mortgage payments to the payoff month plus inflation-indexed costs', () => {
    const { rows, prep } = run((f) => {
      f.scenarios[0]!.home!.sale.mode = 'none'
      f.scenarios[0]!.assumptions.inheritancesEnabled = false // no lake cabin costs
    })
    const pay = prep.properties[0]!.mortgage!.payment
    expect(pay).toBeCloseTo(1800, 0)
    const costs = 3200 + 2400 + 4500
    expect(row(rows, 2027).housing).toBeCloseTo(12 * pay + costs, 6)
    // Eight payments in the payoff year (through August 2031), the last only what is owed; none after.
    const mg = prep.properties[0]!.mortgage!
    expect(mg.payoff).toBe(parseYM('2031-08'))
    const last = mortgageBalance(mg, parseYM('2031-07')) * (1 + mg.i)
    expect(last).toBeLessThanOrEqual(pay)
    const r31 = row(rows, 2031)
    expect(r31.housing).toBeCloseTo(7 * pay + last + costs * r31.price, 6)
    const r32 = row(rows, 2032)
    expect(r32.housing).toBeCloseTo(costs * r32.price, 6)
  })

  test('downsizing: loan and replacement paid from proceeds, then reduced costs and no mortgage', () => {
    const sale = (replacementCost: number) =>
      run((f) => {
        f.scenarios[0]!.home!.sale = {
          mode: 'planned',
          date: '2029-06',
          liquidFloor: 0,
          sellingCostPct: 0.07,
          replacementCost,
        }
      })
    const { rows, prep } = sale(250_000)
    const r = row(rows, 2029)
    const costs = 3200 * 0.6 + 2400 * 0.7 + 4500 * 0.5
    expect(r.housing).toBeCloseTo(costs * r.price, 6)
    expect(r.homeEquity).toBeCloseTo(250_000 * r.price * 1.03 * 0.93, 0)
    // Cash from the sale: value net of selling costs, less the loan and the replacement home.
    const keep = sale(0)
    const taxable = prep.accounts.findIndex((a) => a.kind === 'taxable')
    const extra = row(keep.rows, 2029).endBalances[taxable]! - r.endBalances[taxable]!
    expect(extra).toBeGreaterThan(250_000 * r.price * 0.9)
    const r28 = row(rows, 2028)
    const value28 = (r28.homeEquity! + mortgageBalance(prep.properties[0]!.mortgage!, parseYM('2028-12'))) / 0.93
    expect(value28).toBeGreaterThan(450_000)
  })

  test('a loan still owed at the end reduces home equity', () => {
    const { rows, prep } = run((f) => {
      const h = f.scenarios[0]!.home!
      h.sale.mode = 'none'
      h.mortgage = { balance: 300_000, asOf: '2026-12', rate: 0.06, payment: 1616.09 }
    })
    const last = rows.at(-1)!
    const owed = mortgageBalance(prep.properties[0]!.mortgage!, parseYM(`${last.year}-12`))
    expect(owed).toBeGreaterThan(0)
    const value = last.homeEquity! + owed
    expect(value / 0.93).toBeGreaterThan(450_000)
    const noLoan = run((f) => {
      const h = f.scenarios[0]!.home!
      h.sale.mode = 'none'
      h.mortgage = undefined
    })
    expect(noLoan.rows.at(-1)!.homeEquity! - last.homeEquity!).toBeCloseTo(owed, 0)
  })

  test('backstop sale when liquid savings are below the floor: mortgage paid off, proceeds to taxable', () => {
    const { rows, prep } = run((f) => {
      f.scenarios[0]!.home!.sale = {
        mode: 'backstop',
        liquidFloor: 5_000_000,
        sellingCostPct: 0.07,
        replacementCost: 0,
      }
    })
    const r = row(rows, 2027)
    expect(r.homeEquity).toBe(0)
    const taxable = prep.accounts.findIndex((a) => a.kind === 'taxable')
    // Proceeds: 450,000 x 0.93 less the ~$92k loan.
    expect(r.endBalances[taxable]).toBeGreaterThan(300_000 + 300_000)
    // No mortgage or home costs from 2027 on.
    expect(r.housing).toBe(0)
    expect(r.expenses).toBeLessThan(72_000 + 1)
  })

  test('kept inherited real estate: carrying costs while owned, then a planned sale', () => {
    const { rows } = run(() => {})
    const received = rows.find((r) => (r.inheritances ?? 0) > 0)!
    expect(received.homeEquity ?? 0).toBeGreaterThan(450_000) // home + cabin
    const before = row(rows, 2037)
    const after = row(rows, 2038)
    expect(before.homeEquity ?? 0).toBeGreaterThan(after.homeEquity ?? 0)
    expect(after.taxableIncome).toBeGreaterThan(before.taxableIncome) // gain over the stepped-up basis
  })

  test('sell on receipt puts the net value in taxable', () => {
    const { rows } = run((f) => {
      f.scenarios[0]!.inheritances[0]!.realEstate[0]!.disposition = 'sell_on_receipt'
      f.scenarios[0]!.home!.sale.mode = 'none'
    })
    const received = rows.find((r) => (r.inheritances ?? 0) > 0)!
    const prev = rows[rows.indexOf(received) - 1]!
    expect((received.homeEquity ?? 0) - (prev.homeEquity ?? 0) * 1.03).toBeLessThan(1)
  })
})

describe('HSA contributions', () => {
  test('contributions until Medicare raise the HSA and lower taxable income', () => {
    const contrib = (amount: number) =>
      run((f) => {
        const hsa = f.scenarios[0]!.accounts.find((a) => a.type === 'hsa')!
        if (hsa.type === 'hsa') {
          hsa.owner = 'spouse'
          hsa.annualContribution = amount
        }
      })
    const a = contrib(0)
    const b = contrib(8000)
    const idx = a.prep.accounts.findIndex((x) => x.kind === 'hsa')
    const r0a = a.rows[0]!
    const r0b = b.rows[0]!
    expect(r0b.endBalances[idx]! - r0a.endBalances[idx]!).toBeGreaterThan(7900)
    expect(r0b.taxableIncome).toBeLessThan(r0a.taxableIncome + 1)
    // The spouse turns 65 in February 2028: one month of contributions that year.
    expect(b.rows[1]!.expenses - a.rows[1]!.expenses).toBeCloseTo((8000 * 1.025) / 12, 0)
  })
})
