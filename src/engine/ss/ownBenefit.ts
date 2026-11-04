// Retirement benefit factors by claiming month [FR-SS-1].
// Early: 5/9 of 1% per month for the first 36 months before FRA, 5/12 of 1% per further month.
// Delayed: 2/3 of 1% per month after FRA, up to age 70 (born 1943+).
// https://www.ssa.gov/benefits/retirement/planner/agereduction.html , .../delayret.html
import type { SsaAge, YM } from '../core/dates.ts'

export function earlyReduction(monthsEarly: number): number {
  const n = Math.max(0, monthsEarly)
  return (Math.min(36, n) * 5) / 900 + (Math.max(0, n - 36) * 5) / 1200
}

export function delayedCredit(monthsLate: number): number {
  return (Math.max(0, monthsLate) * 2) / 300
}

/**
 * Benefit as a fraction of PIA for entitlement in `claim`. `withheldMonths` are months before FRA whose benefits
 * were withheld under the earnings test; at FRA they stop counting as early months (adjustment of the reduction
 * factor).
 */
export function ownBenefitFactor(claim: YM, age: SsaAge, withheldMonths = 0): number {
  const early = age.fraMonth - claim
  if (early > 0) return 1 - earlyReduction(Math.max(0, early - withheldMonths))
  const late = Math.min(claim, age.age70Month) - age.fraMonth
  return 1 + delayedCredit(late)
}

/** Monthly benefit rounded down to the whole dollar. */
export function monthlyBenefit(pia: number, factor: number): number {
  return Math.floor(pia * factor + 1e-9)
}
