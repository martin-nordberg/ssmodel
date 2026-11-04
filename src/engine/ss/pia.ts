// Primary Insurance Amount from an earnings record [FR-SS-2, FR-SS-2a].
// Method: https://www.ssa.gov/oact/cola/piaformula.html and https://www.ssa.gov/oact/cola/Benefits.html
//  1. cap each year's earnings at the taxable maximum;
//  2. index years before the age-60 year by AWI[age-60 year] / AWI[year]; later years count at face value;
//  3. AIME = (sum of the highest 35 years) / 420, truncated to the dollar;
//  4. PIA = 90% / 32% / 15% of AIME across the bend points for the age-62 (eligibility) year, truncated to the dime;
//  5. COLAs apply from December of the eligibility year, each result truncated to the dime.
// Earnings in a year raise the PIA from January of the next year (automatic recomputation).
import { SsaAge, ymYear } from '../core/dates.ts'
import { federalRules, ssaRules } from '../rules/tables.ts'

export const truncDime = (x: number) => Math.floor(x * 10 + 1e-7) / 10

export type AwiFn = (year: number) => number
export type ColaFn = (payableYear: number) => number

/** Projects AWI past the latest published year at a constant nominal growth rate. */
export function projectedAwi(nominalGrowth: number): AwiFn {
  const last = ssaRules.latestAwiYear
  const base = ssaRules.awi(last)!
  return (year) => ssaRules.awi(year) ?? base * (1 + nominalGrowth) ** (year - last)
}

/** Taxable maximum for a year; years past the table follow the statutory AWI formula. */
export function taxableMax(year: number, awi: AwiFn): number {
  const known = ssaRules.taxableMax(year)
  if (known !== undefined) return known
  const last = ssaRules.latestTaxableMaxYear
  let prev = ssaRules.taxableMax(last)!
  for (let y = last + 1; y <= year; y++) {
    prev = Math.max(prev, Math.round((60600 * awi(y - 2)) / awi(1992) / 300) * 300)
  }
  return prev
}

export function bendPoints(eligibilityYear: number, awi: AwiFn): [number, number] {
  const { awiYear, first, second } = ssaRules.bendPointBase
  const ratio = awi(eligibilityYear - 2) / awi(awiYear)
  return [Math.round(first * ratio), Math.round(second * ratio)]
}

export function piaFromAime(aime: number, [b1, b2]: [number, number]): number {
  const raw = 0.9 * Math.min(aime, b1) + 0.32 * Math.max(0, Math.min(aime, b2) - b1) + 0.15 * Math.max(0, aime - b2)
  return truncDime(raw)
}

export type EarningsInput = {
  birthDate: string
  /** Taxed SS earnings by year from the statement. */
  record: { year: number; amount: number }[]
  /** Projected earnings; self-employment counts at 92.35% (net earnings from self-employment). */
  projected: { year: number; wages: number; selfEmployment: number }[]
}

/** Covered earnings by year: the statement record, overridden by projections for the same year. */
export function coveredEarnings(input: EarningsInput): Map<number, number> {
  const m = new Map<number, number>()
  for (const r of input.record) m.set(r.year, r.amount)
  const seFactor = federalRules.payroll.seNetFactor
  for (const p of input.projected) m.set(p.year, p.wages + p.selfEmployment * seFactor)
  return m
}

export class PiaCalculator {
  readonly age: SsaAge
  readonly eligibilityYear: number
  readonly indexingYear: number
  private readonly earnings: Map<number, number>
  private readonly awi: AwiFn
  private readonly baseCache = new Map<number, number>()

  constructor(input: EarningsInput, awi: AwiFn) {
    this.age = new SsaAge(input.birthDate)
    this.eligibilityYear = ymYear(this.age.attainMonth(62 * 12))
    this.indexingYear = this.eligibilityYear - 2
    this.earnings = coveredEarnings(input)
    this.awi = awi
  }

  /** AIME using earnings through `throughYear` inclusive. */
  aime(throughYear: number): number {
    const indexed: number[] = []
    const awiI = this.awi(this.indexingYear)
    for (const [year, amount] of this.earnings) {
      if (year > throughYear || year < 1951) continue
      const capped = Math.min(amount, taxableMax(year, this.awi))
      indexed.push(year < this.indexingYear ? (capped * awiI) / this.awi(year) : capped)
    }
    indexed.sort((a, b) => b - a)
    let sum = 0
    for (let i = 0; i < Math.min(35, indexed.length); i++) sum += indexed[i]!
    return Math.floor(sum / 420)
  }

  /** PIA before COLAs, using earnings through `throughYear`. */
  basePia(throughYear: number): number {
    let v = this.baseCache.get(throughYear)
    if (v === undefined) {
      v = piaFromAime(this.aime(throughYear), bendPoints(this.eligibilityYear, this.awi))
      this.baseCache.set(throughYear, v)
    }
    return v
  }

  /**
   * PIA in effect for benefits payable in calendar `year`: earnings through year-1, COLAs payable from
   * eligibilityYear+1 through `year`, each truncated to the dime.
   */
  piaInYear(year: number, cola: ColaFn): number {
    let pia = this.basePia(year - 1)
    for (let y = this.eligibilityYear + 1; y <= year; y++) pia = truncDime(pia * (1 + cola(y)))
    return pia
  }
}

/** Published COLAs, then a fallback for later years. */
export function colaWithFallback(fallback: (year: number) => number): ColaFn {
  return (y) => ssaRules.cola(y) ?? fallback(y)
}

export type StatementCheck = { computed: number; statement: number; diffPct: number; warn: boolean }

/**
 * Cross-check against the statement's FRA estimate [FR-SS-2a]. The statement assumes the latest recorded
 * earnings continue until FRA and quotes the result in dollars of the statement year.
 */
export function statementCrossCheck(
  input: EarningsInput,
  fraEstimateMonthly: number,
  estimateAsOfYear: number,
  awi: AwiFn,
): StatementCheck {
  const lastYear = Math.max(...input.record.map((r) => r.year))
  const last = input.record.find((r) => r.year === lastYear)?.amount ?? 0
  const calc0 = new PiaCalculator({ ...input, projected: [] }, awi)
  const fraYear = ymYear(calc0.age.fraMonth)
  const continued = [...input.record]
  for (let y = lastYear + 1; y < fraYear; y++) continued.push({ year: y, amount: last })
  const calc = new PiaCalculator({ birthDate: input.birthDate, record: continued, projected: [] }, awi)
  let pia = calc.basePia(fraYear - 1)
  for (let y = calc.eligibilityYear + 1; y <= estimateAsOfYear; y++)
    pia = truncDime(pia * (1 + (ssaRules.cola(y) ?? 0)))
  const diffPct = fraEstimateMonthly > 0 ? (pia - fraEstimateMonthly) / fraEstimateMonthly : 0
  return { computed: pia, statement: fraEstimateMonthly, diffPct, warn: Math.abs(diffPct) > 0.02 }
}
