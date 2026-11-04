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

export function federalTax(i: FederalTaxInput, params?: FederalParams): FederalTaxResult {
  const fp = params ?? federalRules.params(i.year, i.priceFactor).value
  const st = i.status
  const wages = i.wagesByPerson.reduce((a, b) => a + b, 0)
  const se = i.seByPerson.reduce((a, b) => a + b, 0)
  const pay = payroll(i)
  const pref = i.qualifiedDividends + Math.max(0, i.ltcg)
  const agiExSs = wages + se - pay.halfSe + i.ordinary + i.investmentOrdinary + pref
  const taxableSs = taxableSocialSecurity(i.socialSecurity, agiExSs + i.taxExemptInterest, st)
  const agi = agiExSs + taxableSs
  const magi = agi + i.taxExemptInterest
  const senior = seniorDeduction(i.year, i.count65, magi, st)
  const deduction = fp.standardDeduction[st] + fp.additional65[st] * i.count65 + senior
  const taxableIncome = Math.max(0, agi - deduction)
  const prefTaxable = Math.min(pref, taxableIncome)
  const ordinaryTaxable = taxableIncome - prefTaxable
  const ordinaryTax = bracketTax(ordinaryTaxable, fp.brackets[st])
  const [zeroTop, fifteenTop] = fp.ltcg[st]
  const at0 = Math.max(0, Math.min(taxableIncome, zeroTop) - ordinaryTaxable)
  const at15 = Math.max(0, Math.min(taxableIncome, fifteenTop) - Math.max(ordinaryTaxable, zeroTop))
  const at20 = Math.max(0, prefTaxable - at0 - at15)
  const capitalGainsTax = 0.15 * at15 + 0.2 * at20
  const nii = i.investmentOrdinary + pref
  const niit = federalRules.niit.rate * Math.max(0, Math.min(nii, magi - federalRules.niit.threshold[st]))
  const incomeTax = ordinaryTax + capitalGainsTax + niit
  return {
    agi,
    magi,
    provisionalIncome: agiExSs + i.taxExemptInterest + i.socialSecurity / 2,
    taxableSocialSecurity: taxableSs,
    deduction,
    seniorDeduction: senior,
    taxableIncome,
    ordinaryTaxable,
    ordinaryTax,
    capitalGainsTax,
    niit,
    incomeTax,
    payrollTax: pay.tax,
    total: incomeTax + pay.tax,
    marginalRate: marginalRate(ordinaryTaxable, fp.brackets[st]),
  }
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
