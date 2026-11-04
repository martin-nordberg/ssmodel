// Typed accessors over the versioned rule tables in data/rules [NFR-ARCH-4]. Years past the latest table are
// projected by the caller-supplied price factor and flagged as projected [FR-DATA-2].
import federalJson from '../../../data/rules/federalTax.json'
import lifeJson from '../../../data/rules/lifeTable.json'
import medicareJson from '../../../data/rules/medicare.json'
import rmdJson from '../../../data/rules/rmd.json'
import scJson from '../../../data/rules/scTax.json'
import ssaJson from '../../../data/rules/ssa.json'

export type FilingStatus = 'mfj' | 'single'
export type Projected<T> = { value: T; tableYear: number; projected: boolean }

const numKeyed = <V>(o: Record<string, V>): Map<number, V> =>
  new Map(Object.entries(o).map(([k, v]) => [Number(k), v] as [number, V]))

function latestAtOrBefore<V>(m: Map<number, V>, year: number): [number, V] {
  let best: number | undefined
  for (const y of m.keys()) if (y <= year && (best === undefined || y > best)) best = y
  if (best === undefined) best = Math.min(...m.keys())
  return [best, m.get(best)!]
}

// ---------- SSA ----------

const awiTable = numKeyed(ssaJson.awi)
const taxableMaxTable = numKeyed(ssaJson.taxableMax)
const colaTable = numKeyed(ssaJson.cola)
const earningsTestTable = numKeyed(ssaJson.earningsTest)

export const ssaRules = {
  latestAwiYear: Math.max(...awiTable.keys()),
  latestColaYear: Math.max(...colaTable.keys()),
  latestTaxableMaxYear: Math.max(...taxableMaxTable.keys()),
  latestEarningsTestYear: Math.max(...earningsTestTable.keys()),
  /** Published AWI for a year, or undefined when not yet published. */
  awi: (year: number): number | undefined => awiTable.get(year),
  taxableMax: (year: number): number | undefined => taxableMaxTable.get(year),
  /** COLA first payable in January of `year` (applies to December of year-1 benefits). */
  cola: (year: number): number | undefined => colaTable.get(year),
  bendPointBase: ssaJson.bendPointBase,
  earningsTest(year: number, priceFactor = 1): Projected<{ underFra: number; fraYear: number }> {
    const [tableYear, v] = latestAtOrBefore(earningsTestTable, year)
    const f = year > tableYear ? priceFactor : 1
    return { value: { underFra: v.underFra * f, fraYear: v.fraYear * f }, tableYear, projected: year > tableYear }
  },
  /** Full retirement age in months for a birth year (SSA uses Jan 1 births as the prior year). */
  fraMonths(birthYear: number): number {
    const entries = Object.entries(ssaJson.fraByBirthYear)
      .map(([y, v]) => [Number(y), v] as const)
      .sort((a, b) => a[0] - b[0])
    let fra = entries[0]![1]
    for (const [y, v] of entries) if (birthYear >= y) fra = v
    return fra[0]! * 12 + fra[1]!
  },
  /** Survivor FRA in months (the survivor schedule lags the retirement schedule by two years). */
  survivorFraMonths(birthYear: number): number {
    const entries = Object.entries(ssaJson.survivorFraByBirthYear)
      .map(([y, v]) => [Number(y), v] as const)
      .sort((a, b) => a[0] - b[0])
    let fra = entries[0]![1]
    for (const [y, v] of entries) if (birthYear >= y) fra = v
    return fra[0]! * 12 + fra[1]!
  },
  survivorReductionAt60: ssaJson.survivorReductionAt60,
  trusteesPreset(name: string): { effective: string; payablePercent: number }[] {
    return (ssaJson.trusteesPresets as Record<string, { effective: string; payablePercent: number }[]>)[name] ?? []
  },
}

// ---------- federal tax ----------

type FederalYear = (typeof federalJson.years)['2026']
const federalTable = numKeyed(federalJson.years as Record<string, FederalYear>)

export type FederalParams = {
  brackets: Record<FilingStatus, [number, number][]>
  standardDeduction: Record<FilingStatus, number>
  additional65: Record<FilingStatus, number>
  ltcg: Record<FilingStatus, [number, number]>
}

