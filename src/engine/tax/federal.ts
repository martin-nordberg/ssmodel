// Federal income and payroll tax for one household-year [§3.7, FR-TAX-1, FR-TAX-2, FR-TAX-4].
// Sources: Rev. Proc. 2025-32 (2026 amounts); Pub 915 (taxation of benefits); P.L. 119-21 sec. 70103 (senior
// deduction); IRC 1411 (NIIT); IRC 1401/3101 (SE and FICA).
import { type FederalParams, type FilingStatus, federalRules } from '../rules/tables.ts'

export type FederalTaxInput = {
  year: number
  status: FilingStatus
  /** Ratio of the price level in `year` to that of the latest table year (for projected thresholds). */
  priceFactor: number
  /** Number of filers aged 65 or older at the end of the year (0-2). */
  count65: number
  /** OASDI taxable maximum for the year (payroll tax cap). */
  taxableMax: number
  /** W-2 wages per earner (FICA applies per person). */
  wagesByPerson: number[]
  /** Net self-employment profit per earner. */
  seByPerson: number[]
  /** Ordinary income other than wages/SE: IRA and 401(k) distributions, conversions, taxable annuity, etc. */
  ordinary: number
  /** Taxable interest and net rental income (ordinary, and also net investment income). */
  investmentOrdinary: number
  qualifiedDividends: number
  /** Net long-term capital gain (losses are ignored). */
  ltcg: number
  taxExemptInterest: number
  /** Gross Social Security benefits received in the year. */
  socialSecurity: number
}

export type FederalTaxResult = {
  agi: number
  /** MAGI for IRMAA: AGI plus tax-exempt interest. */
  magi: number
  provisionalIncome: number
  taxableSocialSecurity: number
  deduction: number
  seniorDeduction: number
  taxableIncome: number
  ordinaryTaxable: number
  ordinaryTax: number
  capitalGainsTax: number
  niit: number
  incomeTax: number
  /** Employee FICA plus SE tax plus additional Medicare tax. */
  payrollTax: number
  total: number
  /** Marginal ordinary rate at the final taxable income. */
  marginalRate: number
}

/** Taxable portion of Social Security benefits (Pub 915 worksheet 1). */
export function taxableSocialSecurity(ss: number, otherIncome: number, status: FilingStatus): number {
  if (ss <= 0) return 0
  const [base1, base2] = federalRules.ssTaxation[status]
  const pi = otherIncome + ss / 2
  if (pi <= base1) return 0
  if (pi <= base2) return Math.min(0.5 * ss, 0.5 * (pi - base1))
  return Math.min(0.85 * ss, 0.85 * (pi - base2) + Math.min(0.5 * ss, 0.5 * (base2 - base1)))
}

export function bracketTax(taxable: number, brackets: [number, number][]): number {
  let tax = 0
  for (let i = 0; i < brackets.length; i++) {
    const [lo, rate] = brackets[i]!
    const hi = i + 1 < brackets.length ? brackets[i + 1]![0] : Number.POSITIVE_INFINITY
    if (taxable <= lo) break
    tax += (Math.min(taxable, hi) - lo) * rate
  }
  return tax
}

export function marginalRate(taxable: number, brackets: [number, number][]): number {
  let rate = brackets[0]![1]
  for (const [lo, r] of brackets) if (taxable > lo) rate = r
  return rate
}

/** Top of the bracket with the given rate (taxable-income terms). */
export function bracketTop(rate: number, brackets: [number, number][]): number {
  const i = brackets.findIndex(([, r]) => r === rate)
  if (i < 0 || i + 1 >= brackets.length) return Number.POSITIVE_INFINITY
  return brackets[i + 1]![0]
}

export function seniorDeduction(year: number, count65: number, magi: number, status: FilingStatus): number {
  const sd = federalRules.seniorDeduction
  if (year < sd.firstYear || year > sd.lastYear || count65 <= 0) return 0
  const reduction = sd.phaseoutRate * Math.max(0, magi - sd.phaseoutStart[status])
  return count65 * Math.max(0, sd.amount - reduction)
}

