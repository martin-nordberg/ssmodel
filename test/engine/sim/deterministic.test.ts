import { describe, expect, test } from 'bun:test'
import { parseYM } from '@/engine/core/dates.ts'
import { prepare } from '@/engine/model/prepare.ts'
import { runDeterministic } from '@/engine/sim/deterministic.ts'
import { parseHouseholdYaml } from '@/schema/yamlio.ts'

async function load(name: string) {
  const r = parseHouseholdYaml(await Bun.file(new URL(`../../fixtures/${name}`, import.meta.url)).text())
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.value
}

const round = (x: unknown): unknown =>
  typeof x === 'number'
    ? Math.round(x * 100) / 100
    : Array.isArray(x)
      ? x.map(round)
      : x && typeof x === 'object'
        ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, round(v)]))
        : x

// Golden files [NFR-TEST-2]: regenerate deliberately with UPDATE_GOLDEN=1 bun test.
async function golden(name: string, value: unknown) {
  const file = Bun.file(new URL(`../../fixtures/golden/${name}.json`, import.meta.url))
  const json = `${JSON.stringify(round(value), null, 1)}\n`
  if (process.env.UPDATE_GOLDEN || !(await file.exists())) {
    await Bun.write(file, json)
    return
  }
  expect(json).toBe(await file.text())
}

const full = prepare(await load('full.yaml'))

describe('deterministic path', () => {
  test('golden: full fixture at FRA', async () => {
    const r = runDeterministic(full, full.people[0].age.fraMonth)
    await golden('full-fra', { summary: r.summary, rows: r.rows })
  })

  test('golden: minimal fixture', async () => {
    const min = prepare(await load('minimal.yaml'))
    const r = runDeterministic(min, min.candidates[0]!)
    await golden('minimal-first', { summary: r.summary, rows: r.rows })
  })

  test('cash-flow identity holds every year', () => {
    for (const claim of [full.candidates[0]!, full.people[0].age.fraMonth, full.candidates.at(-1)!]) {
      const r = runDeterministic(full, claim)
      for (const row of r.rows!) {
        const inflows = row.ss[0] + row.ss[1] + row.earnings + row.otherIncome + row.required.reduce((a, b) => a + b, 0)
        const drawn = row.withdrawals.reduce((a, b) => a + b, 0)
        const spending = row.expenses + row.healthcare
        // inflows (incl. HSA medical) + withdrawals - tax = spending + surplus - shortfall
        expect(Math.abs(inflows + drawn - row.totalTax - (spending + row.surplus - row.shortfall))).toBeLessThan(2)
        for (const b of row.endBalances) expect(b).toBeGreaterThanOrEqual(0)
      }
    }
  })

  test('the inherited IRA is empty by its 2033 deadline', () => {
    const r = runDeterministic(full, full.people[0].age.fraMonth)
    const idx = full.accounts.findIndex((a) => a.kind === 'inherited_traditional')
    const row2033 = r.rows!.find((x) => x.year === 2033)!
    expect(row2033.endBalances[idx]).toBeLessThan(1)
  })

  test('the trust-fund haircut cuts benefits from 2033', () => {
    const r = runDeterministic(full, full.people[0].age.fraMonth)
    const ss = (y: number) => r.rows!.find((x) => x.year === y)!.ss[0]
    expect(ss(2033) / ss(2032)).toBeCloseTo(0.78 * 1.025, 2)
  })

  test('survivor gets the larger benefit after the first death', () => {
    const r = runDeterministic(full, full.candidates.at(-1)!) // claim at 70
    const after = r.rows!.find((x) => !x.alive[0] && x.alive[1])!
    const beforeP = r.rows!.find((x) => x.year === after.year - 2)!
    // Her benefit after his death is close to his (COLA-adjusted) benefit.
    expect(after.ss[1] / (beforeP.ss[0] * 1.025 ** 2)).toBeGreaterThan(0.95)
    expect(after.status).toBe('single')
  })

  test('claiming later raises lifetime SS in a long-lived household', () => {
    const early = runDeterministic(full, full.candidates[0]!, false).summary
    const late = runDeterministic(full, full.candidates.at(-1)!, false).summary
    expect(late.lifetimeSsReal).toBeGreaterThan(early.lifetimeSsReal)
  })

  test('earnings test withholds benefits when working before FRA', async () => {
    const f = structuredClone(await load('full.yaml'))
    f.household.people.primary.earnings = [{ year: 2027, wages: 80000, selfEmployment: 0 }]
    const p = prepare(f)
    const r = runDeterministic(p, parseYM('2027-02'))
    const row = r.rows!.find((x) => x.year === 2027)!
    expect(row.monthsWithheld).toBeGreaterThan(0)
  })
})