export const federalRules = {
  latestYear: Math.max(...federalTable.keys()),
  params(year: number, priceFactor = 1): Projected<FederalParams> {
    const [tableYear, v] = latestAtOrBefore(federalTable, year)
    const f = year > tableYear ? priceFactor : 1
    const scaleBrackets = (b: number[][]) => b.map(([lo, r]) => [lo! * f, r!] as [number, number])
    return {
      value: {
        brackets: { mfj: scaleBrackets(v.brackets.mfj), single: scaleBrackets(v.brackets.single) },
        standardDeduction: { mfj: v.standardDeduction.mfj * f, single: v.standardDeduction.single * f },
        additional65: { mfj: v.additional65.mfj * f, single: v.additional65.single * f },
        ltcg: {
          mfj: [v.ltcg.mfj[0]! * f, v.ltcg.mfj[1]! * f],
          single: [v.ltcg.single[0]! * f, v.ltcg.single[1]! * f],
        },
      },
      tableYear,
      projected: year > tableYear,
    }
  },
  ssTaxation: federalJson.unindexed.ssTaxation as Record<FilingStatus, [number, number]>,
  niit: federalJson.unindexed.niit,
  seniorDeduction: federalJson.unindexed.seniorDeduction,
  payroll: federalJson.unindexed.payroll,
}

// ---------- Medicare ----------

type MedicareYear = (typeof medicareJson.years)['2026']
const medicareTable = numKeyed(medicareJson.years as Record<string, MedicareYear>)

export type MedicareParams = {
  partBStandardMonthly: number
  partDBaseMonthly: number
  thresholds: Record<FilingStatus, number[]>
  partBMonthlyTotal: number[]
  partDMonthlyAdd: number[]
}

export const medicareRules = {
  latestYear: Math.max(...medicareTable.keys()),
  /**
   * `priceFactor` scales IRMAA thresholds (CPI-U indexed); `premiumFactor` scales premiums, which follow
   * Medicare cost growth rather than CPI.
   */
  params(year: number, priceFactor = 1, premiumFactor = 1): Projected<MedicareParams> {
    const [tableYear, v] = latestAtOrBefore(medicareTable, year)
    const projected = year > tableYear
    const f = projected ? priceFactor : 1
    const p = projected ? premiumFactor : 1
    return {
      value: {
        partBStandardMonthly: v.partBStandardMonthly * p,
        partDBaseMonthly: v.partDBaseMonthly * p,
        thresholds: {
          mfj: v.irmaa.thresholds.mfj.map((t) => t * f),
          single: v.irmaa.thresholds.single.map((t) => t * f),
        },
        partBMonthlyTotal: v.irmaa.partBMonthlyTotal.map((t) => t * p),
        partDMonthlyAdd: v.irmaa.partDMonthlyAdd.map((t) => t * p),
      },
      tableYear,
      projected,
    }
  },
}

// ---------- South Carolina ----------

type ScYear = (typeof scJson.years)['2026']
const scTable = numKeyed(scJson.years as Record<string, ScYear>)

export const scRules = {
  latestYear: Math.max(...scTable.keys()),
  /** Bracket and SCIAD amounts are indexed (S.C. Code 12-6-520); deduction amounts are fixed in statute. */
  params(year: number, priceFactor = 1): Projected<ScYear> {
    const [tableYear, v] = latestAtOrBefore(scTable, year)
    const f = year > tableYear ? priceFactor : 1
    if (f === 1) return { value: v, tableYear, projected: false }
    const s = v.sciad
    return {
      value: {
        ...v,
        rates: { ...v.rates, bracket: v.rates.bracket * f, highSubtract: v.rates.highSubtract * f },
        sciad: {
          amount: { mfj: s.amount.mfj * f, single: s.amount.single * f },
          phaseoutStart: { mfj: s.phaseoutStart.mfj * f, single: s.phaseoutStart.single * f },
          phaseoutDenominator: { mfj: s.phaseoutDenominator.mfj * f, single: s.phaseoutDenominator.single * f },
        },
      },
      tableYear,
      projected: true,
    }
  },
}

// ---------- RMD and life expectancy ----------

const uniformTable = numKeyed(rmdJson.uniformLifetime)
const singleTable = numKeyed(rmdJson.singleLife)

export const rmdRules = {
  rmdAge(birthYear: number): number {
    for (const r of rmdJson.rmdAgeByBirthYear) if (birthYear <= r.through) return r.age
    return 75
  },
  /** Uniform Lifetime Table divisor (Table III). Ages below the table use the first entry. */
  uniformDivisor(age: number): number {
    const a = Math.min(Math.max(age, 72), 120)
    return uniformTable.get(a)!
  },
  /** Single Life Expectancy (Table I). */
  singleLife(age: number): number {
    const a = Math.min(Math.max(Math.floor(age), 0), 120)
    return singleTable.get(a)!
  },
}

// ---------- SSA period life table ----------

export const lifeTable = {
  effectiveYear: lifeJson.effectiveYear,
  /** Survivors l(x) per 100,000 births. */
  lx(sex: 'male' | 'female'): readonly number[] {
    return sex === 'male' ? lifeJson.male : lifeJson.female
  },
}
