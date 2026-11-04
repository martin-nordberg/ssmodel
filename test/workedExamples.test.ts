// Asserts every figure in docs/worked-examples.md [NFR-TEST-6].
import { describe, expect, test } from 'bun:test'
import { inheritedRequired, inheritedRules, inheritedScheduled } from '@/engine/accounts/inheritedIra.ts'
import { lifetimeRmd } from '@/engine/accounts/rmd.ts'
import { parseYM, SsaAge } from '@/engine/core/dates.ts'
import { medicareRules, ssaRules } from '@/engine/rules/tables.ts'
import { monthlyBenefit, ownBenefitFactor } from '@/engine/ss/ownBenefit.ts'
import { bendPoints, colaWithFallback, PiaCalculator, projectedAwi } from '@/engine/ss/pia.ts'
import { spousalExcess } from '@/engine/ss/spouse.ts'
import { emptyFederalInput, federalTax } from '@/engine/tax/federal.ts'
import { irmaaTier, monthlyPremiums } from '@/engine/tax/irmaa.ts'
import { scTax } from '@/engine/tax/sc.ts'
import { solveWithdrawals } from '@/engine/withdraw/solver.ts'

const awi = projectedAwi(0.04)
const cola = colaWithFallback(() => 0)
const person = {
  birthDate: '1961-05-14',
  record: Array.from({ length: 40 }, (_, i) => ({ year: 1983 + i, amount: ssaRules.awi(1983 + i)! })),
  projected: [],
}

describe('1. PIA from an earnings record', () => {
  const calc = new PiaCalculator(person, awi)
  test('eligibility and indexing years', () => {
    expect(calc.eligibilityYear).toBe(2023)
    expect(calc.indexingYear).toBe(2021)
  })
  test('AIME, bend points, PIA', () => {
    expect(63795.13 + 34 * 60575.07).toBeCloseTo(2123347.51, 2)
    expect(calc.aime(2022)).toBe(5055)
    expect(bendPoints(2023, awi)).toEqual([1115, 6721])
    expect(calc.basePia(2022)).toBe(2264.3)
  })
  test('COLA table', () => {
    expect(calc.piaInYear(2024, cola)).toBe(2336.7)
    expect(calc.piaInYear(2025, cola)).toBe(2395.1)
    expect(calc.piaInYear(2026, cola)).toBe(2462.1)
    expect(calc.piaInYear(2027, cola)).toBe(2550.7)
  })
})

describe('2. Benefit at a claiming age', () => {
  const age = new SsaAge('1961-05-14')
  test('15 months early', () => {
    const f = ownBenefitFactor(parseYM('2027-02'), age)
    expect(age.fraMonth - parseYM('2027-02')).toBe(15)
    expect(f).toBeCloseTo(0.916667, 6)
    expect(monthlyBenefit(2550.7, f)).toBe(2338)
  })
  test('at 70', () => expect(ownBenefitFactor(parseYM('2031-05'), age)).toBeCloseTo(1.24, 10))
})

test('3. Spousal excess', () => {
  const s = new SsaAge('1963-02-02')
  expect(spousalExcess(3000, 1000, s.fraMonth - 24, s)).toBeCloseTo(416.67, 2)
})

describe('4. One year of federal and SC tax', () => {
  const fed = federalTax({
    ...emptyFederalInput(2026, 'mfj'),
    count65: 2,
    taxableMax: 184500,
    socialSecurity: 50000,
    ordinary: 80000,
    qualifiedDividends: 5000,
    ltcg: 10000,
  })
  test('federal', () => {
    expect(fed.provisionalIncome).toBe(120000)
    expect(fed.taxableSocialSecurity).toBe(42500)
    expect(fed.agi).toBe(137500)
    expect(fed.deduction).toBe(47500)
    expect(fed.taxableIncome).toBe(90000)
    expect(fed.ordinaryTax).toBeCloseTo(8504, 6)
    expect(fed.capitalGainsTax).toBe(0)
  })
  test('South Carolina', () => {
    const sc = scTax({
      year: 2026,
      status: 'mfj',
      priceFactor: 1,
      federalAgi: fed.agi,
      taxableSocialSecurity: fed.taxableSocialSecurity,
      ltcg: 10000,
      people: [
        { retirementIncome: 40000, is65: true },
        { retirementIncome: 40000, is65: true },
      ],
    })
    expect(sc.subtractions).toBe(76900)
    expect(sc.sciad).toBe(14320)
    expect(sc.taxableIncome).toBe(46280)
    expect(sc.tax).toBeCloseTo(1445.19, 2)
  })
})

test('5. IRMAA', () => {
  const m = medicareRules.params(2026).value
  const tier = irmaaTier(230000, 'mfj', m)
  expect(tier).toBe(1)
  const p = monthlyPremiums(tier, m)
  expect(p.partB - m.partBStandardMonthly).toBeCloseTo(81.2, 6)
  expect(p.partDSurcharge).toBe(14.5)
  expect(12 * (p.partB - m.partBStandardMonthly + p.partDSurcharge)).toBeCloseTo(1148.4, 6)
})

test('6. Lifetime RMD', () => {
  expect(lifetimeRmd('1955-03-01', 2027, 500000)).toBe(0)
  expect(lifetimeRmd('1955-03-01', 2028, 500000)).toBeCloseTo(18867.92, 2)
})

test('7. Inherited IRA schedule', () => {
  const r = inheritedRules({
    flavor: 'traditional',
    decedentBirthDate: '1938-07-01',
    decedentDeathDate: '2023-04-15',
    beneficiaryBirthDate: '1963-02-02',
    beneficiaryClass: 'designated',
  })
  expect(r.deadlineYear).toBe(2033)
  expect(r.initialDivisor).toBe(26.2)
  expect(inheritedRequired(r, 2027, 210000)).toBeCloseTo(9051.72, 2)
  expect(inheritedScheduled(r, 'even', 2027, 210000)).toBeCloseTo(30000, 6)
})

test('8. One withdrawal solve', () => {
  const r = solveWithdrawals({
    accounts: [{ kind: 'traditional', owner: 0, available: 1e6, gainFrac: 0, reserve: 0, penaltyRate: 0 }],
    strategy: { kind: 'conventional' },
    inflows: 40000,
    spending: 80000,
    tax: (d) => {
      const f = federalTax({
        ...emptyFederalInput(2026, 'mfj'),
        count65: 2,
        taxableMax: 184500,
        socialSecurity: 40000,
        ordinary: d.ordinaryByPerson[0],
      })
      return { total: f.total, ordinaryTaxable: f.ordinaryTaxable, magi: f.magi }
    },
  })
  expect(r.withdrawals[0]).toBeCloseTo(41484.66, 0)
  expect(r.tax.total).toBeCloseTo(1484.66, 0)
})
