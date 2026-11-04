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

export type ScParams = ReturnType<typeof scRules.params>['value']

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

export function scTax(i: ScTaxInput, params?: ScParams): ScTaxResult {
  const p = params ?? scRules.params(i.year, i.priceFactor).value
  const a = i.people[0]
  const b = i.people[1]
  return scEvaluator(i.status, [a?.is65 ?? false, b?.is65 ?? false], p)(i.federalAgi, i.taxableSocialSecurity, i.ltcg, [
    a?.retirementIncome ?? 0,
    b?.retirementIncome ?? 0,
  ])
}

export type ScEvaluator = (
  federalAgi: number,
  taxableSocialSecurity: number,
  ltcg: number,
  retirementIncome: [number, number],
  out?: ScTaxResult,
) => ScTaxResult

/** Per-year SC evaluator for the withdrawal solver; writes into `out` when given. */
export function scEvaluator(status: FilingStatus, is65: [boolean, boolean], p: ScParams): ScEvaluator {
  const s = p.sciad
  const r = p.rates
  return (agi, tss, ltcg, ret, out) => {
    let personal = 0
    for (let k = 0; k < 2; k++) {
      const cap = is65[k] ? p.retirementDeduction.age65 : p.retirementDeduction.under65
      const retirement = Math.min(Math.max(0, ret[k]!), cap)
      personal += retirement
      if (is65[k]) personal += Math.max(0, p.age65Deduction - retirement)
    }
    const subtractions = (p.socialSecurityExempt ? tss : 0) + p.capitalGainDeductionRate * Math.max(0, ltcg) + personal
    const sciad = scIncomeAdjustedDeduction(agi, status, s)
    const taxableIncome = Math.max(0, agi - subtractions - sciad)
    const tax = Math.max(
      0,
      taxableIncome < r.bracket ? taxableIncome * r.lowRate : taxableIncome * r.highRate - r.highSubtract,
    )
    const o = out ?? ({} as ScTaxResult)
    o.subtractions = subtractions
    o.sciad = sciad
    o.taxableIncome = taxableIncome
    o.tax = tax
    return o
  }
}
