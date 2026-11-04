// Month arithmetic and SSA age rules [§3.1]. A YM is an integer month index: year * 12 + (month - 1).
import { ssaRules } from '../rules/tables.ts'

export type YM = number

export const ym = (year: number, month: number): YM => year * 12 + (month - 1)
export const ymYear = (m: YM): number => Math.floor(m / 12)
export const ymMonth = (m: YM): number => (m % 12) + 1

export function parseYM(s: string): YM {
  const [y, m] = s.split('-').map(Number)
  return ym(y!, m!)
}

export function formatYM(m: YM): string {
  return `${ymYear(m)}-${String(ymMonth(m)).padStart(2, '0')}`
}

export type DateParts = { year: number; month: number; day: number }

export function parseDate(s: string): DateParts {
  const [year, month, day] = s.split('-').map(Number)
  return { year: year!, month: month!, day: day! }
}

/** The day before a date: SSA treats an age as attained the day before the birthday. */
export function dayBefore({ year, month, day }: DateParts): DateParts {
  if (day > 1) return { year, month, day: day - 1 }
  const prev = new Date(Date.UTC(year, month - 1, 0))
  return { year: prev.getUTCFullYear(), month: prev.getUTCMonth() + 1, day: prev.getUTCDate() }
}

/** Format an age in months as "62y3m". */
export function formatAge(months: number): string {
  return `${Math.floor(months / 12)}y${months % 12}m`
}

/**
 * SSA age facts for a birth date.
 * - `attainBase`: the month in which age 0 is "attained" (the month of the day before birth); age N months is
 *   attained in month attainBase + N.
 * - Eligibility for retirement benefits requires being 62 throughout the month, so the first month is the month
 *   after attaining 62 unless the age is attained on the 1st (birthdays on the 1st or 2nd).
 * - FRA comes from the table by the year of the adjusted date (Jan 1 births use the prior year).
 */
export class SsaAge {
  readonly attainBase: YM
  readonly fraMonths: number
  readonly firstEligible: YM
  readonly birth: DateParts

  constructor(birthDate: string) {
    this.birth = parseDate(birthDate)
    const adj = dayBefore(this.birth)
    this.attainBase = ym(adj.year, adj.month)
    this.fraMonths = ssaRules.fraMonths(adj.year)
    this.firstEligible = this.attainBase + 62 * 12 + (adj.day === 1 ? 0 : 1)
  }

  /** Month in which the given age (in months) is attained. */
  attainMonth(ageMonths: number): YM {
    return this.attainBase + ageMonths
  }

  get fraMonth(): YM {
    return this.attainMonth(this.fraMonths)
  }

  get age70Month(): YM {
    return this.attainMonth(70 * 12)
  }

  /** SSA age in whole months attained by the given month. */
  ageAt(m: YM): number {
    return m - this.attainBase
  }

  /** Ordinary age (by birthday) at the end of a calendar year, used for RMD and Medicare-at-65 tests. */
  calendarAgeInYear(year: number): number {
    return year - this.birth.year
  }

  /** Medicare eligibility starts the first of the birthday month (the prior month for 1st-of-month births). */
  get medicareMonth(): YM {
    return this.attainMonth(65 * 12)
  }
}

/**
 * Quarterly claiming candidates from 62y0m to 70y0m relative to the birth month [FR-SIM-5]. The 62y0m point
 * moves to the first eligible month, and months before `notBefore` (the base date) are dropped. FRA (a whole
 * number of years for births after 1959) falls on the grid.
 */
export function claimCandidates(age: SsaAge, notBefore: YM): YM[] {
  const out: YM[] = []
  for (let k = 62 * 12; k <= 70 * 12; k += 3) {
    let m = age.attainMonth(k)
    if (m < age.firstEligible) m = age.firstEligible
    if (m < notBefore) continue
    if (out.at(-1) !== m) out.push(m)
  }
  if (out.length === 0 && age.age70Month >= notBefore) out.push(Math.max(notBefore, age.firstEligible))
  return out
}
