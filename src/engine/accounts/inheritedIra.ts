// Inherited IRAs [FR-ACC-2, FR-WD-2, §3.9]. Designated beneficiaries: empty by Dec 31 of the 10th year after the
// owner's death. Traditional accounts whose owner died on or after the required beginning date (April 1 after the
// RMD-age year) also need annual RMDs in years 1-9, using the longer of the beneficiary's single life expectancy
// (age in the year after death, reduced by 1 each year) or the owner's remaining single life expectancy. Eligible
// designated beneficiaries stretch over their life expectancy with no 10-year deadline. Roth: no annual RMDs.
// IRS final regulations (2024), Pub 590-B.
import { parseDate } from '../core/dates.ts'
import { rmdRules } from '../rules/tables.ts'
import { requiredBeginningYear } from './rmd.ts'

export type InheritedSpec = {
  flavor: 'traditional' | 'roth'
  decedentBirthDate: string
  decedentDeathDate: string
  beneficiaryBirthDate: string
  beneficiaryClass: 'designated' | 'eligible_designated'
}

export type InheritedRules = {
  /** Last year the account may hold a balance (null for an eligible designated stretch). */
  deadlineYear: number | null
  annualRmd: boolean
  firstRmdYear: number
  /** Divisor for the first RMD year; reduced by 1 each later year. */
  initialDivisor: number
}

export function inheritedRules(s: InheritedSpec): InheritedRules {
  const death = parseDate(s.decedentDeathDate)
  const deathYear = death.year
  const firstRmdYear = deathYear + 1
  const benAge = firstRmdYear - parseDate(s.beneficiaryBirthDate).year
  const decAge = deathYear - parseDate(s.decedentBirthDate).year
  const benLife = rmdRules.singleLife(benAge)
  // Owner's remaining life: single life at the owner's age in the year of death, minus 1 for the next year.
  const ownerLife = Math.max(1, rmdRules.singleLife(decAge) - 1)
  const rbdYear = requiredBeginningYear(s.decedentBirthDate)
  const diedAfterRbd = deathYear > rbdYear || (deathYear === rbdYear && death.month >= 4)
  if (s.beneficiaryClass === 'eligible_designated') {
    return {
      deadlineYear: null,
      // Stretch payouts are required for traditional and Roth alike.
      annualRmd: true,
      firstRmdYear,
      initialDivisor: diedAfterRbd ? Math.max(benLife, ownerLife) : benLife,
    }
  }
  return {
    deadlineYear: deathYear + 10,
    annualRmd: s.flavor === 'traditional' && diedAfterRbd,
    firstRmdYear,
    initialDivisor: diedAfterRbd ? Math.max(benLife, ownerLife) : benLife,
  }
}

/** Minimum required withdrawal in `year` given the prior year-end balance. */
export function inheritedRequired(r: InheritedRules, year: number, priorYearEndBalance: number): number {
  if (priorYearEndBalance <= 0) return 0
  if (r.deadlineYear !== null && year >= r.deadlineYear) return priorYearEndBalance
  if (!r.annualRmd || year < r.firstRmdYear) return 0
  const divisor = r.initialDivisor - (year - r.firstRmdYear)
  return divisor <= 1 ? priorYearEndBalance : priorYearEndBalance / divisor
}

/**
 * Scheduled withdrawal for the Even and Back-loaded schedules. Even spreads the balance over the remaining years
 * (never below the RMD). Back-loaded takes only what is required. Bracket-aware is solved by the withdrawal
 * strategy and uses `inheritedRequired` as its floor.
 */
export function inheritedScheduled(
  r: InheritedRules,
  schedule: 'even' | 'back_loaded' | 'bracket_aware',
  year: number,
  priorYearEndBalance: number,
): number {
  const required = inheritedRequired(r, year, priorYearEndBalance)
  if (schedule !== 'even' || r.deadlineYear === null) return required
  const remaining = Math.max(1, r.deadlineYear - year + 1)
  return Math.max(required, priorYearEndBalance / remaining)
}
