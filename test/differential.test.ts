// Differential tests [NFR-TEST-7]: the production engine's deterministic path must match the independent
// reference engine on the fixtures and on random synthetic households.
import { describe, expect, test } from 'bun:test'
import fc from 'fast-check'
import { formatYM } from '@/engine/core/dates.ts'
import { prepare } from '@/engine/model/prepare.ts'
import { runDeterministic } from '@/engine/sim/deterministic.ts'
import { CURRENT_SCHEMA_VERSION, HouseholdFile } from '@/schema/model.ts'
import { parseHouseholdYaml } from '@/schema/yamlio.ts'
import { referenceRun } from './reference/referenceEngine.ts'

function compare(file: HouseholdFile, claimIndexes: number[]) {
  const prep = prepare(file)
  for (const ci of claimIndexes) {
    const claim = prep.candidates[Math.min(ci, prep.candidates.length - 1)]
    if (claim === undefined) continue
    const prod = runDeterministic(prep, claim).rows!
    const ref = referenceRun(file, formatYM(claim))
    expect(prod.length).toBe(ref.length)
    for (let i = 0; i < prod.length; i++) {
      const p = prod[i]!
      const r = ref[i]!
      const ctx = `${formatYM(claim)} year ${p.year}`
      expect([ctx, p.ss[0]]).toEqual([ctx, expect.closeTo(r.ss[0], 2)])
      expect([ctx, p.ss[1]]).toEqual([ctx, expect.closeTo(r.ss[1], 2)])
      // Both engines solve to about $1 of withdrawal; at tax kinks that can move tax by a few dollars.
      expect([ctx, Math.abs(p.totalTax - r.totalTax) < 5 + 2e-4 * r.totalTax]).toEqual([ctx, true])
      const tol = 5 * (i + 1) + 1e-5 * r.liquid
      expect([ctx, Math.abs(p.liquid - r.liquid) < tol]).toEqual([ctx, true])
      expect([ctx, Math.abs(p.shortfall - r.shortfall) < tol]).toEqual([ctx, true])
    }
  }
}

describe('production vs reference engine', () => {
  test('full fixture at several claiming dates', async () => {
    const r = parseHouseholdYaml(await Bun.file(new URL('./fixtures/full.yaml', import.meta.url)).text())
    if (!r.ok) throw new Error('fixture')
    // The reference does not model M3 features; strip them.
    const f = structuredClone(r.value)
    const s = f.scenarios[0]!
    s.inheritances = []
    s.home = undefined
    s.income.annuities = []
    s.strategy.rothConversions.enabled = false
    compare(f, [0, 5, 10, 17])
  })

  const month = fc.integer({ min: 1, max: 12 }).map((m) => String(m).padStart(2, '0'))
  const day = fc.integer({ min: 1, max: 28 }).map((d) => String(d).padStart(2, '0'))
  const birth = (lo: number, hi: number) =>
    fc.tuple(fc.integer({ min: lo, max: hi }), month, day).map(([y, m, d]) => `${y}-${m}-${d}`)
  const money = (max: number) => fc.integer({ min: 0, max }).map((x) => x * 1000)

  const household = fc
    .record({
      pBirth: birth(1958, 1968),
      sBirth: birth(1958, 1966),
      sMonthly: fc.integer({ min: 600, max: 2600 }),
      earnLevel: fc.integer({ min: 20, max: 200 }),
      workYears: fc.integer({ min: 0, max: 3 }),
      wages: money(120),
      trad: money(1500),
      roth: money(500),
      taxable: money(800),
      basisFrac: fc.double({ min: 0.2, max: 1, noNaN: true }),
      cash: money(100),
      inherited: money(400),
      living: fc.integer({ min: 40, max: 160 }).map((x) => x * 1000),
      strategy: fc.constantFrom('conventional', 'bracket_fill', 'proportional'),
      bracket: fc.constantFrom(0.12, 0.22),
      irmaaCap: fc.integer({ min: 0, max: 5 }),
      haircut: fc.constantFrom('none', 'trustees_2026_oasi'),
      deathP: fc.integer({ min: 72, max: 100 }),
      deathS: fc.integer({ min: 72, max: 100 }),
      schedule: fc.constantFrom('even', 'back_loaded'),
    })
    .map((h) => {
      const pY = Number(h.pBirth.slice(0, 4))
      const sY = Number(h.sBirth.slice(0, 4))
      const claimY = Math.min(Math.max(sY + 62, 2020), 2026)
      const raw = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        household: {
          people: {
            primary: {
              birthDate: h.pBirth,
              earningsRecord: Array.from({ length: 30 }, (_, i) => ({
                year: 1990 + i,
                amount: h.earnLevel * 500 * 1.03 ** i,
              })),
              earnings: Array.from({ length: h.workYears }, (_, i) => ({ year: 2027 + i, wages: h.wages })),
            },
            spouse: {
              birthDate: h.sBirth,
              ss: { currentMonthly: h.sMonthly, claimedDate: `${claimY}-${h.sBirth.slice(5, 7)}` },
            },
          },
        },
        scenarios: [
          {
            id: 'r',
            name: 'random',
            trustFund: { preset: h.haircut },
            accounts: [
              { type: 'traditional_ira', owner: 'primary', balance: h.trad },
              { type: 'roth_ira', owner: 'spouse', balance: h.roth, return: { preset: 'aggressive' } },
              { type: 'taxable', balance: h.taxable, costBasis: h.taxable * h.basisFrac },
              { type: 'cash', balance: h.cash, targetMonths: 6 },
              {
                type: 'inherited_ira',
                beneficiary: 'spouse',
                balance: h.inherited,
                decedentBirthDate: '1940-03-03',
                decedentDeathDate: '2024-08-01',
                schedule: h.schedule,
              },
            ],
            expenses: { items: [{ label: 'Living', annual: h.living, start: '2027-01', perPerson: true }] },
            healthcare: {
              pre65: { spouse: { cobraMonthly: 900 } },
              medicare: { medigapAnnual: 2000, outOfPocket: 1000 },
            },
            strategy: { withdrawal: h.strategy, targetBracket: h.bracket, irmaaCapTier: h.irmaaCap },
            assumptions: { mortality: { mode: 'fixed', deathAge: { primary: h.deathP, spouse: h.deathS } } },
            simulation: { maxAge: 100 },
          },
        ],
      }
      void pY
      return HouseholdFile.parse(raw)
    })

  test('random synthetic households', () => {
    fc.assert(
      fc.property(household, fc.integer({ min: 0, max: 32 }), (file, ci) => {
        compare(file, [ci])
      }),
      { numRuns: Number(process.env.DIFF_RUNS ?? 500), seed: 20270101 },
    )
  })
})
