// Stochastic mortality [FR-LIFE-1, FR-LIFE-2]: death months drawn from the SSA period life table, conditional on
// being alive at the start, with deaths spread evenly within each year of age (linear l(x)). A health age offset
// uses the table as if the person were that many years older.
import { lifeTable } from '../rules/tables.ts'

/** Survivors l at a fractional age (linear between whole ages; 0 past the table). */
function lAt(l: readonly number[], age: number): number {
  if (age <= 0) return l[0]!
  const i = Math.floor(age)
  if (i >= l.length - 1) return 0
  const f = age - i
  return l[i]! * (1 - f) + l[i + 1]! * f
}

/**
 * Months lived from now until death, by inverting the conditional survival curve at quantile u in (0,1).
 * `ageMonths` is the current age in months.
 */
export function monthsUntilDeath(sex: 'male' | 'female', ageMonths: number, ageOffsetYears: number, u: number): number {
  const l = lifeTable.lx(sex)
  const a0 = ageMonths / 12 + ageOffsetYears
  const s0 = lAt(l, a0)
  if (s0 <= 0) return 0
  const target = u * s0
  // Survival is decreasing; bisection on months.
  let lo = 0
  let hi = Math.max(1, Math.ceil((l.length - a0) * 12))
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (lAt(l, a0 + mid / 12) > target) lo = mid
    else hi = mid
  }
  return lo
}

/** Remaining life expectancy in years (curtate by month), for tests and display. */
export function lifeExpectancy(sex: 'male' | 'female', ageYears: number, ageOffsetYears = 0): number {
  const l = lifeTable.lx(sex)
  const a0 = ageYears + ageOffsetYears
  const s0 = lAt(l, a0)
  let sum = 0
  for (let m = 1; m < (l.length - a0) * 12; m++) sum += lAt(l, a0 + m / 12)
  return sum / s0 / 12
}
