// South Carolina individual income tax [§3.7]. Act 110 of 2026 (H.4216): federal AGI is the starting point,
// the SC income adjusted deduction (SCIAD) replaces the federal standard deduction, and rates are 1.99% to $30,000
// and 5.21% minus $966 above. Subtractions from existing law: taxable Social Security (12-6-1120), the retirement
// income deduction and age-65 deduction (12-6-1170), and 44% of net long-term capital gain (12-6-1150).
import { type FilingStatus, scRules } from '../rules/tables.ts'

export type ScTaxInput = {
  year: number
  status: FilingStatus
  priceFactor: number
  federalAgi: number
  taxableSocialSecurity: number
  ltcg: number
  /** Per person: qualified retirement income (IRA/401(k)/annuity distributions) and whether 65+ at year end. */
  people: { retirementIncome: number; is65: boolean }[]
}

export type ScTaxResult = {
  subtractions: number
  sciad: number
  taxableIncome: number
  tax: number
}

export function scIncomeAdjustedDeduction(
  agi: number,
  status: FilingStatus,
  s: ReturnType<typeof scRules.params>['value']['sciad'],
) {
  const fraction = Math.max(0, agi - s.phaseoutStart[status]) / s.phaseoutDenominator[status]
  if (fraction >= 1) return 0
  // Reductions are rounded to the next lowest ten dollars (Act 110 sec. 3).
  const reduction = Math.floor((s.amount[status] * fraction) / 10) * 10
  return s.amount[status] - reduction
}

export function scTax(i: ScTaxInput): ScTaxResult {
  const p = scRules.params(i.year, i.priceFactor).value
  let personal = 0
  for (const person of i.people) {
    const cap = person.is65 ? p.retirementDeduction.age65 : p.retirementDeduction.under65
    const retirement = Math.min(Math.max(0, person.retirementIncome), cap)
    personal += retirement
    if (person.is65) personal += Math.max(0, p.age65Deduction - retirement)
  }
  const ssSub = p.socialSecurityExempt ? i.taxableSocialSecurity : 0
  const capGainSub = p.capitalGainDeductionRate * Math.max(0, i.ltcg)
  const subtractions = ssSub + capGainSub + personal
  const sciad = scIncomeAdjustedDeduction(i.federalAgi, i.status, p.sciad)
  const taxableIncome = Math.max(0, i.federalAgi - subtractions - sciad)
  const r = p.rates
  const tax = taxableIncome < r.bracket ? taxableIncome * r.lowRate : taxableIncome * r.highRate - r.highSubtract
  return { subtractions, sciad, taxableIncome, tax: Math.max(0, tax) }
}
