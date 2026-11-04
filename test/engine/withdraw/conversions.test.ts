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