function payroll(i: FederalTaxInput): { tax: number; halfSe: number } {
  const p = federalRules.payroll
  let tax = 0
  let halfSe = 0
  let medicareWages = 0
  const people = Math.max(i.wagesByPerson.length, i.seByPerson.length)
  for (let k = 0; k < people; k++) {
    const w = i.wagesByPerson[k] ?? 0
    const se = (i.seByPerson[k] ?? 0) * p.seNetFactor
    tax += Math.min(w, i.taxableMax) * p.oasdiRate + w * p.medicareRate
    const seOasdiBase = Math.max(0, Math.min(se, i.taxableMax - w))
    const seTax = seOasdiBase * p.oasdiRate * 2 + se * p.medicareRate * 2
    tax += seTax
    halfSe += seTax / 2
    medicareWages += w + se
  }
  tax += p.additionalMedicare.rate * Math.max(0, medicareWages - p.additionalMedicare.threshold[i.status])
  return { tax, halfSe }
}

/** Evaluates tax for extra income; writes into `out` when given (to avoid allocation in hot loops). */
export type FederalEvaluator = (extraOrdinary: number, extraLtcg: number, out?: FederalTaxResult) => FederalTaxResult

/**
 * Precomputes everything in a household-year that does not depend on discretionary withdrawals, and returns a
 * function of the extra ordinary income and long-term gain. The withdrawal solver calls it many times a year.
 */
export function federalEvaluator(i: FederalTaxInput, params?: FederalParams): FederalEvaluator {
  const fp = params ?? federalRules.params(i.year, i.priceFactor).value
  const st = i.status
  const brackets = fp.brackets[st]
  const [zeroTop, fifteenTop] = fp.ltcg[st]
  let wages = 0
  for (const w of i.wagesByPerson) wages += w
  let se = 0
  for (const x of i.seByPerson) se += x
  const pay = payroll(i)
  const baseDeduction = fp.standardDeduction[st] + fp.additional65[st] * i.count65
  const niitRate = federalRules.niit.rate
  const niitThreshold = federalRules.niit.threshold[st]
  const fixedAgi = wages + se - pay.halfSe + i.ordinary + i.investmentOrdinary + i.qualifiedDividends
  return (extraOrdinary, extraLtcg, out) => {
    const pref = i.qualifiedDividends + Math.max(0, i.ltcg + extraLtcg)
    const agiExSs = fixedAgi + extraOrdinary + Math.max(0, i.ltcg + extraLtcg)
    const taxableSs = taxableSocialSecurity(i.socialSecurity, agiExSs + i.taxExemptInterest, st)
    const agi = agiExSs + taxableSs
    const magi = agi + i.taxExemptInterest
    const senior = seniorDeduction(i.year, i.count65, magi, st)
    const deduction = baseDeduction + senior
    const taxableIncome = Math.max(0, agi - deduction)
    const prefTaxable = Math.min(pref, taxableIncome)
    const ordinaryTaxable = taxableIncome - prefTaxable
    const ordinaryTax = bracketTax(ordinaryTaxable, brackets)
    const at0 = Math.max(0, Math.min(taxableIncome, zeroTop) - ordinaryTaxable)
    const at15 = Math.max(0, Math.min(taxableIncome, fifteenTop) - Math.max(ordinaryTaxable, zeroTop))
    const at20 = Math.max(0, prefTaxable - at0 - at15)
    const capitalGainsTax = 0.15 * at15 + 0.2 * at20
    const nii = i.investmentOrdinary + pref
    const niit = niitRate * Math.max(0, Math.min(nii, magi - niitThreshold))
    const incomeTax = ordinaryTax + capitalGainsTax + niit
    const r = out ?? ({} as FederalTaxResult)
    r.agi = agi
    r.magi = magi
    r.provisionalIncome = agiExSs + i.taxExemptInterest + i.socialSecurity / 2
    r.taxableSocialSecurity = taxableSs
    r.deduction = deduction
    r.seniorDeduction = senior
    r.taxableIncome = taxableIncome
    r.ordinaryTaxable = ordinaryTaxable
    r.ordinaryTax = ordinaryTax
    r.capitalGainsTax = capitalGainsTax
    r.niit = niit
    r.incomeTax = incomeTax
    r.payrollTax = pay.tax
    r.total = incomeTax + pay.tax
    r.marginalRate = out ? 0 : marginalRate(ordinaryTaxable, brackets)
    return r
  }
}

export function federalTax(i: FederalTaxInput, params?: FederalParams): FederalTaxResult {
  return federalEvaluator(i, params)(0, 0)
}

export function emptyFederalInput(year: number, status: FilingStatus): FederalTaxInput {
  return {
    year,
    status,
    priceFactor: 1,
    count65: 0,
    taxableMax: 0,
    wagesByPerson: [],
    seByPerson: [],
    ordinary: 0,
    investmentOrdinary: 0,
    qualifiedDividends: 0,
    ltcg: 0,
    taxExemptInterest: 0,
    socialSecurity: 0,
  }
}
