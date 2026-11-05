// Federal itemized deductions [FR-TAX-6, D: Q-TAX-5]. Sources (P.L. 119-21, OBBBA): IRC 164(b)(7) SALT cap and
// phase-down; IRC 163(h)(3)(F) $750,000 acquisition-debt limit; IRC 213 7.5%-of-AGI medical floor; IRC 170(b)(1)(I)
// 0.5%-of-AGI charitable floor (from 2026); IRC 68 2/37 limitation for the 37% bracket (from 2026).
import { federalRules } from '../rules/tables.ts'

export type ItemizedInput = {
  /** State and local property tax paid (the home). */
  propertyTax: number
  /** Deductible mortgage interest (already limited to the $750,000 acquisition-debt share). */
  mortgageInterest: number
  /** Medical and dental costs paid, not reimbursed or paid by an HSA. */
  medical: number
  /** Cash gifts to charity. */
  charity: number
}

export const NO_ITEMIZED: ItemizedInput = { propertyTax: 0, mortgageInterest: 0, medical: 0, charity: 0 }

const rules = () => federalRules.itemized

/** SALT cap for the year at the given MAGI: the OBBBA schedule through 2029, then $10,000. */
export function saltCap(year: number, magi: number): number {
  const r = rules()
  const row = (r.saltCap as Record<string, number[]>)[String(year)]
  if (!row) return r.saltCapAfter
  const [cap = 0, threshold = 0] = row
  return Math.max(r.saltFloor, cap - r.saltPhaseRate * Math.max(0, magi - threshold))
}

/** Share of a year's interest that is deductible when the balance exceeds the acquisition-debt limit. */
export function deductibleInterestShare(balance: number): number {
  const limit = rules().mortgageDebtLimit
  return balance <= limit ? 1 : limit / balance
}

export type ItemizedResult = {
  salt: number
  mortgageInterest: number
  medical: number
  charity: number
  /** Reduction from the 2/37 limitation. */
  limitation: number
  total: number
}

/**
 * Itemized deductions for the year. `topBracketStart` is the taxable income where the 37% bracket begins and
 * `seniorDeduction` the OBBBA senior deduction (taxable income before this limitation is AGI − itemized − senior).
 */
export function itemizedDeduction(
  year: number,
  agi: number,
  magi: number,
  stateIncomeTax: number,
  it: ItemizedInput,
  topBracketStart: number,
  seniorDeduction: number,
  out?: ItemizedResult,
): ItemizedResult {
  const r = rules()
  const salt = Math.min(saltCap(year, magi), Math.max(0, stateIncomeTax) + it.propertyTax)
  const medical = Math.max(0, it.medical - r.medicalFloor * agi)
  const charity = Math.max(0, it.charity - (year >= r.charityFloor.firstYear ? r.charityFloor.rate * agi : 0))
  const before = salt + it.mortgageInterest + medical + charity
  // IRC 68 (2026+): reduce by 2/37 of the lesser of the deductions and the taxable income (before this section,
  // increased by the deductions) above the start of the 37% bracket.
  const limitation =
    year >= r.topBracketLimit.firstYear
      ? r.topBracketLimit.fraction * Math.min(before, Math.max(0, agi - seniorDeduction - topBracketStart))
      : 0
  const res = out ?? ({} as ItemizedResult)
  res.salt = salt
  res.mortgageInterest = it.mortgageInterest
  res.medical = medical
  res.charity = charity
  res.limitation = limitation
  res.total = before - limitation
  return res
}
