import { describe, expect, test } from 'bun:test'
import { prepare } from '@/engine/model/prepare.ts'
import { federalRules } from '@/engine/rules/tables.ts'
import { runDeterministic } from '@/engine/sim/deterministic.ts'
import type { HouseholdFile } from '@/schema/model.ts'
import { parseHouseholdYaml } from '@/schema/yamlio.ts'

const base = await (async () => {
  const r = parseHouseholdYaml(await Bun.file(new URL('../../fixtures/full.yaml', import.meta.url)).text())
  if (!r.ok) throw new Error('fixture')
  return r.value
})()

function run(edit: (f: HouseholdFile) => void, claimIndex = -1) {
  const f = structuredClone(base)
  const s = f.scenarios[0]!
  s.inheritances = []
  s.home = undefined
  edit(f)
  const p = prepare(f)
  const claim = claimIndex < 0 ? p.candidates.at(claimIndex)! : p.candidates[claimIndex]!
  return { prep: p, rows: runDeterministic(p, claim).rows!, claim }
}

describe('Roth conversions [FR-WD-4]', () => {
  const off = run((f) => {
    f.scenarios[0]!.strategy.rothConversions.enabled = false
  })
  const on = run((f) => {
    const rc = f.scenarios[0]!.strategy.rothConversions
    rc.enabled = true
    rc.upToBracket = 0.22
    rc.irmaaCapTier = 5
    rc.until = 'claim'
  })

  test('convert in the years before claiming, not after', () => {
    const claimYear = Math.floor(on.claim / 12)
    const before = on.rows.filter((r) => r.year < claimYear)
    expect(before.every((r) => (r.conversions ?? 0) > 0)).toBe(true)
    expect(on.rows.filter((r) => r.year >= claimYear).every((r) => (r.conversions ?? 0) === 0)).toBe(true)
    expect(off.rows.every((r) => (r.conversions ?? 0) === 0)).toBe(true)
  })

  test('fills ordinary income to the top of the 22% bracket', () => {
    const r = on.rows[0]!
    const top = federalRules.params(2027, 1.025).value.brackets.mfj.find(([, rate]) => rate === 0.24)![0]
    expect(r.taxableIncome).toBeGreaterThan(top - 2000) // preferential income sits above ordinary
  })

  test('Roth grows, traditional shrinks, and the tax is paid from taxable', () => {
    const roth = on.prep.accounts.findIndex((a) => a.kind === 'roth' && a.owner === 0)
    const trad = on.prep.accounts.findIndex((a) => a.kind === 'traditional' && a.owner === 0)
    expect(on.rows[0]!.endBalances[roth]!).toBeGreaterThan(off.rows[0]!.endBalances[roth]! + 10_000)
    expect(on.rows[0]!.endBalances[trad]!).toBeLessThan(off.rows[0]!.endBalances[trad]!)
    expect(on.rows[0]!.totalTax).toBeGreaterThan(off.rows[0]!.totalTax)
  })

  test('cash-flow identity still holds', () => {
    for (const row of on.rows) {
      const inflows = row.ss[0] + row.ss[1] + row.earnings + row.otherIncome + row.required.reduce((a, b) => a + b, 0)
      const drawn = row.withdrawals.reduce((a, b) => a + b, 0)
      expect(
        Math.abs(inflows + drawn - row.totalTax - (row.expenses + row.healthcare + row.surplus - row.shortfall)),
      ).toBeLessThan(3)
    }
  })
})

describe('paying the conversion tax [Q-TAX-6]', () => {
  const conv = (basisFrac: number, cash?: number, off = false) =>
    run((f) => {
      const s = f.scenarios[0]!
      const rc = s.strategy.rothConversions
      rc.enabled = !off
      rc.upToBracket = 0.22
      rc.irmaaCapTier = 5
      rc.until = 'claim'
      for (const a of s.accounts) {
        if (a.type === 'taxable') a.costBasis = a.balance * basisFrac
        if (a.type === 'cash' && cash !== undefined) a.balance = cash
      }
    })
  const extraTax = (basisFrac: number) =>
    conv(basisFrac).rows[0]!.totalTax - conv(basisFrac, undefined, true).rows[0]!.totalTax

  test('selling low-basis shares to pay it costs more tax than full-basis shares', () => {
    const low = conv(0.2)
    const full = conv(1)
    expect(low.rows[0]!.conversions).toBeCloseTo(full.rows[0]!.conversions!, 0)
    expect(extraTax(0.2)).toBeGreaterThan(extraTax(1) + 100)
    // The realized gain shows up in AGI.
    expect(low.rows[0]!.agi).toBeGreaterThan(full.rows[0]!.agi)
  })

  test('cash above the reserve target pays before taxable', () => {
    const rich = conv(0.2, 2_000_000)
    const richOff = conv(0.2, 2_000_000, true)
    const taxable = rich.prep.accounts.findIndex((a) => a.kind === 'taxable')
    const cash = rich.prep.accounts.findIndex((a) => a.kind === 'cash')
    expect(rich.rows[0]!.conversions!).toBeGreaterThan(10_000)
    expect(rich.rows[0]!.withdrawals[taxable]).toBeCloseTo(richOff.rows[0]!.withdrawals[taxable]!, 6)
    expect(rich.rows[0]!.withdrawals[cash]! - richOff.rows[0]!.withdrawals[cash]!).toBeCloseTo(
      rich.rows[0]!.totalTax - richOff.rows[0]!.totalTax,
      0,
    )
  })
})

test('bracket-aware inherited schedule fills the target bracket and still empties by the deadline [FR-WD-2]', () => {
  const r = run((f) => {
    const s = f.scenarios[0]!
    s.strategy.rothConversions.enabled = false
    s.strategy.targetBracket = 0.22
    s.strategy.irmaaCapTier = 5
    for (const a of s.accounts) if (a.type === 'inherited_ira') a.schedule = 'bracket_aware'
  })
  const even = run((f) => {
    const s = f.scenarios[0]!
    s.strategy.rothConversions.enabled = false
    for (const a of s.accounts) if (a.type === 'inherited_ira') a.schedule = 'even'
  })
  const idx = r.prep.accounts.findIndex((a) => a.kind === 'inherited_traditional')
  expect(r.rows[0]!.withdrawals[idx]! + r.rows[0]!.required[idx]!).toBeGreaterThan(0)
  expect(r.rows.find((x) => x.year === 2033)!.endBalances[idx]).toBeLessThan(1)
  expect(r.rows[0]!.taxableIncome).toBeGreaterThan(even.rows[0]!.taxableIncome)
})

test('eligible designated beneficiary stretches withdrawals past ten years [FR-ACC-2, T3.8]', () => {
  const r = run((f) => {
    const s = f.scenarios[0]!
    s.strategy.withdrawal = 'conventional'
    for (const a of s.accounts)
      if (a.type === 'inherited_ira') {
        a.beneficiaryClass = 'eligible_designated'
        a.schedule = 'back_loaded'
      }
  })
  const idx = r.prep.accounts.findIndex((a) => a.kind === 'inherited_traditional')
  const after2033 = r.rows.find((x) => x.year === 2034)!
  // A designated beneficiary must be empty at the end of 2033; the stretch is not.
  expect(r.rows.find((x) => x.year === 2033)!.endBalances[idx]!).toBeGreaterThan(1)
  expect(after2033.required[idx]!).toBeGreaterThan(0)
})
