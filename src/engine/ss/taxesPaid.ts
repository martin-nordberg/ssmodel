// Employee-share Social Security (OASDI) tax paid over an earnings record. Record amounts are already capped at
// the taxable maximum, so each year is simply amount x that year's employee rate. Self-employment years are taxed
// at the employee rate too (the employer-equivalent half is excluded by definition of "employee share").
import { ssaRules } from '../rules/tables.ts'

export function employeeSsTaxPaid(record: readonly { year: number; amount: number }[]): number {
  let total = 0
  for (const r of record) total += r.amount * ssaRules.oasdiEmployeeRate(r.year)
  return total
}
