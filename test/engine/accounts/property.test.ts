import { describe, expect, test } from 'bun:test'
import { type EngineProperty, sellProperty } from '@/engine/accounts/property.ts'
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
})

describe('properties in the path', () => {
  test('home equity counts in terminal wealth but not liquid savings', () => {
    const withHome = run((f) => {
      f.scenarios[0]!.home!.sale.mode = 'none'
    })
    const noHome = run((f) => {
      f.scenarios[0]!.home = undefined
    })
    const r0 = withHome.rows[0]!
    expect(r0.homeEquity).toBeCloseTo(450_000 * 1.03 * 0.93, 0)
    expect(withHome.rows.at(-1)!.liquid).toBeCloseTo(noHome.rows.at(-1)!.liquid, -2)
  })

  test('backstop sale when liquid savings are below the floor: mortgage stops, proceeds to taxable', () => {
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
    expect(r.endBalances[taxable]).toBeGreaterThan(300_000 + 400_000)
    // The $21,600 mortgage is gone from 2027 on.
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
