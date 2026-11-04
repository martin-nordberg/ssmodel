// Lifetime RMDs for owners [§3.4]: from the year the owner reaches the SECURE 2.0 RMD age (73 for 1951-59 births,
// 75 for 1960+), prior year-end balance / Uniform Lifetime divisor for the age reached in the year. The first RMD
// may legally be deferred to April 1 of the next year; the model takes it in the year it is due.
import { parseDate } from '../core/dates.ts'
import { rmdRules } from '../rules/tables.ts'

export function rmdStartYear(ownerBirthDate: string): number {
  const by = parseDate(ownerBirthDate).year
  return by + rmdRules.rmdAge(by)
}

export function lifetimeRmd(ownerBirthDate: string, year: number, priorYearEndBalance: number): number {
  const by = parseDate(ownerBirthDate).year
  if (year < by + rmdRules.rmdAge(by) || priorYearEndBalance <= 0) return 0
  return priorYearEndBalance / rmdRules.uniformDivisor(year - by)
}

/** Required beginning date year: April 1 of the year after the owner reaches RMD age. */
export function requiredBeginningYear(ownerBirthDate: string): number {
  return rmdStartYear(ownerBirthDate) + 1
}
