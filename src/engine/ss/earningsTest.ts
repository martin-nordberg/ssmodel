// Retirement earnings test [§3.1]. Before the FRA year: $1 withheld per $2 of earnings above the lower limit.
// In the calendar year FRA is reached: $1 per $3 above the higher limit, counting only earnings before the FRA
// month. Benefits are withheld in whole months. https://www.ssa.gov/benefits/retirement/planner/whileworking.html

export type EarningsTestInput = {
  /** Wages plus net self-employment earnings for the calendar year. */
  annualEarnings: number
  /** Months in this year for which benefits are payable and the beneficiary is under FRA. */
  entitledMonthsBeforeFra: number
  /** True if FRA is reached during this calendar year. */
  fraYear: boolean
  /** Months of this year before the FRA month (for the FRA-year test). */
  monthsBeforeFra: number
  limits: { underFra: number; fraYear: number }
  /** Monthly benefits payable on the worker's record (worker plus auxiliaries), which absorb withholding. */
  monthlyOnRecord: number
}

export type EarningsTestResult = { excess: number; withholding: number; monthsWithheld: number }

export function earningsTest(i: EarningsTestInput): EarningsTestResult {
  if (i.entitledMonthsBeforeFra <= 0 || i.monthlyOnRecord <= 0) return { excess: 0, withholding: 0, monthsWithheld: 0 }
  let excess: number
  let withholding: number
  if (i.fraYear) {
    // Earnings are assumed to be spread evenly through the year.
    const before = (i.annualEarnings * i.monthsBeforeFra) / 12
    excess = Math.max(0, before - i.limits.fraYear)
    withholding = excess / 3
  } else {
    excess = Math.max(0, i.annualEarnings - i.limits.underFra)
    withholding = excess / 2
  }
  const monthsWithheld = Math.min(
    i.entitledMonthsBeforeFra,
    Math.max(0, Math.ceil(withholding / i.monthlyOnRecord - 1e-9)),
  )
  return { excess, withholding, monthsWithheld }
}
