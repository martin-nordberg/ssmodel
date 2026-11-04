// Spouse and survivor benefits [FR-SS-3, §3.2].
// Spousal: https://www.ssa.gov/benefits/retirement/planner/applying7.html
// Survivor: https://www.ssa.gov/benefits/survivors/survivorchartred.html ; RIB-LIM: POMS RS 00615.320
import type { SsaAge, YM } from '../core/dates.ts'
import { ssaRules } from '../rules/tables.ts'
import { ownBenefitFactor } from './ownBenefit.ts'

/**
 * The Spouse's PIA from her current monthly benefit and the month she claimed. COLAs are already in the current
 * benefit, so the result is in current dollars. The benefit was rounded down to the dollar, so add half a dollar.
 */
export function piaFromCurrentBenefit(currentMonthly: number, claimed: YM, age: SsaAge): number {
  return (currentMonthly + 0.5) / ownBenefitFactor(claimed, age)
}

/** Spousal reduction: 25/36 of 1% per month for the first 36 months before FRA, 5/12 of 1% per further month. */
export function spousalReduction(monthsEarly: number): number {
  const n = Math.max(0, monthsEarly)
  return (Math.min(36, n) * 25) / 3600 + (Math.max(0, n - 36) * 5) / 1200
}

/**
 * Monthly spousal excess on top of her own benefit, beginning in `start` (the month the worker files; deemed
 * filing). Based on 50% of the worker's PIA, never his delayed credits.
 */
export function spousalExcess(workerPia: number, ownPia: number, start: YM, spouseAge: SsaAge): number {
  const excess = Math.max(0, 0.5 * workerPia - ownPia)
  return excess * (1 - spousalReduction(spouseAge.fraMonth - start))
}

/** Survivor reduction: linear from 0 at survivor FRA to 28.5% at age 60. */
export function survivorReduction(start: YM, survivorAge: SsaAge): number {
  const monthsEarly = survivorAge.survivorFraMonth - start
  if (monthsEarly <= 0) return 0
  const span = survivorAge.survivorFraMonths - 60 * 12
  return (ssaRules.survivorReductionAt60 * Math.min(monthsEarly, span)) / span
}

export type SurvivorInput = {
  /** Deceased worker's PIA (COLA-adjusted to the current year). */
  deceasedPia: number
  deceasedAge: SsaAge
  /** Month the deceased's own benefit started, or null if he never claimed. */
  deceasedClaim: YM | null
  deceasedDeath: YM
  survivorAge: SsaAge
  /** Month the survivor benefit starts. */
  start: YM
}

/**
 * Monthly survivor benefit before rounding. The base is the deceased's actual benefit when he had claimed
 * (including delayed credits), his PIA with credits earned to death if he died after FRA without claiming, or his
 * PIA if he died earlier. RIB-LIM: if he claimed early, the benefit is capped at the larger of his reduced benefit
 * or 82.5% of PIA.
 */
export function survivorBenefit(i: SurvivorInput): number {
  let base: number
  if (i.deceasedClaim !== null && i.deceasedClaim <= i.deceasedDeath) {
    base = i.deceasedPia * ownBenefitFactor(i.deceasedClaim, i.deceasedAge)
  } else if (i.deceasedDeath > i.deceasedAge.fraMonth) {
    base = i.deceasedPia * ownBenefitFactor(i.deceasedDeath, i.deceasedAge)
  } else {
    base = i.deceasedPia
  }
  const claimedEarly = i.deceasedClaim !== null && i.deceasedClaim <= i.deceasedDeath && base < i.deceasedPia
  const reduced = Math.max(base, i.deceasedPia) * (1 - survivorReduction(i.start, i.survivorAge))
  if (claimedEarly) return Math.min(reduced, Math.max(base, 0.825 * i.deceasedPia))
  return Math.min(reduced, base)
}
